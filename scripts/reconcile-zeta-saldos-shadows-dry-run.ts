/**
 * FASE 1 — Dry-run read-only: shadows elegibles para cierre automático.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/reconcile-zeta-saldos-shadows-dry-run.ts
 */

import { createClient } from "@supabase/supabase-js";

import { invoiceInputFromProtoRow } from "@/lib/copilot-financial-reconciliation";
import { MIN_FINANCIAL_DATE } from "@/lib/copilot-operational-period";
import {
  classifyShadowCandidatesForCompany,
  computeWorkspacePendingAtCutoff,
  invoiceRowToOperationalInput,
  isZetaSaldosShadowReconcileEnabled,
} from "@/lib/integrations/zeta/zeta-saldos-shadow-reconciliation";
import { isZetaSaldosPendientesShadowRow } from "@/lib/zeta/zeta-operational-debt-dedup";

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

  const { data: companies, error: coErr } = await sb
    .from("proto_companies")
    .select("id, name, RazonSocial, Codigo")
    .eq("workspace_company_id", wid)
    .eq("is_active", true);

  if (coErr) throw coErr;

  const companyById = new Map(
    (companies ?? []).map((c) => [
      String(c.id),
      {
        id: String(c.id),
        name: String(c.RazonSocial ?? c.name ?? c.id),
        codigo: String(c.Codigo ?? ""),
      },
    ])
  );

  const invoices = (rawInv ?? []).map(invoiceInputFromProtoRow);
  const before = computeWorkspacePendingAtCutoff(invoices, wid);

  const byCompany = new Map<string, ReturnType<typeof invoiceRowToOperationalInput>[]>();
  for (const row of rawInv ?? []) {
    const inv = invoiceRowToOperationalInput(row as Record<string, unknown>);
    const cid = String(inv.company_id ?? "").trim() || "__none__";
    const list = byCompany.get(cid) ?? [];
    list.push(inv);
    byCompany.set(cid, list);
  }

  const candidates = [];
  const skipped = [];

  for (const [companyId, companyInvoices] of byCompany) {
    const { candidates: coCandidates, skipped: coSkipped } =
      classifyShadowCandidatesForCompany(companyInvoices);
    for (const c of coCandidates) {
      const co = companyById.get(companyId) ?? { id: companyId, name: companyId, codigo: "" };
      candidates.push({
        ...c,
        company_name: co.name,
        company_codigo: co.codigo,
      });
    }
    for (const s of coSkipped) {
      if (!s.skip_reason) continue;
      skipped.push({
        shadow_id: String(s.shadow.id ?? ""),
        invoice_number: String(s.shadow.invoice_number ?? ""),
        reason: s.skip_reason,
      });
    }
  }

  const candidateIds = new Set(candidates.map((c) => c.shadow_id));
  const simulated = invoices.map((inv) => {
    if (!candidateIds.has(String(inv.id))) return inv;
    return { ...inv, balance_amount: 0, status: "paid" };
  });
  const after = computeWorkspacePendingAtCutoff(simulated, wid);

  const totalUyu = candidates
    .filter((c) => c.shadow_currency === "UYU")
    .reduce((s, c) => s + c.shadow_balance, 0);
  const totalUsd = candidates
    .filter((c) => c.shadow_currency === "USD")
    .reduce((s, c) => s + c.shadow_balance, 0);

  const clientKeys = new Map<string, { company_id: string; name: string; codigo: string }>();
  for (const c of candidates) {
    clientKeys.set(c.company_id, {
      company_id: c.company_id,
      name: c.company_name,
      codigo: c.company_codigo,
    });
  }

  console.log(
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        workspace_company_id: wid,
        feature_flag_enabled: isZetaSaldosShadowReconcileEnabled(),
        rule: "shadow_balance_gt_0 AND paired_ccv1_balance_lte_epsilon",
        pending_at_cutoff_before: before,
        pending_at_cutoff_after_simulated: after,
        pending_unchanged: before.uyu === after.uyu && before.usd === after.usd,
        candidate_count: candidates.length,
        total_uyu: Math.round(totalUyu * 100) / 100,
        total_usd: Math.round(totalUsd * 100) / 100,
        affected_invoice_ids: candidates.map((c) => c.shadow_id).sort(),
        affected_clients: [...clientKeys.values()].sort((a, b) =>
          a.codigo.localeCompare(b.codigo, undefined, { numeric: true })
        ),
        candidates: candidates.sort((a, b) => b.shadow_balance - a.shadow_balance),
        skipped_count: skipped.length,
        skipped,
        all_shadows_with_balance: invoices.filter(
          (i) => isZetaSaldosPendientesShadowRow(i) && pendingBalance(i) > 0
        ).length,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
