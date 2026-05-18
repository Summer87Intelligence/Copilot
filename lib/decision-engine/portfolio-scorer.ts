/**
 * Decision Engine — Portfolio Scorer MVP.
 * Puro: sin DB, sin side effects, 100% testeable.
 *
 * Score = efectividad×0.40 + aging×0.35 + concentración×0.25
 */

import type {
  DecisionBand,
  DEPendingInvoice,
  DERecentInvoice,
  DERecentReceipt,
  PortfolioScore,
} from "@/lib/decision-engine/de-types";
import { DECISION_BAND_LABELS } from "@/lib/decision-engine/de-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function roundInt(n: number): number {
  return Math.round(clamp(n, 0, 100));
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

function syntheticDue(issueDate: string | null): Date | null {
  if (!issueDate) return null;
  const d = new Date(issueDate);
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + 30);
  return d;
}

// ---------------------------------------------------------------------------
// Componente 1: Efectividad de cobranza (últimos 90 días)
// ---------------------------------------------------------------------------

type EffectivenessResult = {
  score: number;
  pct: number;
};

function computeEffectivenessScore(
  invoices90d: DERecentInvoice[],
  receipts90d: DERecentReceipt[]
): EffectivenessResult {
  const invoicedByCurrency: Record<string, number> = {};
  const collectedByCurrency: Record<string, number> = {};

  for (const inv of invoices90d) {
    const cur = (inv.currency_code ?? "UYU").toUpperCase();
    invoicedByCurrency[cur] = (invoicedByCurrency[cur] ?? 0) + inv.total_amount;
  }
  for (const rec of receipts90d) {
    const cur = (rec.currency_code ?? "UYU").toUpperCase();
    collectedByCurrency[cur] = (collectedByCurrency[cur] ?? 0) + rec.amount;
  }

  const ratios: number[] = [];
  for (const [cur, invoiced] of Object.entries(invoicedByCurrency)) {
    if (invoiced > 0) {
      const collected = collectedByCurrency[cur] ?? 0;
      ratios.push(Math.min(collected / invoiced, 1.5));
    }
  }

  if (ratios.length === 0) {
    return { score: 50, pct: 50 };
  }

  const avg = ratios.reduce((s, r) => s + r, 0) / ratios.length;
  const pct = Math.round(Math.min(avg, 1) * 100);
  const score = roundInt(Math.min(avg, 1) * 100);
  return { score, pct };
}

// ---------------------------------------------------------------------------
// Componente 2: Calidad del aging
// ---------------------------------------------------------------------------

type AgingResult = {
  score: number;
  over90_pct: number;
};

const AGING_QUALITY_WEIGHT: Record<string, number> = {
  not_due:  1.0,
  "0-30":   0.85,
  "31-60":  0.50,
  "61-90":  0.20,
  "90+":    0.0,
};

function invoiceAgingBucket(inv: DEPendingInvoice, now: Date): string {
  const dueRaw = inv.due_date ?? null;
  const due = dueRaw
    ? new Date(dueRaw)
    : syntheticDue(inv.issue_date);

  if (!due) return "0-30";
  const days = daysBetween(due, now);
  if (days < 0) return "not_due";
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

function computeAgingScore(
  pendingInvoices: DEPendingInvoice[],
  now: Date
): AgingResult {
  if (pendingInvoices.length === 0) return { score: 100, over90_pct: 0 };

  let totalAmount = 0;
  let weightedAmount = 0;
  let over90Amount = 0;

  for (const inv of pendingInvoices) {
    const amount = inv.balance_amount > 0 ? inv.balance_amount : 0;
    if (amount <= 0) continue;

    const bucket = invoiceAgingBucket(inv, now);
    const weight = AGING_QUALITY_WEIGHT[bucket] ?? 0;
    totalAmount += amount;
    weightedAmount += amount * weight;
    if (bucket === "90+") over90Amount += amount;
  }

  if (totalAmount === 0) return { score: 100, over90_pct: 0 };

  const agingQuality = weightedAmount / totalAmount;
  const over90_pct = Math.round((over90Amount / totalAmount) * 100);
  const score = roundInt(agingQuality * 100);
  return { score, over90_pct };
}

// ---------------------------------------------------------------------------
// Componente 3: Concentración (Herfindahl per currency)
// ---------------------------------------------------------------------------

function computeConcentrationScore(pendingInvoices: DEPendingInvoice[]): number {
  if (pendingInvoices.length === 0) return 100;

  const pendingByCompanyByCurrency: Record<string, Record<string, number>> = {};
  for (const inv of pendingInvoices) {
    if (inv.balance_amount <= 0) continue;
    const cur = (inv.currency_code ?? "UYU").toUpperCase();
    if (!pendingByCompanyByCurrency[cur]) pendingByCompanyByCurrency[cur] = {};
    const byCur = pendingByCompanyByCurrency[cur]!;
    byCur[inv.company_id] = (byCur[inv.company_id] ?? 0) + inv.balance_amount;
  }

  const hhiValues: number[] = [];
  for (const byCur of Object.values(pendingByCompanyByCurrency)) {
    const total = Object.values(byCur).reduce((s, v) => s + v, 0);
    if (total <= 0) continue;
    const hhi = Object.values(byCur).reduce((s, v) => {
      const share = v / total;
      return s + share * share;
    }, 0);
    hhiValues.push(hhi);
  }

  if (hhiValues.length === 0) return 100;
  const avgHHI = hhiValues.reduce((s, v) => s + v, 0) / hhiValues.length;

  // HHI ≤ 0.10 → 100pts;  HHI ≥ 0.50 → 0pts; linear in between
  if (avgHHI <= 0.1) return 100;
  if (avgHHI >= 0.5) return 0;
  return roundInt(((0.5 - avgHHI) / 0.4) * 100);
}

// ---------------------------------------------------------------------------
// Band derivation
// ---------------------------------------------------------------------------

function scoreToBand(score: number): DecisionBand {
  if (score >= 80) return "saludable";
  if (score >= 60) return "atencion";
  if (score >= 40) return "riesgo_moderado";
  return "critico";
}

// ---------------------------------------------------------------------------
// Totals helpers
// ---------------------------------------------------------------------------

function totalPendingByCurrency(
  pendingInvoices: DEPendingInvoice[],
  currency: string
): number {
  return pendingInvoices
    .filter((i) => (i.currency_code ?? "").toUpperCase() === currency)
    .reduce((s, i) => s + (i.balance_amount > 0 ? i.balance_amount : 0), 0);
}

function countActiveDebtors(pendingInvoices: DEPendingInvoice[]): number {
  const companies = new Set(
    pendingInvoices.filter((i) => i.balance_amount > 0).map((i) => i.company_id)
  );
  return companies.size;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export function computePortfolioScore(
  pendingInvoices: DEPendingInvoice[],
  recentInvoices: DERecentInvoice[],
  recentReceipts: DERecentReceipt[],
  now?: Date
): PortfolioScore {
  const ref = now ?? new Date();

  const { score: effectivenessScore, pct: effectivenessPct } =
    computeEffectivenessScore(recentInvoices, recentReceipts);

  const { score: agingScore, over90_pct } = computeAgingScore(pendingInvoices, ref);

  const concentrationScore = computeConcentrationScore(pendingInvoices);

  const compositeRaw =
    effectivenessScore * 0.40 +
    agingScore        * 0.35 +
    concentrationScore * 0.25;

  const score = roundInt(compositeRaw);
  const band = scoreToBand(score);

  return {
    score,
    band,
    band_label: DECISION_BAND_LABELS[band],
    effectiveness_score: effectivenessScore,
    aging_score: agingScore,
    concentration_score: concentrationScore,
    total_pending_uyu: Math.round(totalPendingByCurrency(pendingInvoices, "UYU")),
    total_pending_usd: Math.round(totalPendingByCurrency(pendingInvoices, "USD") * 100) / 100,
    active_debtors_count: countActiveDebtors(pendingInvoices),
    effectiveness_pct: effectivenessPct,
    over90_pct,
  };
}
