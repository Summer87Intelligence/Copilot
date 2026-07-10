import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { parseAndValidateJsonBody } from "@/lib/api/parse-and-validate-json-body";
import {
  requireCopilotModuleAccess,
  requireCopilotModuleWriteAccess,
} from "@/lib/auth/copilot-module-api-auth";
import { classifyBankAccount } from "@/lib/bank-movements/bank-account-scope";
import {
  confirmIncomeMatch,
  rejectIncomeMatch,
} from "@/lib/bank-movements/bank-income-matching-service.server";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteContext = { params: Promise<{ id: string }> };

const incomeMatchBodySchema = z
  .object({
    action: z.enum(["confirm", "reject"]),
    client_id: z.string().uuid(),
    billing_concept_id: z.union([z.string().uuid(), z.null()]).optional(),
    confidence: z.union([z.enum(["high", "medium", "low"]), z.null()]).optional(),
    score: z.union([z.number().finite(), z.null()]).optional(),
    reasons: z.array(z.string().max(200)).max(20).optional(),
    remember_alias: z.boolean().optional(),
    alias_text: z.union([z.string().trim().max(200), z.null()]).optional(),
  })
  .strict();

/** Devuelve el match confirmado actual del movimiento (si existe). */
export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireCopilotModuleAccess(request, "bank_movements");
  if (!auth.ok) return auth.response;
  const { supabase, tenantCompanyId } = auth.ctx;
  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Movimiento inválido." }, { status: 400 });
  }

  const { data } = await supabase
    .from("bank_income_matches")
    .select("*")
    .eq("workspace_id", tenantCompanyId)
    .eq("bank_movement_id", id)
    .eq("match_status", "confirmed")
    .maybeSingle();

  return NextResponse.json({ ok: true, match: data ?? null });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const parsed = await parseAndValidateJsonBody(request, incomeMatchBodySchema);
  if (!parsed.ok) return parsed.response;

  const auth = await requireCopilotModuleWriteAccess(request, "bank_movements");
  if (!auth.ok) return auth.response;
  const { supabase, tenantCompanyId, appUser } = auth.ctx;
  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Movimiento inválido." }, { status: 400 });
  }

  // Cargar el movimiento y validar alcance (ingreso + cuenta EASY).
  const { data: movement } = await supabase
    .from("bank_movements")
    .select("id, description, direction, account_label")
    .eq("workspace_id", tenantCompanyId)
    .eq("id", id)
    .maybeSingle();
  if (!movement) {
    return NextResponse.json({ ok: false, error: "Movimiento no encontrado." }, { status: 404 });
  }
  if (movement.direction !== "inflow") {
    return NextResponse.json(
      { ok: false, error: "Solo se asocian movimientos de ingreso." },
      { status: 422 }
    );
  }
  if (classifyBankAccount(movement.account_label) !== "business") {
    return NextResponse.json(
      { ok: false, error: "Este movimiento no pertenece a una cuenta habilitada." },
      { status: 422 }
    );
  }

  // Validar que el cliente pertenece al workspace.
  const { data: client } = await supabase
    .from("proto_companies")
    .select("id")
    .eq("id", parsed.data.client_id)
    .eq("workspace_company_id", tenantCompanyId)
    .maybeSingle();
  if (!client) {
    return NextResponse.json({ ok: false, error: "Cliente no encontrado." }, { status: 404 });
  }

  try {
    if (parsed.data.action === "reject") {
      const result = await rejectIncomeMatch({
        supabase,
        workspaceId: tenantCompanyId,
        userId: appUser.id,
        movementId: id,
        clientId: parsed.data.client_id,
      });
      return NextResponse.json({ ok: true, ...result, status: "rejected" });
    }

    const result = await confirmIncomeMatch({
      supabase,
      workspaceId: tenantCompanyId,
      userId: appUser.id,
      movement: { id, description: movement.description ?? "" },
      clientId: parsed.data.client_id,
      billingConceptId: parsed.data.billing_concept_id ?? null,
      confidence: parsed.data.confidence ?? null,
      score: parsed.data.score ?? null,
      reasons: parsed.data.reasons ?? [],
      rememberAlias: parsed.data.remember_alias ?? false,
      aliasText: parsed.data.alias_text ?? null,
    });
    return NextResponse.json({ ok: true, ...result, status: "confirmed" });
  } catch {
    return NextResponse.json({ ok: false, error: "No se pudo guardar la asociación." }, { status: 500 });
  }
}
