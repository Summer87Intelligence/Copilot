/**
 * FASE 1 — Aplicar cierre de shadows elegibles (8 candidatos esperados).
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/reconcile-zeta-saldos-shadows-apply.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/reconcile-zeta-saldos-shadows-apply.ts --apply
 *
 * Guardas:
 *   - pendingAtCutoff antes/después debe ser UYU 599425 / USD 8152.06
 *   - snapshot JSON en tmp/ antes de --apply
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { invoiceInputFromProtoRow } from "@/lib/copilot-financial-reconciliation";
import { MIN_FINANCIAL_DATE } from "@/lib/copilot-operational-period";
import {
  classifyShadowCandidatesForCompany,
  computeWorkspacePendingAtCutoff,
  invoiceRowToOperationalInput,
  reconcileStaleSaldosShadowsForClient,
} from "@/lib/integrations/zeta/zeta-saldos-shadow-reconciliation";

const EXPECTED_UYU = 599_425;
const EXPECTED_USD = 8_152.06;
const TOLERANCE = 0.01;

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const DRY_RUN = args.includes("--dry-run") || !APPLY;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const wid =
    process.env.WORKSPACE_COMPANY_ID?.trim() ||
    process.env.NEXT_PUBLIC_WORKSPACE_COMPANY_ID?.trim() ||
    "";

  if (!url || !key || !wid) {
    console.error("Faltan credenciales o WORKSPACE_COMPANY_ID");
    process.exit(1);
  }

  process.env.ZETA_SALDOS_SHADOW_RECONCILE = "1";

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: rawInv, error: invErr } = await sb
    .from("proto_invoices")
    .select(
      "id, company_id, invoice_number, balance_amount, total_amount, currency_code, status, issue_date, due_date, due_date_source, category, zeta_metadata"
    )
    .eq("workspace_company_id", wid)
    .eq("is_active", true)
    .gte("issue_date", MIN_FINANCIAL_DATE);

  if (invErr) throw invErr;

  const invoices = (rawInv ?? []).map(invoiceInputFromProtoRow);
  const before = computeWorkspacePendingAtCutoff(invoices, wid);

  const byCompany = new Map<string, ReturnType<typeof invoiceRowToOperationalInput>[]>();
  for (const row of rawInv ?? []) {
    const inv = invoiceRowToOperationalInput(row as Record<string, unknown>);
    const cid = String(inv.company_id ?? "").trim();
    if (!cid) continue;
    const list = byCompany.get(cid) ?? [];
    list.push(inv);
    byCompany.set(cid, list);
  }

  const allCandidates = [];
  for (const [companyId, companyInvoices] of byCompany) {
    const { candidates } = classifyShadowCandidatesForCompany(companyInvoices);
    for (const c of candidates) allCandidates.push({ ...c, company_id: companyId });
  }

  const snapshotPath = path.join(
    process.cwd(),
    "tmp",
    `shadow-reconcile-snapshot-${new Date().toISOString().slice(0, 10)}.json`
  );

  const snapshotRows = [];
  for (const c of allCandidates) {
    const row = (rawInv ?? []).find((r) => String(r.id) === c.shadow_id) as Record<
      string,
      unknown
    >;
    if (!row) continue;
    snapshotRows.push({
      id: c.shadow_id,
      invoice_number: row.invoice_number,
      balance_amount: row.balance_amount,
      status: row.status,
      zeta_metadata: row.zeta_metadata,
      company_id: c.company_id,
    });
  }

  const report = {
    mode: DRY_RUN ? "dry-run" : "apply",
    generated_at: new Date().toISOString(),
    workspace_company_id: wid,
    pending_before: before,
    expected_pending: { uyu: EXPECTED_UYU, usd: EXPECTED_USD },
    pending_matches_expected:
      Math.abs(before.uyu - EXPECTED_UYU) <= TOLERANCE &&
      Math.abs(before.usd - EXPECTED_USD) <= TOLERANCE,
    candidate_count: allCandidates.length,
    candidates: allCandidates,
    snapshot_path: snapshotPath,
  };

  if (!report.pending_matches_expected) {
    console.error("ABORT: pendingAtCutoff antes no coincide con baseline esperado", before);
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  fs.writeFileSync(
    snapshotPath,
    JSON.stringify(
      { captured_at: new Date().toISOString(), workspace_company_id: wid, rows: snapshotRows },
      null,
      2
    ),
    "utf-8"
  );

  let closedTotal = 0;
  const closedDetails = [];

  for (const [companyId, companyInvoices] of byCompany) {
    const companyCandidates = allCandidates.filter((c) => c.company_id === companyId);
    if (companyCandidates.length === 0) continue;

    const { data: co } = await sb
      .from("proto_companies")
      .select("Codigo")
      .eq("id", companyId)
      .maybeSingle();
    const clienteCodigo = String((co as { Codigo?: string } | null)?.Codigo ?? "").trim();

    const result = await reconcileStaleSaldosShadowsForClient(
      sb,
      wid,
      companyId,
      companyInvoices,
      {
        clienteCodigo: clienteCodigo || undefined,
        tenantId: wid,
        requestId: `shadow-apply-${Date.now()}`,
        syncRunId: `shadow-apply-${Date.now()}`,
        dryRun: false,
      }
    );
    closedTotal += result.closed_count;
    closedDetails.push({ company_id: companyId, ...result });
  }

  const { data: rawAfter, error: afterErr } = await sb
    .from("proto_invoices")
    .select(
      "id, company_id, invoice_number, balance_amount, total_amount, currency_code, status, issue_date, due_date, due_date_source, category, zeta_metadata"
    )
    .eq("workspace_company_id", wid)
    .eq("is_active", true)
    .gte("issue_date", MIN_FINANCIAL_DATE);

  if (afterErr) throw afterErr;

  const after = computeWorkspacePendingAtCutoff(
    (rawAfter ?? []).map(invoiceInputFromProtoRow),
    wid
  );

  const pendingUnchanged =
    Math.abs(after.uyu - before.uyu) <= TOLERANCE &&
    Math.abs(after.usd - before.usd) <= TOLERANCE;

  const finalReport = {
    ...report,
    pending_after: after,
    pending_unchanged: pendingUnchanged,
    closed_total: closedTotal,
    closed_details: closedDetails,
    apply_ok: pendingUnchanged && closedTotal === allCandidates.length,
  };

  console.log(JSON.stringify(finalReport, null, 2));

  if (!pendingUnchanged) {
    console.error("ABORT: pendingAtCutoff cambió tras apply — revisar snapshot para rollback");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
