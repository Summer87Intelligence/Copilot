import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { classifyBankAccount } from "@/lib/bank-movements/bank-account-scope";
import { suggestIncomeCandidatesForMovement } from "@/lib/bank-movements/bank-income-matching-service.server";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteContext = { params: Promise<{ id: string }> };

/** Candidatos de cliente/concepto para un movimiento de ingreso (inflow). */
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireCopilotModuleAccess(request, "bank_movements");
  if (!auth.ok) return auth.response;
  const { supabase, tenantCompanyId } = auth.ctx;
  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Movimiento inválido." }, { status: 400 });
  }

  const { data: movement, error } = await supabase
    .from("bank_movements")
    .select("id, description, amount, currency, direction, movement_date, account_label")
    .eq("workspace_id", tenantCompanyId)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: "No se pudo cargar el movimiento." }, { status: 500 });
  }
  if (!movement) {
    return NextResponse.json({ ok: false, error: "Movimiento no encontrado." }, { status: 404 });
  }

  // Solo ingresos, y nunca desde cuentas fuera de EASY.
  if (movement.direction !== "inflow") {
    return NextResponse.json({ ok: true, candidates: [], reason: "not_inflow" });
  }
  if (classifyBankAccount(movement.account_label) !== "business") {
    return NextResponse.json({ ok: true, candidates: [], reason: "account_not_allowed" });
  }

  const candidates = await suggestIncomeCandidatesForMovement(supabase, tenantCompanyId, {
    id: movement.id,
    description: movement.description ?? "",
    amount: Number(movement.amount ?? 0),
    currency: movement.currency === "USD" ? "USD" : "UYU",
    movement_date: String(movement.movement_date ?? "").slice(0, 10),
    direction: movement.direction,
  });

  return NextResponse.json({ ok: true, candidates });
}
