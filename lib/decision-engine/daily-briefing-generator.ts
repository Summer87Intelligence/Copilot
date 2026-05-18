/**
 * Decision Engine — Daily Briefing Generator.
 * Orquesta Portfolio Scorer + Client Ranker + Alert Builder.
 * Puro: no llama a DB. Recibe un bundle ya cargado.
 */

import type {
  BriefingAlert,
  DailyBriefing,
  DecisionEngineDataBundle,
  RankedClient,
} from "@/lib/decision-engine/de-types";
import { computePortfolioScore } from "@/lib/decision-engine/portfolio-scorer";
import { rankClients } from "@/lib/decision-engine/client-priority-ranker";

// ---------------------------------------------------------------------------
// Alert builder (reglas de negocio básicas)
// ---------------------------------------------------------------------------

function buildAlerts(
  ranked: RankedClient[],
  totalPendingUYU: number,
  totalPendingUSD: number,
  effectivenessPct: number,
  over90Pct: number
): BriefingAlert[] {
  const alerts: BriefingAlert[] = [];

  // R01 — deuda 90+ supera 25% del total
  if (over90Pct >= 25) {
    alerts.push({
      id: "aging_90_critical",
      severity: "high",
      title: "Deuda crítica envejecida",
      description: `${over90Pct}% de la cartera pendiente supera 90 días sin cobrar.`,
    });
  } else if (over90Pct >= 10) {
    alerts.push({
      id: "aging_90_warn",
      severity: "medium",
      title: "Deuda entrando en zona crítica",
      description: `${over90Pct}% de la deuda supera 90 días.`,
    });
  }

  // R02 — efectividad baja
  if (effectivenessPct < 60) {
    alerts.push({
      id: "effectiveness_critical",
      severity: "high",
      title: "Efectividad de cobranza crítica",
      description: `Solo se cobró el ${effectivenessPct}% de lo facturado en los últimos 90 días.`,
    });
  } else if (effectivenessPct < 80) {
    alerts.push({
      id: "effectiveness_warn",
      severity: "medium",
      title: "Efectividad de cobranza a monitorear",
      description: `Efectividad del ${effectivenessPct}% en los últimos 90 días (objetivo ≥80%).`,
    });
  }

  // R03 — concentración por cliente (USD)
  const usdClients = ranked.filter((c) => c.currency_code === "USD");
  if (totalPendingUSD > 0) {
    const highConcentrationUSD = usdClients.find((c) => c.concentration_pct >= 40);
    if (highConcentrationUSD) {
      alerts.push({
        id: `concentration_usd_${highConcentrationUSD.company_id}`,
        severity: "high",
        title: "Alta concentración en cartera USD",
        description: `${highConcentrationUSD.company_name} concentra el ${highConcentrationUSD.concentration_pct}% de la cartera USD.`,
        currency_code: "USD",
      });
    }
  }

  // R04 — concentración por cliente (UYU)
  const uyuClients = ranked.filter((c) => c.currency_code === "UYU");
  if (totalPendingUYU > 0) {
    const highConcentrationUYU = uyuClients.find((c) => c.concentration_pct >= 40);
    if (highConcentrationUYU) {
      alerts.push({
        id: `concentration_uyu_${highConcentrationUYU.company_id}`,
        severity: "medium",
        title: "Alta concentración en cartera UYU",
        description: `${highConcentrationUYU.company_name} concentra el ${highConcentrationUYU.concentration_pct}% de la cartera UYU.`,
        currency_code: "UYU",
      });
    }
  }

  // R05 — promesas rotas
  const brokenPromiseClients = ranked.filter(
    (c) => c.instruction === "escalar" && c.collection_status === "promised_payment"
  );
  if (brokenPromiseClients.length >= 2) {
    alerts.push({
      id: "broken_promises",
      severity: "high",
      title: "Múltiples promesas de pago incumplidas",
      description: `${brokenPromiseClients.length} clientes con promesas de pago no cumplidas.`,
    });
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

const URGENT_THRESHOLD = 70;
const IMPORTANT_THRESHOLD = 40;
const MAX_URGENT = 3;
const MAX_IMPORTANT = 5;

export function generateDailyBriefing(bundle: DecisionEngineDataBundle): DailyBriefing {
  const now = new Date(bundle.loadedAt);

  const portfolioScore = computePortfolioScore(
    bundle.pendingInvoices,
    bundle.recentInvoices,
    bundle.recentReceipts,
    now
  );

  const allRanked = rankClients(
    bundle.pendingInvoices,
    bundle.companies,
    bundle.recentActions,
    now
  );

  const urgent = allRanked.filter((c) => c.score >= URGENT_THRESHOLD).slice(0, MAX_URGENT);
  const important = allRanked
    .filter((c) => c.score >= IMPORTANT_THRESHOLD && c.score < URGENT_THRESHOLD)
    .slice(0, MAX_IMPORTANT);

  const alerts = buildAlerts(
    allRanked,
    portfolioScore.total_pending_uyu,
    portfolioScore.total_pending_usd,
    portfolioScore.effectiveness_pct,
    portfolioScore.over90_pct
  );

  return {
    generated_at: bundle.loadedAt,
    portfolio_score: portfolioScore,
    urgent,
    important,
    alerts,
    total_pending_uyu: portfolioScore.total_pending_uyu,
    total_pending_usd: portfolioScore.total_pending_usd,
    total_debtors: portfolioScore.active_debtors_count,
  };
}
