/**
 * FASE 2 — Dry-run read-only: shadows `ccv1_still_open` que son duplicados exactos
 * del CCV1 canónico abierto. NO modifica datos.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/reconcile-zeta-saldos-shadows-phase2-dry-run.ts
 *   npx tsx --env-file=.env.local scripts/reconcile-zeta-saldos-shadows-phase2-dry-run.ts --zeta-live
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { invoiceInputFromProtoRow } from "@/lib/copilot-financial-reconciliation";
import { MIN_FINANCIAL_DATE } from "@/lib/copilot-operational-period";
import { loadZetaServerConfig } from "@/lib/integrations/zeta/zeta-config";
import {
  mapSaldoRowsToZetaInvoicesBestEffort,
  queryFacturaClienteSaldosPendientes,
} from "@/lib/integrations/zeta/zeta-factura-cliente";
import type { ZetaCallContext } from "@/lib/integrations/zeta/zeta-http-client";
import {
  computeWorkspacePendingAtCutoff,
  invoiceRowToOperationalInput,
  pairShadowToRealStrict,
  roundShadowAmount,
  SHADOW_RECONCILE_EPSILON,
} from "@/lib/integrations/zeta/zeta-saldos-shadow-reconciliation";
import {
  extractRegistroIdsFromInvoiceZetaMetadata,
  parseZetaLegacyRegistroIdFromInvoiceNumber,
} from "@/lib/integrations/zeta/zeta-proto-invoice-registro-match";
import {
  isZetaSaldosPendientesShadowRow,
  readOperationalDebtInvoiceCurrency,
  selectOperationalDebtInvoicesForSummation,
  type OperationalDebtInvoiceInput,
} from "@/lib/zeta/zeta-operational-debt-dedup";

const EXPECTED_UYU = 599_425;
const EXPECTED_USD = 8_152.06;
const WITH_ZETA_LIVE = process.argv.includes("--zeta-live");

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function ymd(iso: unknown): string {
  const s = String(iso ?? "").trim();
  return s.length >= 10 ? s.slice(0, 10) : "";
}

function pendingBalance(inv: OperationalDebtInvoiceInput): number {
  return Math.max(0, num(inv.balance_amount));
}

function balancesMatchExact(a: number, b: number): boolean {
  return Math.abs(a - b) <= SHADOW_RECONCILE_EPSILON;
}

function isRealCcv1(inv: OperationalDebtInvoiceInput): boolean {
  return String(inv.invoice_number ?? "").startsWith("ZETA:CCV1:");
}

export type Phase2SkipReason =
  | "not_ccv1_still_open"
  | "balance_mismatch"
  | "date_incompatible"
  | "registro_metadata_missing"
  | "dedupe_includes_shadow"
  | "ambiguous_fallback"
  | "ambiguous_registro"
  | "ambiguous_balance"
  | "no_ccv1_pair"
  | "shadow_ineligible"
  | "ccv1_void";

export type Phase2Candidate = {
  shadow_id: string;
  shadow_invoice_number: string;
  shadow_balance: number;
  shadow_currency: string;
  shadow_issue_date: string;
  company_id: string;
  company_name: string;
  company_codigo: string;
  ccv1_id: string;
  ccv1_invoice_number: string;
  ccv1_balance: number;
  ccv1_issue_date: string;
  pair_reason: string;
  balance_delta: number;
  date_match: boolean;
  registro_id: string | null;
  registro_match: boolean;
  registro_proof: string;
  dedupe_excludes_shadow: boolean;
  gate_checks: Record<string, boolean>;
};

function dedupeExcludesShadow(
  companyInvoices: OperationalDebtInvoiceInput[],
  ccv1Id: string,
  shadowId: string
): boolean {
  const selections = selectOperationalDebtInvoicesForSummation(companyInvoices);
  const ccv1Sel = selections.find((s) => String(s.invoice.id ?? "") === ccv1Id);
  if (ccv1Sel?.skippedShadowIds.includes(shadowId)) return true;

  const shadowSel = selections.find((s) => String(s.invoice.id ?? "") === shadowId);
  if (!shadowSel) return true;

  return false;
}

function classifyPhase2Candidate(
  shadow: OperationalDebtInvoiceInput,
  reals: OperationalDebtInvoiceInput[],
  companyInvoices: OperationalDebtInvoiceInput[],
  companyMeta: { name: string; codigo: string }
): { candidate: Phase2Candidate | null; skip: { reason: Phase2SkipReason; detail: string } | null } {
  const pair = pairShadowToRealStrict(shadow, reals);

  if (pair.skip_reason === "ambiguous_fallback") {
    return { candidate: null, skip: { reason: "ambiguous_fallback", detail: "múltiples CCV1 fallback" } };
  }
  if (pair.skip_reason === "ambiguous_registro") {
    return { candidate: null, skip: { reason: "ambiguous_registro", detail: "múltiples CCV1 por RegistroId" } };
  }
  if (pair.skip_reason === "ambiguous_balance") {
    return { candidate: null, skip: { reason: "ambiguous_balance", detail: "múltiples CCV1 por saldo" } };
  }
  if (pair.skip_reason === "no_ccv1_pair" || pair.skip_reason === "shadow_ineligible") {
    return {
      candidate: null,
      skip: { reason: pair.skip_reason ?? "no_ccv1_pair", detail: "sin emparejamiento único" },
    };
  }
  if (pair.skip_reason === "ccv1_void") {
    return { candidate: null, skip: { reason: "ccv1_void", detail: "CCV1 void/anulado" } };
  }
  if (pair.skip_reason !== "ccv1_still_open" || !pair.real || !pair.pair_reason) {
    return {
      candidate: null,
      skip: {
        reason: "not_ccv1_still_open",
        detail: pair.skip_reason ?? "no es ccv1_still_open",
      },
    };
  }

  const ccv1 = pair.real;
  const shadowBal = roundShadowAmount(pendingBalance(shadow));
  const ccv1Bal = roundShadowAmount(pendingBalance(ccv1));
  const shadowIssue = ymd(shadow.issue_date);
  const ccv1Issue = ymd(ccv1.issue_date);
  const registroId = parseZetaLegacyRegistroIdFromInvoiceNumber(String(shadow.invoice_number ?? ""));
  const ccv1RegIds = extractRegistroIdsFromInvoiceZetaMetadata(ccv1.zeta_metadata);
  const ccv1HasRegistroMeta = ccv1RegIds.length > 0;
  /** Regla 9: si CCV1 tiene RegistroId en metadata → debe coincidir con shadow ZETA:{id}.
   *  Si CCV1 no tiene metadata → prueba por registro_fallback único (fecha+saldo+company). */
  const registroOk =
    !ccv1HasRegistroMeta
      ? pair.pair_reason === "registro_metadata" ||
        pair.pair_reason === "registro_fallback" ||
        pair.pair_reason === "balance_unique"
      : registroId != null && ccv1RegIds.includes(registroId);
  const registroProof = ccv1HasRegistroMeta
    ? registroId != null && ccv1RegIds.includes(registroId)
      ? "registro_metadata_match"
      : "registro_metadata_mismatch"
    : pair.pair_reason === "registro_fallback"
      ? "shadow_registro_id_via_invoice_number_fallback"
      : pair.pair_reason;

  const balanceOk = balancesMatchExact(shadowBal, ccv1Bal);
  const dateOk =
    (shadowIssue !== "" && shadowIssue === ccv1Issue) ||
    pair.pair_reason === "registro_metadata" ||
    (pair.pair_reason === "registro_fallback" && shadowIssue === ccv1Issue);
  const dedupeOk = dedupeExcludesShadow(
    companyInvoices,
    String(ccv1.id ?? ""),
    String(shadow.id ?? "")
  );

  const gateChecks = {
    shadow_category: isZetaSaldosPendientesShadowRow(shadow),
    shadow_balance_gt_0: shadowBal > SHADOW_RECONCILE_EPSILON,
    unique_ccv1_pair: true,
    ccv1_balance_gt_0: ccv1Bal > SHADOW_RECONCILE_EPSILON,
    same_company: String(shadow.company_id) === String(ccv1.company_id),
    same_currency:
      readOperationalDebtInvoiceCurrency(shadow) === readOperationalDebtInvoiceCurrency(ccv1),
    balance_match: balanceOk,
    date_compatible: dateOk,
    registro_match: registroOk,
    dedupe_excludes_shadow: dedupeOk,
  };

  const allGates = Object.values(gateChecks).every(Boolean);

  if (!allGates) {
    let reason: Phase2SkipReason = "balance_mismatch";
    if (!dateOk) reason = "date_incompatible";
    else if (!registroOk) reason = "registro_metadata_missing";
    else if (!dedupeOk) reason = "dedupe_includes_shadow";
    else if (!balanceOk) reason = "balance_mismatch";

    return {
      candidate: null,
      skip: {
        reason,
        detail: JSON.stringify({
          gateChecks,
          shadowBal,
          ccv1Bal,
          shadowIssue,
          ccv1Issue,
          pair_reason: pair.pair_reason,
        }),
      },
    };
  }

  const cur = readOperationalDebtInvoiceCurrency(shadow) ?? "?";
  return {
    candidate: {
      shadow_id: String(shadow.id),
      shadow_invoice_number: String(shadow.invoice_number ?? ""),
      shadow_balance: shadowBal,
      shadow_currency: cur,
      shadow_issue_date: shadowIssue,
      company_id: String(shadow.company_id ?? ""),
      company_name: companyMeta.name,
      company_codigo: companyMeta.codigo,
      ccv1_id: String(ccv1.id),
      ccv1_invoice_number: String(ccv1.invoice_number ?? ""),
      ccv1_balance: ccv1Bal,
      ccv1_issue_date: ccv1Issue,
      pair_reason: pair.pair_reason,
      balance_delta: roundShadowAmount(Math.abs(shadowBal - ccv1Bal)),
      date_match: dateOk,
      registro_id: registroId,
      registro_match: registroOk,
      registro_proof: String(registroProof),
      dedupe_excludes_shadow: dedupeOk,
      gate_checks: gateChecks,
    },
    skip: null,
  };
}

async function fetchZetaLiveTotalsForClients(
  wid: string,
  clientCodigos: string[]
): Promise<{ uyu: number; usd: number; rows: number; perClient: Record<string, { uyu: number; usd: number }> }> {
  const config = loadZetaServerConfig();
  const ctx: ZetaCallContext = { tenantId: wid, requestId: `phase2-dry-${Date.now()}` };
  let uyu = 0;
  let usd = 0;
  let rows = 0;
  const perClient: Record<string, { uyu: number; usd: number }> = {};

  for (let i = 0; i < clientCodigos.length; i++) {
    const codigo = clientCodigos[i]!;
    if (i > 0) await new Promise((r) => setTimeout(r, 350));
    let page = "1";
    let cUyu = 0;
    let cUsd = 0;
    for (let guard = 0; guard < 10; guard++) {
      const res = await queryFacturaClienteSaldosPendientes(ctx, { clienteCodigo: codigo, page }, config);
      const mapped = mapSaldoRowsToZetaInvoicesBestEffort("__phase2__", res.rows);
      for (const z of mapped) {
        const saldo = roundShadowAmount(z.outstandingAmount ?? 0);
        if (saldo <= SHADOW_RECONCILE_EPSILON) continue;
        rows += 1;
        if (z.currency === "USD") {
          usd = roundShadowAmount(usd + saldo);
          cUsd = roundShadowAmount(cUsd + saldo);
        } else {
          uyu = roundShadowAmount(uyu + saldo);
          cUyu = roundShadowAmount(cUyu + saldo);
        }
      }
      if (res.isLastPage !== false) break;
      page = String(Number(page) + 1);
    }
    perClient[codigo] = { uyu: cUyu, usd: cUsd };
  }

  return { uyu, usd, rows, perClient };
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
  const pendingBefore = computeWorkspacePendingAtCutoff(invoices, wid);

  const byCompany = new Map<string, OperationalDebtInvoiceInput[]>();
  for (const row of rawInv ?? []) {
    const inv = invoiceRowToOperationalInput(row as Record<string, unknown>);
    const cid = String(inv.company_id ?? "").trim() || "__none__";
    const list = byCompany.get(cid) ?? [];
    list.push(inv);
    byCompany.set(cid, list);
  }

  const candidates: Phase2Candidate[] = [];
  const skippedPhase2: { shadow_id: string; invoice_number: string; reason: Phase2SkipReason; detail: string }[] =
    [];
  const ambiguous: { shadow_id: string; invoice_number: string; reason: string }[] = [];

  for (const [companyId, companyInvoices] of byCompany) {
    const co = companyById.get(companyId) ?? { id: companyId, name: companyId, codigo: "" };
    const shadows = companyInvoices.filter(
      (inv) =>
        isZetaSaldosPendientesShadowRow(inv) && pendingBalance(inv) > SHADOW_RECONCILE_EPSILON
    );
    const reals = companyInvoices.filter((inv) => isRealCcv1(inv));

    for (const shadow of shadows) {
      const { candidate, skip } = classifyPhase2Candidate(shadow, reals, companyInvoices, {
        name: co.name,
        codigo: co.codigo,
      });
      if (candidate) {
        candidates.push(candidate);
      } else if (skip) {
        const entry = {
          shadow_id: String(shadow.id ?? ""),
          invoice_number: String(shadow.invoice_number ?? ""),
          reason: skip.reason,
          detail: skip.detail,
        };
        if (
          skip.reason === "ambiguous_fallback" ||
          skip.reason === "ambiguous_registro" ||
          skip.reason === "ambiguous_balance"
        ) {
          ambiguous.push({ ...entry, reason: skip.reason });
        } else {
          skippedPhase2.push(entry);
        }
      }
    }
  }

  const candidateIds = new Set(candidates.map((c) => c.shadow_id));
  const simulated = invoices.map((inv) => {
    if (!candidateIds.has(String(inv.id))) return inv;
    return { ...inv, balance_amount: 0, status: "paid" };
  });
  const pendingAfter = computeWorkspacePendingAtCutoff(simulated, wid);

  const totalUyu = candidates
    .filter((c) => c.shadow_currency === "UYU")
    .reduce((s, c) => s + c.shadow_balance, 0);
  const totalUsd = candidates
    .filter((c) => c.shadow_currency === "USD")
    .reduce((s, c) => s + c.shadow_balance, 0);

  const clientKeys = new Map<string, { company_id: string; name: string; codigo: string; shadow_count: number }>();
  for (const c of candidates) {
    const prev = clientKeys.get(c.company_id);
    if (prev) prev.shadow_count += 1;
    else
      clientKeys.set(c.company_id, {
        company_id: c.company_id,
        name: c.company_name,
        codigo: c.company_codigo,
        shadow_count: 1,
      });
  }

  let zetaLive: Awaited<ReturnType<typeof fetchZetaLiveTotalsForClients>> | null = null;
  if (WITH_ZETA_LIVE) {
    const codigos = [...new Set(candidates.map((c) => c.company_codigo).filter(Boolean))];
    zetaLive = await fetchZetaLiveTotalsForClients(wid, codigos);
  }

  const rollbackPlan = {
    description:
      "Antes de --apply FASE 2, capturar snapshot JSON con id, balance_amount, status, zeta_metadata por shadow candidato.",
    snapshot_template: candidates.map((c) => ({
      id: c.shadow_id,
      invoice_number: c.shadow_invoice_number,
      company_id: c.company_id,
      balance_amount: c.shadow_balance,
      status: "issued",
      paired_ccv1_id: c.ccv1_id,
    })),
    restore_steps: [
      "1. Leer tmp/shadow-reconcile-phase2-snapshot-{date}.json",
      "2. Por cada fila: UPDATE proto_invoices SET balance_amount, status, zeta_metadata FROM snapshot",
      "3. Re-ejecutar audit:debt-rollup-consistency y audit-zeta-live-pending-vs-db",
      "4. Verificar pendingAtCutoff UYU=599425 USD=8152.06",
    ],
    feature_flag: "ZETA_SALDOS_SHADOW_RECONCILE_PHASE2=1 (propuesto, no implementado aún)",
  };

  const report = {
    phase: "FASE_2_DRY_RUN",
    generated_at: new Date().toISOString(),
    workspace_company_id: wid,
    design_only: true,
    apply_blocked: true,
    rule_summary: [
      "shadow.category = Zeta / saldos pendientes",
      "shadow.balance_amount > 0",
      "exactamente 1 CCV1 emparejado",
      "CCV1.balance_amount > 0",
      "misma company + moneda",
      "mismo saldo pendiente (tolerancia 0.005)",
      "misma fecha o registro_metadata",
      "RegistroId en metadata CCV1 si shadow lo tiene",
      "dedupe operativo excluye shadow (CCV1 gana)",
      "cuotas: validación en apply (no dry-run)",
      "pendingAtCutoff idéntico antes/después",
    ],
    pending_at_cutoff_before: pendingBefore,
    pending_at_cutoff_after_simulated: pendingAfter,
    pending_matches_baseline:
      Math.abs(pendingBefore.uyu - EXPECTED_UYU) <= 0.01 &&
      Math.abs(pendingBefore.usd - EXPECTED_USD) <= 0.01,
    pending_unchanged_after_simulation:
      Math.abs(pendingAfter.uyu - pendingBefore.uyu) <= 0.01 &&
      Math.abs(pendingAfter.usd - pendingBefore.usd) <= 0.01,
    expected_baseline: { uyu: EXPECTED_UYU, usd: EXPECTED_USD },
    all_shadows_with_balance: invoices.filter(
      (i) => isZetaSaldosPendientesShadowRow(i) && pendingBalance(i) > SHADOW_RECONCILE_EPSILON
    ).length,
    candidate_count: candidates.length,
    total_uyu_shadow_amount: roundShadowAmount(totalUyu),
    total_usd_shadow_amount: roundShadowAmount(totalUsd),
    note_shadow_amounts_not_in_pending:
      "Montos shadow NO suman a pendingAtCutoff (dedupe ya excluye); cierre = higiene DB.",
    affected_clients: [...clientKeys.values()].sort((a, b) =>
      a.codigo.localeCompare(b.codigo, undefined, { numeric: true })
    ),
    candidates: candidates.sort((a, b) => b.shadow_balance - a.shadow_balance),
    skipped_phase2_count: skippedPhase2.length,
    skipped_phase2: skippedPhase2.sort((a, b) => a.invoice_number.localeCompare(b.invoice_number)),
    ambiguous_count: ambiguous.length,
    ambiguous,
    zeta_live_affected_clients: zetaLive,
    copilot_vs_zeta_note: WITH_ZETA_LIVE
      ? "Zeta LIVE por clientes afectados debe coincidir con suma CCV1 (no shadows) — sin cambio tras simulación."
      : "Re-ejecutar con --zeta-live para validación LIVE por cliente afectado.",
    rollback_plan: rollbackPlan,
  };

  const outPath = path.join(
    process.cwd(),
    "tmp",
    `shadow-reconcile-phase2-dry-run-${new Date().toISOString().slice(0, 10)}.json`
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");

  console.log(JSON.stringify({ ...report, output_path: outPath }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
