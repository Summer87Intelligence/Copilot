import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccessAny } from "@/lib/auth/copilot-module-api-auth";
import {
  countOtherClientsForPayerIdentity,
  listClientPayerHistory,
} from "@/lib/bank/canonical/payer-identity-repository.server";
import { maskAccountOrReference } from "@/lib/bank/canonical/payer-identity";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/copilot/clients/[companyId]/payer-memory
 * Solo lectura: identidades de pagador + historial resumido para Cliente 360.
 * Nunca expone hashes ni cuentas completas.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  if (!UUID_RE.test(companyId)) {
    return NextResponse.json({ ok: false as const, error: "INVALID_CLIENT" }, { status: 400 });
  }

  const auth = await requireCopilotModuleAccessAny(request, [
    "clientes",
    "cobranza",
    "bank_movements",
  ]);
  if (!auth.ok) return auth.response;

  try {
    const rows = await listClientPayerHistory(
      auth.ctx.supabase,
      auth.ctx.tenantCompanyId,
      companyId
    );
    const identities = await Promise.all(
      rows.map(async (row) => {
        const other = await countOtherClientsForPayerIdentity(
          auth.ctx.supabase,
          auth.ctx.tenantCompanyId,
          row.payerIdentityId,
          companyId
        );
        return {
          linkId: row.linkId,
          linkStatus: row.linkStatus,
          confirmations: row.confirmations,
          bankName: row.bankName,
          originalName: row.originalName,
          normalizedName: row.normalizedName,
          maskedAccount: row.maskedAccount,
          usualCurrency: row.usualCurrency,
          linkFirstSeenAt: row.linkFirstSeenAt,
          linkLastSeenAt: row.linkLastSeenAt,
          linkedToOtherClients: other > 0,
        };
      })
    );

    const history = rows
      .slice()
      .sort((a, b) => {
        const ta = a.linkLastSeenAt ?? a.confirmedAt ?? "";
        const tb = b.linkLastSeenAt ?? b.confirmedAt ?? "";
        return tb.localeCompare(ta);
      })
      .map((row) => {
        const totals = row.totalByCurrency ?? {};
        const currency = Object.keys(totals)[0] ?? row.usualCurrency;
        const amount = currency != null ? totals[currency] : null;
        return {
          linkId: row.linkId,
          date: row.linkLastSeenAt ?? row.confirmedAt,
          amountLabel:
            amount != null && currency
              ? `${currency} ${Number(amount).toLocaleString("es-UY")}`
              : null,
          payerName: row.originalName ?? row.normalizedName,
          maskedReference: maskAccountOrReference(row.maskedAccount),
          receiptLabel: null as string | null,
          modeLabel: "sugerida/manual",
          statusLabel: row.linkStatus === "conflicted" ? "En conflicto" : "Confirmado",
        };
      });

    return NextResponse.json({ ok: true as const, identities, history });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false as const,
        error: err instanceof Error ? err.message : "PAYER_MEMORY_READ_FAILED",
      },
      { status: 500 }
    );
  }
}
