import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccessAny } from "@/lib/auth/copilot-module-api-auth";
import { listIdentificationsForClient } from "@/lib/bank/canonical/client-identification-repository.server";
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

    // Identificaciones sin recibo (sección 10 — "Falta recibo en Zeta"). Solo
    // lectura, tolerante a que la migración local todavía no esté aplicada en
    // producción: si la tabla no existe, esta sección queda vacía sin romper
    // el resto de Cliente 360.
    let identificationsOnly: Array<{
      id: string;
      movementId: string;
      date: string | null;
      amountLabel: string | null;
      status: string;
      reason: string | null;
      confirmedAt: string | null;
      actorEmail: string | null;
    }> = [];
    try {
      const idents = await listIdentificationsForClient(auth.ctx.supabase, auth.ctx.tenantCompanyId, companyId);
      const active = idents.filter((i) => i.status !== "revoked" && i.status !== "excluded");
      const movementIds = active.map((i) => i.movementId);
      const actorIds = Array.from(new Set(active.map((i) => i.confirmedBy).filter((v): v is string => v != null)));
      const movementsById = new Map<string, { movement_date: string; amount: string | number; currency: string }>();
      const actorsById = new Map<string, string>();
      if (movementIds.length > 0) {
        const { data: movRows } = await auth.ctx.supabase
          .from("bank_movements")
          .select("id, movement_date, amount, currency")
          .in("id", movementIds);
        for (const m of movRows ?? []) {
          movementsById.set(m.id as string, m as { movement_date: string; amount: string | number; currency: string });
        }
      }
      if (actorIds.length > 0) {
        const { data: actorRows } = await auth.ctx.supabase.from("app_users").select("id, email").in("id", actorIds);
        for (const a of actorRows ?? []) {
          actorsById.set(a.id as string, (a.email as string | null) ?? "—");
        }
      }
      identificationsOnly = active.map((i) => {
        const mv = movementsById.get(i.movementId);
        return {
          id: i.id,
          movementId: i.movementId,
          date: mv?.movement_date ?? null,
          amountLabel: mv ? `${mv.currency} ${Number(mv.amount).toLocaleString("es-UY")}` : null,
          status: i.status,
          reason: i.reason,
          confirmedAt: i.confirmedAt,
          actorEmail: i.confirmedBy ? (actorsById.get(i.confirmedBy) ?? null) : null,
        };
      });
    } catch {
      identificationsOnly = [];
    }

    return NextResponse.json({ ok: true as const, identities, history, identificationsOnly });
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
