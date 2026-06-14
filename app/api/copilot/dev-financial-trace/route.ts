import { NextRequest, NextResponse } from "next/server";

import { requireCopilotTenantContext } from "@/lib/copilot-api-auth";
import { copilotRequestLogger } from "@/lib/copilot-structured-logger";
import { createRouteSupabaseClient } from "@/lib/supabase-route-client";
import { copilotInternalErrorResponse } from "@/lib/api/copilot-request-errors";

const LIMIT = 20;

type TraceInvoice = {
  id: string;
  invoice_number: string;
  total_amount: number | null;
  balance_amount: number | null;
  due_date: string | null;
  company_id: string | null;
  workspace_company_id: string | null;
};

type TraceReceipt = {
  id: string;
  receipt_number: string;
  amount: number | null;
  invoice_id: string | null;
  company_id: string | null;
  workspace_company_id: string | null;
  receipt_date: string | null;
};

type TracePayment = {
  id: string;
  payment_number: string;
  amount: number | null;
  invoice_id: string | null;
  company_id: string | null;
  category: string | null;
  workspace_company_id: string | null;
  payment_date: string | null;
};

type TraceInvoiceFinancial = {
  id: string | null;
  total_amount: number | null;
  payments: number | null;
  balance: number | null;
};

function asStr(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s.length > 0 ? s : null;
}

function asNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

async function selectInvoiceFinancialRowsByInvoiceIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseForData: any,
  invoiceIds: string[]
): Promise<Record<string, unknown>[]> {
  if (invoiceIds.length === 0) return [];
  const ids = [...new Set(invoiceIds.filter(Boolean))].slice(0, LIMIT);

  // La vista expone (id, total_amount, payments, balance). Filtramos por `id`
  // (PK proveniente de proto_invoices.id). No existe columna `invoice_id`.
  const res = await supabaseForData
    .from("invoice_financials")
    .select("id, total_amount, payments, balance")
    .in("id", ids)
    .limit(LIMIT);

  if (res.error) {
    throw new Error(`invoice_financials: ${res.error.message}`);
  }
  return (res.data ?? []) as Record<string, unknown>[];
}

/**
 * GET /api/copilot/dev-financial-trace
 * Solo en development: traza compacta de filas fuente para depuración financiera.
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let log = copilotRequestLogger(request);

  try {
    const auth = await requireCopilotTenantContext(request);
    if (!auth.ok) {
      log.warn("copilot_auth_failed", {
        phase: "require_copilot_tenant_dev_financial_trace",
      });
      return auth.response;
    }
    log = log.withTenant(auth.ctx.tenantCompanyId);

    const workspaceCompanyId = auth.ctx.tenantCompanyId.trim();
    if (!workspaceCompanyId) {
      return NextResponse.json(
        { ok: false as const, code: "FORBIDDEN_TENANT", error: "Sin workspace válido." },
        { status: 403 }
      );
    }

    const supabaseFromCookies = await createRouteSupabaseClient();
    const { data: supabaseUserData, error: supabaseUserErr } =
      await supabaseFromCookies.auth.getUser();
    const supabaseForData =
      !supabaseUserErr && supabaseUserData.user
        ? supabaseFromCookies
        : auth.ctx.supabase;

    let activeCompanyName: string | null = null;
    const { data: compRow } = await supabaseForData
      .from("companies")
      .select("name")
      .eq("id", workspaceCompanyId)
      .maybeSingle();
    if (compRow && typeof (compRow as { name?: unknown }).name === "string") {
      activeCompanyName = String((compRow as { name: string }).name).trim() || null;
    }

    const [invRes, recRes, payRes] = await Promise.all([
      supabaseForData
        .from("proto_invoices")
        .select(
          "id,invoice_number,total_amount,balance_amount,due_date,company_id,workspace_company_id"
        )
        .eq("workspace_company_id", workspaceCompanyId)
        .eq("is_active", true)
        .order("due_date", { ascending: true })
        .limit(LIMIT),
      supabaseForData
        .from("proto_receipts")
        .select(
          "id,receipt_number,amount,invoice_id,company_id,workspace_company_id,receipt_date"
        )
        .eq("workspace_company_id", workspaceCompanyId)
        .eq("is_active", true)
        .order("receipt_date", { ascending: false })
        .limit(LIMIT),
      supabaseForData
        .from("proto_payments")
        .select(
          "id,payment_number,amount,company_id,category,workspace_company_id,payment_date,obligation_id"
        )
        .eq("workspace_company_id", workspaceCompanyId)
        .eq("is_active", true)
        .order("payment_date", { ascending: false })
        .limit(LIMIT),
    ]);

    if (invRes.error) throw new Error("INTERNAL_QUERY_FAILED");
    if (recRes.error) throw new Error("INTERNAL_QUERY_FAILED");
    if (payRes.error) throw new Error("INTERNAL_QUERY_FAILED");

    const invoices: TraceInvoice[] = ((invRes.data ?? []) as Record<string, unknown>[]).map(
      (r) => ({
        id: String(r.id ?? ""),
        invoice_number: String(r.invoice_number ?? r.id ?? "—"),
        total_amount: asNum(r.total_amount),
        balance_amount: asNum(r.balance_amount),
        due_date: asStr(r.due_date),
        company_id: asStr(r.company_id),
        workspace_company_id: asStr(r.workspace_company_id),
      })
    );
    const tenantInvoiceIds = invoices.map((r) => r.id).filter(Boolean);
    // `invoice_financials` se filtra por ids del tenant (sin asumir workspace_company_id en la view).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finRows = await selectInvoiceFinancialRowsByInvoiceIds(supabaseForData as any, tenantInvoiceIds);

    const receipts: TraceReceipt[] = ((recRes.data ?? []) as Record<string, unknown>[]).map(
      (r) => ({
        id: String(r.id ?? ""),
        receipt_number: String(r.receipt_number ?? r.id ?? "—"),
        amount: asNum(r.amount),
        invoice_id: asStr(r.invoice_id),
        company_id: asStr(r.company_id),
        workspace_company_id: asStr(r.workspace_company_id),
        receipt_date: asStr(r.receipt_date),
      })
    );

    const payments: TracePayment[] = ((payRes.data ?? []) as Record<string, unknown>[]).map(
      (r) => ({
        id: String(r.id ?? ""),
        payment_number: String(r.payment_number ?? r.id ?? "—"),
        amount: asNum(r.amount),
        invoice_id: asStr(r.invoice_id),
        company_id: asStr(r.company_id),
        category: asStr(r.category),
        workspace_company_id: asStr(r.workspace_company_id),
        payment_date: asStr(r.payment_date),
      })
    );

    const invoiceFinancials: TraceInvoiceFinancial[] = finRows.map((r) => ({
      id: asStr(r.id),
      total_amount: asNum(r.total_amount),
      payments: asNum(r.payments),
      balance: asNum(r.balance),
    }));

    return NextResponse.json({
      ok: true as const,
      active_company_name: activeCompanyName,
      workspace_company_id: workspaceCompanyId,
      tenant_user_email: auth.ctx.authUser.email ?? null,
      limit: LIMIT,
      counts: {
        invoices: invoices.length,
        receipts: receipts.length,
        payments: payments.length,
        invoice_financials: invoiceFinancials.length,
      },
      tables: {
        invoices,
        receipts,
        payments,
        invoice_financials: invoiceFinancials,
      },
      computedAt: new Date().toISOString(),
    });
  } catch (e) {
    log.error("copilot_dev_financial_trace_failed", e, {
      route: "GET /api/copilot/dev-financial-trace",
    });
    return copilotInternalErrorResponse({ ok: false as const });
  }
}
