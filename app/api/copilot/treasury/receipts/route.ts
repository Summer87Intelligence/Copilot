import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import { toSafeNumber } from "@/lib/copilot-numeric-parse";

function isActiveReceipt(status: unknown): boolean {
  if (!status) return true;
  const s = String(status).toLowerCase();
  if (["void", "voided", "canceled", "cancelled", "anulada"].some((x) => s.includes(x))) return false;
  return true;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireCopilotModuleAccess(request, "tesoreria");
    if (!auth.ok) return auth.response;

    const sp = request.nextUrl.searchParams;
    const from = sp.get("from") ?? undefined;
    const to = sp.get("to") ?? undefined;
    const currency = sp.get("currency") ?? undefined;
    const companyId = sp.get("company_id") ?? undefined;
    const limit = Math.min(500, Math.max(1, Number(sp.get("limit") ?? "200")));

    const wid = auth.ctx.tenantCompanyId;

    let qb = auth.ctx.supabase
      .from("proto_receipts")
      .select("id, company_id, currency_code, amount, receipt_date, status, receipt_number, reference")
      .eq("workspace_company_id", wid)
      .eq("is_active", true)
      .order("receipt_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);

    if (from) qb = qb.gte("receipt_date", from);
    if (to) qb = qb.lte("receipt_date", to);
    if (currency) qb = qb.eq("currency_code", currency);
    if (companyId) qb = qb.eq("company_id", companyId);

    const { data, error } = await qb;
    if (error) {
      console.error("[treasury/receipts] DB error:", error.message);
      return NextResponse.json({ ok: false, code: "DATABASE", message: MSG_DB_USER }, { status: 500 });
    }

    const rawRows = (data ?? []) as Record<string, unknown>[];
    const activeRows = rawRows.filter((r) => isActiveReceipt(r.status));

    // Fetch company names for rows that have a company_id
    const companyIds = [...new Set(activeRows.map((r) => r.company_id).filter(Boolean))] as string[];
    const companyNames: Record<string, string> = {};
    if (companyIds.length > 0) {
      const { data: companies } = await auth.ctx.supabase
        .from("proto_companies")
        .select("id, name")
        .eq("workspace_company_id", wid)
        .in("id", companyIds);
      for (const c of (companies ?? []) as Record<string, unknown>[]) {
        if (c.id && c.name) companyNames[String(c.id)] = String(c.name);
      }
    }

    const receipts = activeRows.map((r) => ({
      id: String(r.id ?? ""),
      companyId: r.company_id != null ? String(r.company_id) : null,
      clientName: r.company_id != null ? (companyNames[String(r.company_id)] ?? null) : null,
      currencyCode: r.currency_code != null ? String(r.currency_code) : null,
      amount: toSafeNumber(r.amount),
      receiptDate: r.receipt_date != null ? String(r.receipt_date).slice(0, 10) : null,
      receiptNumber: r.receipt_number != null ? String(r.receipt_number) : null,
      reference: r.reference != null ? String(r.reference) : null,
      status: r.status != null ? String(r.status) : null,
    }));

    const totals = {
      UYU: receipts.filter((r) => r.currencyCode === "UYU").reduce((s, r) => s + (r.amount ?? 0), 0),
      USD: receipts.filter((r) => r.currencyCode === "USD").reduce((s, r) => s + (r.amount ?? 0), 0),
    };

    return NextResponse.json({ ok: true, receipts, totals, count: receipts.length });
  } catch (err) {
    console.error("[treasury/receipts]", err);
    return NextResponse.json({ ok: false, code: "DATABASE", message: MSG_DB_USER }, { status: 500 });
  }
}
