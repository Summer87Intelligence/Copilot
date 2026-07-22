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
 * FASE BANK-SIMPLE-FLOW-COMPLETION-001 — datos mínimos para el panel simple
 * de asociación movimiento→cliente. Solo lectura. Un movimiento puede estar
 * "asociado" por dos vías reales: una identificación de
 * `bank_movement_client_identifications`, O un link financiero real
 * (`bank_movement_reconciliation_links`) creado por el flujo de recibo —
 * ese caso NUNCA tiene fila de identificación propia
 * (`confirmBatchClientIdentification` se niega a crear una redundante). Sin
 * este fallback, un movimiento ya conciliado financieramente aparecía
 * "Asociado" en la lista pero "Sin cliente" en este panel — mismo bug de
 * "estados distintos para el mismo movimiento" que esta fase existe para
 * eliminar. Cuando el origen es un link financiero, el panel debe mostrar
 * el cliente en solo lectura (Cambiar/Revocar no aplican: no hay
 * identificación que reasignar o revocar, y esta pantalla nunca toca
 * conciliación financiera real).
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
  let clientCompanyId: string | null = identification?.clientCompanyId ?? null;
  let source: "identification" | "financial_link" | null = identification ? "identification" : null;

  if (!clientCompanyId) {
    const { data: link } = await supabase
      .from("bank_movement_reconciliation_links")
      .select("target_id, target_type")
      .eq("workspace_id", tenantCompanyId)
      .eq("bank_movement_id", id)
      .eq("target_type", "receipt")
      .is("archived_at", null)
      .maybeSingle();
    const receiptId = (link as { target_id: string | null } | null)?.target_id ?? null;
    if (receiptId) {
      const { data: receipt } = await supabase
        .from("proto_receipts")
        .select("company_id")
        .eq("id", receiptId)
        .maybeSingle();
      const linkedCompanyId = (receipt as { company_id: string | null } | null)?.company_id ?? null;
      if (linkedCompanyId) {
        clientCompanyId = linkedCompanyId;
        source = "financial_link";
      }
    }
  }

  let clientName: string | null = null;
  if (clientCompanyId) {
    const { data: client } = await supabase
      .from("proto_companies")
      .select("name")
      .eq("id", clientCompanyId)
      .maybeSingle();
    clientName = (client as { name: string } | null)?.name ?? null;
  }

  return NextResponse.json({
    ok: true as const,
    data: {
      movement: movement as BankMovement,
      identification: clientCompanyId
        ? {
            id: identification?.id ?? null,
            clientCompanyId,
            clientName,
            status: identification?.status ?? null,
            confirmedAt: identification?.confirmedAt ?? null,
            source,
          }
        : null,
    },
  });
}
