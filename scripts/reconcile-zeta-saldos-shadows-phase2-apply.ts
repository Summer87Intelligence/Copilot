/**
 * FASE 2 — Aplicar cierre de shadows duplicados de CCV1 abierto (28 esperados).
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/reconcile-zeta-saldos-shadows-phase2-apply.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/reconcile-zeta-saldos-shadows-phase2-apply.ts --apply
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { invoiceInputFromProtoRow } from "@/lib/copilot-financial-reconciliation";
import { MIN_FINANCIAL_DATE } from "@/lib/copilot-operational-period";
import {
  classifyPhase2OpenCcv1DuplicateShadows,
  computeWorkspacePendingAtCutoff,
  invoiceRowToOperationalInput,
  reconcileOpenCcv1DuplicateShadowsForClient,
} from "@/lib/integrations/zeta/zeta-saldos-shadow-reconciliation";
import { isZetaSaldosPendientesShadowRow } from "@/lib/zeta/zeta-operational-debt-dedup";

const EXPECTED_UYU = 599_425;
const EXPECTED_USD = 8_152.06;
const EXPECTED_CANDIDATES = 28;
const EXPECTED_AMBIGUOUS = 3;
const TOLERANCE = 0.01;

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const DRY_RUN = args.includes("--dry-run") || !APPLY;

function pendingBalance(inv: { balance_amount?: unknown }): number {
  const n = Number(inv.balance_amount ?? 0);
  return Math.max(0, Number.isFinite(n) ? n : 0);
}

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

  process.env.ZETA_SALDOS_SHADOW_RECONCILE_PHASE2 = "1";

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
  const allSkipped = [];
  for (const [companyId, companyInvoices] of byCompany) {
    const { candidates, skipped } = classifyPhase2OpenCcv1DuplicateShadows(companyInvoices);
    for (const c of candidates) allCandidates.push({ ...c, company_id: companyId });
    allSkipped.push(...skipped);
  }

  const ambiguousCount = allSkipped.filter((s) => s.reason === "ambiguous_fallback").length;
  const shadowsWithBalance = invoices.filter(
    (i) => isZetaSaldosPendientesShadowRow(i) && pendingBalance(i) > 0.005
  ).length;

  const snapshotPath = path.join(
    process.cwd(),
    "tmp",
    `shadow-reconcile-phase2-snapshot-${new Date().toISOString().slice(0, 10)}.json`
  );

  const snapshotRows = allCandidates.map((c) => {
    const row = (rawInv ?? []).find((r) => String(r.id) === c.shadow_id) as Record<
      string,
      unknown
    >;
    return {
      id: c.shadow_id,
      invoice_number: row?.invoice_number ?? c.shadow_invoice_number,
      balance_amount: row?.balance_amount ?? c.shadow_balance,
      status: row?.status ?? "issued",
      zeta_metadata: row?.zeta_metadata ?? null,
      company_id: c.company_id,
      paired_ccv1_id: c.ccv1_id,
      paired_ccv1_invoice_number: c.ccv1_invoice_number,
    };
  });

  const report = {
    phase: "FASE_2",
    mode: DRY_RUN ? "dry-run" : "apply",
    generated_at: new Date().toISOString(),
    workspace_company_id: wid,
    pending_before: before,
    expected_pending: { uyu: EXPECTED_UYU, usd: EXPECTED_USD },
    pending_matches_expected:
      Math.abs(before.uyu - EXPECTED_UYU) <= TOLERANCE &&
      Math.abs(before.usd - EXPECTED_USD) <= TOLERANCE,
    candidate_count: allCandidates.length,
    expected_candidate_count: EXPECTED_CANDIDATES,
    ambiguous_skipped_count: ambiguousCount,
    expected_ambiguous: EXPECTED_AMBIGUOUS,
    shadows_with_balance_before: shadowsWithBalance,
    candidates: allCandidates,
    skipped: allSkipped,
    snapshot_path: snapshotPath,
  };

  if (!report.pending_matches_expected) {
    console.error("ABORT: pendingAtCutoff antes no coincide con baseline", before);
    process.exit(1);
  }

  if (allCandidates.length !== EXPECTED_CANDIDATES) {
    console.error(
      `ABORT: se esperaban ${EXPECTED_CANDIDATES} candidatos, hay ${allCandidates.length}`
    );
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
      {
        phase: "FASE_2",
        captured_at: new Date().toISOString(),
        workspace_company_id: wid,
        rollback_instructions:
          "Restaurar balance_amount, status y zeta_metadata por fila; ver restore_steps en reporte apply.",
        rows: snapshotRows,
      },
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
    const runId = `shadow-phase2-${Date.now()}`;

    const result = await reconcileOpenCcv1DuplicateShadowsForClient(
      sb,
      wid,
      companyId,
      companyInvoices,
      {
        clienteCodigo: clienteCodigo || undefined,
        tenantId: wid,
        requestId: runId,
        syncRunId: runId,
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

  const afterInvoices = (rawAfter ?? []).map(invoiceInputFromProtoRow);
  const after = computeWorkspacePendingAtCutoff(afterInvoices, wid);
  const shadowsAfter = afterInvoices.filter(
    (i) => isZetaSaldosPendientesShadowRow(i) && pendingBalance(i) > 0.005
  ).length;
  const ambiguousAfter = classifyPhase2OpenCcv1DuplicateShadows(
    (rawAfter ?? []).map((r) => invoiceRowToOperationalInput(r as Record<string, unknown>))
  ).skipped.filter((s) => s.reason === "ambiguous_fallback").length;

  const pendingUnchanged =
    Math.abs(after.uyu - before.uyu) <= TOLERANCE &&
    Math.abs(after.usd - before.usd) <= TOLERANCE;

  const finalReport = {
    ...report,
    pending_after: after,
    pending_unchanged: pendingUnchanged,
    closed_total: closedTotal,
    closed_details: closedDetails,
    shadows_with_balance_after: shadowsAfter,
    ambiguous_remaining: ambiguousAfter,
    apply_ok:
      pendingUnchanged &&
      closedTotal === EXPECTED_CANDIDATES &&
      shadowsAfter === EXPECTED_AMBIGUOUS &&
      ambiguousAfter === EXPECTED_AMBIGUOUS,
    rollback_path: snapshotPath,
  };

  console.log(JSON.stringify(finalReport, null, 2));

  if (!finalReport.apply_ok) {
    console.error("ABORT: apply no cumplió gates — usar snapshot para rollback");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
