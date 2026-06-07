export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";
import {
  listProtoInvoicesByCompanyIdForLedger,
  listProtoReceiptsByCompanyIdForLedger,
  getProtoCompanyById,
} from "@/lib/data/proto-operational-read-repository";
import {
  buildClientAccountStatement,
  type AccountStatementByCurrency,
  type AccountStatementMovement,
} from "@/lib/copilot-client-account-statement";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toFiniteOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// ── Inline helpers (mirror of render-account-statement-pdf.ts) ────────────────

function getPreviousBalance(block: AccountStatementByCurrency, from: string | undefined): number {
  if (!from) return 0;
  const before = block.movements.filter((m) => m.date < from);
  return before.length > 0 ? before[before.length - 1]!.runningBalance : (block.baselineBalance ?? 0);
}

function filterBlock(
  block: AccountStatementByCurrency,
  from: string | undefined,
  to: string | undefined
): AccountStatementByCurrency {
  if (!from && !to) return block;
  const mvs = block.movements.filter((m) => {
    if (from && m.date < from) return false;
    if (to && m.date > to) return false;
    return true;
  });
  let totalDebit = 0;
  let totalCredit = 0;
  for (const m of mvs) {
    totalDebit += m.debit;
    totalCredit += m.credit;
  }
  const netChange = totalDebit - totalCredit;
  return {
    ...block,
    movements: mvs,
    summary: {
      ...block.summary,
      totalDebit,
      totalCredit,
      finalBalance: netChange,
      totalInvoiced: totalDebit,
      totalCollected: totalCredit,
      pendingBalance: netChange,
      movementCount: mvs.length,
      hasNegativeBalance: (mvs[mvs.length - 1]?.runningBalance ?? 0) < 0,
    },
  };
}

/** Strip `raw` DataRow — too heavy for JSON transfer, not needed in preview. */
function stripRaw(
  mvs: readonly AccountStatementMovement[]
): Omit<AccountStatementMovement, "raw">[] {
  return mvs.map((mv) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { raw: _raw, ...rest } = mv;
    return rest;
  });
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  let log = copilotRequestLogger(request);

  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", { phase: "account_statement_json" });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const tenantCompanyId = auth.ctx.tenantCompanyId.trim();
    if (!tenantCompanyId) {
      return NextResponse.json(
        { ok: false, code: "FORBIDDEN_TENANT", error: "Sin workspace válido." },
        { status: 403 }
      );
    }

    const { companyId } = await params;
    if (!companyId?.trim()) {
      return NextResponse.json(
        { ok: false, code: "BAD_REQUEST", error: "Falta companyId." },
        { status: 400 }
      );
    }

    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: userData, error: userErr } = await supabaseFromCookies.auth.getUser();
    const supabase = !userErr && userData.user ? supabaseFromCookies : auth.ctx.supabase;

    const sp = request.nextUrl.searchParams;
    const from = sp.get("from")?.trim() || undefined;
    const to = sp.get("to")?.trim() || undefined;
    const currencyParam = sp.get("currency")?.trim().toUpperCase();
    const currencies: Array<"UYU" | "USD"> =
      currencyParam === "UYU" ? ["UYU"] :
      currencyParam === "USD" ? ["USD"] :
      ["UYU", "USD"];

    const [invoices, receipts, company] = await Promise.all([
      listProtoInvoicesByCompanyIdForLedger(supabase, companyId, tenantCompanyId),
      listProtoReceiptsByCompanyIdForLedger(supabase, companyId, tenantCompanyId),
      getProtoCompanyById(supabase, companyId, tenantCompanyId),
    ]);

    const openingBalanceUyu = toFiniteOrNull((company as Record<string, unknown> | null)?.ledger_opening_balance_uyu);
    const openingBalanceUsd = toFiniteOrNull((company as Record<string, unknown> | null)?.ledger_opening_balance_usd);
    const statement = buildClientAccountStatement({
      invoices,
      receipts,
      ledgerMode: true,
      openingBalanceUyu,
      openingBalanceUsd,
    });

    const companyName =
      String(company?.name ?? company?.company_name ?? company?.zeta_client_name ?? "").trim() ||
      "Cliente";

    const blocks = currencies.map((cur) => {
      const rawBlock = cur === "UYU" ? statement.uyu : statement.usd;
      const previousBalance = getPreviousBalance(rawBlock, from);
      const filtered = filterBlock(rawBlock, from, to);
      return {
        currency: cur,
        previousBalance,
        summary: filtered.summary,
        movements: stripRaw(filtered.movements),
      };
    });

    log.info("account_statement_json_done", {
      companyId,
      from,
      to,
      currencies,
      movementCounts: blocks.map((b) => b.movements.length),
    });

    return NextResponse.json(
      {
        ok: true,
        companyName,
        from,
        to,
        currencies,
        blocks,
        unknownCurrencyCount: statement.unknownCurrencyCount,
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[account-statement-json] INTERNAL_ERROR:", errMsg);
    return NextResponse.json(
      { ok: false, code: "INTERNAL_ERROR", error: "No se pudo generar el estado de cuenta." },
      { status: 500 }
    );
  }
}
