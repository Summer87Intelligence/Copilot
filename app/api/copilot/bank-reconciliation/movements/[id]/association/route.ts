import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { getActiveIdentificationForMovement } from "@/lib/bank/canonical/client-identification-repository.server";
import type { BankMovement } from "@/lib/bank-movements/bank-movements-types";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/copilot/bank-reconciliation/movements/[id]/association
 *
 * FASE BANK-SIMPLE-MOVEMENT-TO-CLIENT-RESET-001 — datos mínimos para el panel
 * simple de asociación movimiento→cliente: el movimiento y, si existe, la
 * identificación activa con el nombre del cliente. Solo lectura.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false as const, error: "Identificador inválido." }, { status: 400 });
  }

  const auth = await requireCopilotModuleAccess(request, "bank_movements");
  if (!auth.ok) return auth.response;
  const { supabase, tenantCompanyId } = auth.ctx;

  const { data: movement, error: movementError } = await supabase
    .from("bank_movements")
    .select("*")
    .eq("workspace_id", tenantCompanyId)
    .eq("id", id)
    .maybeSingle();
  if (movementError) {
    return NextResponse.json({ ok: false as const, error: "No se pudo cargar el movimiento." }, { status: 500 });
  }
  if (!movement) {
    return NextResponse.json({ ok: false as const, error: "Movimiento no encontrado." }, { status: 404 });
  }

  const identification = await getActiveIdentificationForMovement(supabase, tenantCompanyId, id);
  let clientName: string | null = null;
  if (identification) {
    const { data: client } = await supabase
      .from("proto_companies")
      .select("name")
      .eq("id", identification.clientCompanyId)
      .maybeSingle();
    clientName = (client as { name: string } | null)?.name ?? null;
  }

  return NextResponse.json({
    ok: true as const,
    data: {
      movement: movement as BankMovement,
      identification: identification
        ? {
            id: identification.id,
            clientCompanyId: identification.clientCompanyId,
            clientName,
            status: identification.status,
            confirmedAt: identification.confirmedAt,
          }
        : null,
    },
  });
}
