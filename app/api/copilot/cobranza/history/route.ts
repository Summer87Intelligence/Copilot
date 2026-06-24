import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import {
  buildCobranzaHistoryItems,
  computePeriodFrom,
  computePeriodTo,
  fetchCobranzaHistoryReceiptRows,
  parsePeriodParam,
} from "@/lib/copilot-cobranza-history";
import { todayYmdUtc } from "@/lib/treasury/treasury-db-helpers";

async function fetchCompanyNames(
  supabase: SupabaseClient,
  workspaceId: string,
  companyIds: string[]
): Promise<Map<string, string>> {
  if (companyIds.length === 0) return new Map();
  const { data } = await supabase
    .from("proto_companies")
    .select("id, name")
    .eq("workspace_company_id", workspaceId)
    .in("id", companyIds);
  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id: string; name: string }>) {
    if (row.id && row.name) map.set(String(row.id), String(row.name));
  }
  return map;
}

export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccess(request, "cobranza");
  if (!auth.ok) return auth.response;

  const { supabase, tenantCompanyId } = auth.ctx;
  const params = request.nextUrl.searchParams;

  const period = parsePeriodParam(params.get("period"));
  const currency = params.get("currency")?.trim() ?? "";
  const today = todayYmdUtc();
  const fromDate = computePeriodFrom(period, today);

  const fetchResult = await fetchCobranzaHistoryReceiptRows(supabase, {
    workspaceId: tenantCompanyId,
    fromDate,
    toDate: computePeriodTo(period, today),
    currency,
    period,
  });

  const companyIdSet = new Set<string>();
  for (const r of fetchResult.rows) {
    const cid = String(r.company_id ?? "").trim();
    if (cid) companyIdSet.add(cid);
  }

  const companyNames = await fetchCompanyNames(supabase, tenantCompanyId, [...companyIdSet]);
  const items = buildCobranzaHistoryItems(fetchResult.rows, companyNames);

  return NextResponse.json({
    ok: true,
    items,
    total: items.length,
    truncated: fetchResult.truncated,
    meta: {
      fetched: fetchResult.fetched,
      limitApplied: fetchResult.limitApplied,
    },
  });
}
