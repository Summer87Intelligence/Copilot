#!/usr/bin/env node
/** Retry syncs: Trexys receipts (full month) + PRESTIS saldos */
// @ts-nocheck — script operativo one-off.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { syncZetaCollectionReceipts } from "../lib/integrations/zeta/zeta-collection-receipts-pipeline";
import { runZetaSaldosPendientesPipeline } from "../lib/integrations/zeta/zeta-saldos-pipeline";

const wid = process.env.WORKSPACE_COMPANY_ID ?? process.env.AUDIT_WORKSPACE_ID ?? "";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const ctx = { requestId: `cleanup-retry-${Date.now()}`, tenantId: wid };

  console.log("=== Trexys: sync recibos mar-2026 (mes completo) ===");
  const r1 = await syncZetaCollectionReceipts({
    supabase: sb,
    workspaceCompanyId: wid,
    ctx,
    filters: { mes: "3", anio: "2026" },
  });
  console.log(JSON.stringify({ success: r1.success, inserted: r1.inserted, updated: r1.updated, processed: r1.processed }));

  const { data: co } = await sb
    .from("proto_companies")
    .select("id")
    .eq("Codigo", "182")
    .eq("workspace_company_id", wid)
    .single();
  const { data: recs } = await sb
    .from("proto_receipts")
    .select("reference,amount,receipt_date,receipt_number")
    .eq("company_id", co?.id)
    .order("receipt_date");
  console.log("Trexys receipts:", recs);

  console.log("\n=== PRESTIS: saldos pendientes sync (cod 185) ===");
  const { data: co2 } = await sb
    .from("proto_companies")
    .select("id")
    .eq("Codigo", "185")
    .eq("workspace_company_id", wid)
    .single();
  const saldos = await runZetaSaldosPendientesPipeline(sb, wid, randomUUID(), {
    protoCompanyId: co2!.id,
    clienteCodigo: "185",
    mode: "incremental",
    maxPagesPerRun: 5,
  });
  console.log(JSON.stringify(saldos));

  const { data: inv } = await sb
    .from("proto_invoices")
    .select("invoice_number,total_amount,issue_date,is_active,category")
    .eq("company_id", co2?.id)
    .gte("issue_date", "2026-03-01")
    .lte("issue_date", "2026-03-31")
    .order("issue_date");
  console.log("PRESTIS mar invoices:", inv);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
