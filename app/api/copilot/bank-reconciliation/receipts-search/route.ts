import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import {
  getShadowClientById,
  listReconciledReceiptIds,
  listShadowInvoices,
  listShadowReceiptsForClient,
} from "@/lib/bank/intelligence/server/repositories";

export const dynamic = "force-dynamic";

/**
 * FASE BANK-MANUAL-CANONICAL-MATCH-SELECTION-001 — recibos + facturas
 * candidatas de UN cliente, en la moneda pedida — para la selección manual
 * de "otra coincidencia" en el drawer de Ingresos. Solo lectura. `used`
 * indica si el recibo ya tiene un link canónico activo (cruzado contra
 * `bank_movement_reconciliation_links`, nunca confiado del cliente).
 */
export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccess(request, "bank_movements");
  if (!auth.ok) return auth.response;

  const params = request.nextUrl.searchParams;
  const clientId = params.get("clientId")?.trim();
  const currency = params.get("currency")?.trim();
  if (!clientId || !currency) {
    return NextResponse.json({ ok: false as const, error: "Faltan clientId o currency." }, { status: 400 });
  }

  try {
    const client = await getShadowClientById(auth.ctx.supabase, auth.ctx.tenantCompanyId, clientId);
    if (!client) {
      return NextResponse.json({ ok: false as const, error: "Cliente no encontrado en este workspace." }, { status: 404 });
    }

    const [receipts, invoices] = await Promise.all([
      listShadowReceiptsForClient(auth.ctx.supabase, auth.ctx.tenantCompanyId, { clientId, currency, limit: 50 }),
      listShadowInvoices(auth.ctx.supabase, auth.ctx.tenantCompanyId, { currency, clientIds: [clientId], limit: 50 }),
    ]);
    const usedReceiptIds = await listReconciledReceiptIds(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      receipts.map((r) => r.id)
    );

    return NextResponse.json({
      ok: true as const,
      data: {
        receipts: receipts.map((r) => ({
          id: r.id,
          amount: typeof r.amount === "number" ? r.amount : parseFloat(String(r.amount)) || 0,
          currency: r.currency_code,
          date: r.receipt_date,
          status: r.status,
          used: usedReceiptIds.has(r.id),
        })),
        candidateInvoices: invoices.map((inv) => ({
          invoiceId: inv.id,
          balanceAmount: typeof inv.balance_amount === "number" ? inv.balance_amount : parseFloat(String(inv.balance_amount ?? 0)) || 0,
          currencyCode: inv.currency_code,
          issueDate: inv.issue_date,
          dueDate: inv.due_date,
        })),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false as const, error: "No se pudieron cargar los recibos del cliente.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
