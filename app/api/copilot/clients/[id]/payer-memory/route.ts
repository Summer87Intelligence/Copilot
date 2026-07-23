import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccessAny } from "@/lib/auth/copilot-module-api-auth";
import { listIdentificationsForClient } from "@/lib/bank/canonical/client-identification-repository.server";
import { listReconciledPaymentsForClient } from "@/lib/bank/canonical/movement-reconciliation-level";
import {
  countOtherClientsForPayerIdentity,
  listClientPayerHistory,
} from "@/lib/bank/canonical/payer-identity-repository.server";
import { maskAccountOrReference } from "@/lib/bank/canonical/payer-identity";
import {
  associationRowFromMovement,
  buildClientBankingSummary,
  buildHabitualPaymentPattern,
  buildHowAppearsFromActive,
  filterActiveBankingRows,
  filterCorrectionRows,
  groupCorrections,
  type ClientBankingAssociationRow,
} from "@/lib/bank-movements/client-banking-history-view";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/copilot/clients/[id]/payer-memory
 *
 * FASE CLIENT-BANKING-IDENTIFICATION-CLARITY-AND-HISTORY-CLEANUP-001 —
 * separa resumen activo, historial canónico, forma habitual y correcciones.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: companyId } = await params;
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

    let associationRows: ClientBankingAssociationRow[] = [];
    try {
      const idents = await listIdentificationsForClient(
        auth.ctx.supabase,
        auth.ctx.tenantCompanyId,
        companyId
      );
      const historyIdents = idents.filter((i) => i.status !== "excluded");
      const movementIds = Array.from(new Set(historyIdents.map((i) => i.movementId)));
      const actorIds = Array.from(
        new Set(
          historyIdents
            .flatMap((i) => [i.confirmedBy, i.revokedBy])
            .filter((v): v is string => v != null)
        )
      );
      const movementsById = new Map<
        string,
        {
          movement_date: string;
          amount: string | number;
          currency: string;
          description: string | null;
          raw_description?: string | null;
          bank_reference?: string | null;
          created_at?: string | null;
          status?: string | null;
          excluded_from_operations: boolean | null;
          duplicate_of: string | null;
          metadata: Record<string, unknown> | null;
        }
      >();
      const actorsById = new Map<string, string>();
      if (movementIds.length > 0) {
        const { data: movRows, error: movErr } = await auth.ctx.supabase
          .from("bank_movements")
          .select(
            "id, movement_date, amount, currency, description, raw_description, bank_reference, created_at, status, excluded_from_operations, duplicate_of, metadata"
          )
          .in("id", movementIds);
        if (movErr) {
          const { data: legacy } = await auth.ctx.supabase
            .from("bank_movements")
            .select("id, movement_date, amount, currency, description, bank_reference, created_at, status, metadata")
            .in("id", movementIds);
          for (const m of legacy ?? []) {
            movementsById.set(m.id as string, {
              ...(m as {
                movement_date: string;
                amount: string | number;
                currency: string;
                description: string | null;
                bank_reference?: string | null;
                created_at?: string | null;
                status?: string | null;
                metadata: Record<string, unknown> | null;
              }),
              raw_description: null,
              excluded_from_operations: null,
              duplicate_of: null,
            });
          }
        } else {
          for (const m of movRows ?? []) {
            movementsById.set(
              m.id as string,
              m as {
                movement_date: string;
                amount: string | number;
                currency: string;
                description: string | null;
                raw_description?: string | null;
                bank_reference?: string | null;
                created_at?: string | null;
                status?: string | null;
                excluded_from_operations: boolean | null;
                duplicate_of: string | null;
                metadata: Record<string, unknown> | null;
              }
            );
          }
        }
      }
      if (actorIds.length > 0) {
        const { data: actorRows } = await auth.ctx.supabase
          .from("app_users")
          .select("id, email")
          .in("id", actorIds);
        for (const a of actorRows ?? []) {
          actorsById.set(a.id as string, (a.email as string | null) ?? "—");
        }
      }
      associationRows = historyIdents.map((i) =>
        associationRowFromMovement({
          identification: {
            id: i.id,
            movementId: i.movementId,
            status: i.status,
            reason: i.reason,
            confirmedAt: i.confirmedAt,
            revokedAt: i.revokedAt,
            confirmedByEmail: i.confirmedBy ? (actorsById.get(i.confirmedBy) ?? null) : null,
            revokedByEmail: i.revokedBy ? (actorsById.get(i.revokedBy) ?? null) : null,
          },
          movement: movementsById.get(i.movementId) ?? null,
        })
      );
    } catch {
      associationRows = [];
    }

    const activeHistory = filterActiveBankingRows(associationRows).sort((a, b) =>
      String(b.movementDate ?? "").localeCompare(String(a.movementDate ?? ""))
    );
    const corrections = filterCorrectionRows(associationRows).sort((a, b) =>
      String(b.revokedAt ?? b.associatedAt ?? "").localeCompare(
        String(a.revokedAt ?? a.associatedAt ?? "")
      )
    );
    const summary = buildClientBankingSummary(activeHistory);
    const maskedFromIdentity = identities.find((i) => i.maskedAccount)?.maskedAccount ?? null;
    const howAppears = buildHowAppearsFromActive(activeHistory, maskedFromIdentity);
    const habitualPayment = buildHabitualPaymentPattern(activeHistory, howAppears);
    const correctionsGrouped = groupCorrections(corrections);

    // Compat: identificationsOnly = activas (sin revocadas) para no romper callers viejos
    const identificationsOnly = activeHistory.map((r) => ({
      id: r.id,
      movementId: r.movementId,
      date: r.movementDate,
      amountLabel: r.amountLabel,
      status: r.status,
      reason: r.reason,
      confirmedAt: r.associatedAt,
      actorEmail: r.confirmedByEmail,
      displayDescription: r.displayDescription,
      bankReference: r.bankReference,
    }));

    let reconciledPayments: Awaited<ReturnType<typeof listReconciledPaymentsForClient>> = [];
    try {
      reconciledPayments = await listReconciledPaymentsForClient(
        auth.ctx.supabase,
        auth.ctx.tenantCompanyId,
        companyId
      );
    } catch {
      reconciledPayments = [];
    }

    return NextResponse.json({
      ok: true as const,
      identities,
      history,
      identificationsOnly,
      reconciledPayments,
      summary,
      howAppears,
      activeHistory,
      corrections,
      correctionsGrouped,
      habitualPayment,
    });
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
