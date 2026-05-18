/**
 * Decision Engine — Daily Briefing Generator.
 * Orquesta Portfolio Scorer + Client Ranker + Alert Builder.
 * Puro: no llama a DB. Recibe un bundle ya cargado.
 */

import type {
  BriefingAlert,
  DailyBriefing,
  DecisionEngineDataBundle,
  DEFollowUpRow,
  DEOperationalStateRow,
  FollowUpQueueItem,
  FollowUpResult,
  RankedClient,
  SlaStatus,
} from "@/lib/decision-engine/de-types";
import { RISK_LEVEL_SCORES } from "@/lib/decision-engine/de-types";
import { scheduledForDayKey } from "@/lib/data/decision-follow-up-repository";
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
const MAX_FOLLOW_UP_QUEUE = 15;

const ACTIONABLE_SLA = new Set(["critical", "overdue", "due_today", "no_contact"]);
const ACTIONABLE_LEGACY_STATES = new Set([
  "escalated_active",
  "overdue_no_contact",
  "awaiting_promise",
  "retry_call",
]);
const ACTIONABLE_MACHINE_STATES = new Set([
  "new_risk",
  "follow_up",
  "payment_promised",
  "escalated",
  "critical",
  "legal_review",
]);

function isActionableMachineState(state: DEOperationalStateRow | undefined): boolean {
  if (!state) return false;
  return (
    ACTIONABLE_MACHINE_STATES.has(state.machine_state) ||
    state.breached_sla
  );
}

function isActionableFollowUp(
  result: FollowUpResult,
  machineState?: DEOperationalStateRow
): boolean {
  return (
    ACTIONABLE_SLA.has(result.sla_status) ||
    ACTIONABLE_LEGACY_STATES.has(result.operational_state) ||
    isActionableMachineState(machineState)
  );
}

function slaFromScheduled(scheduledFor: string, now: Date): SlaStatus {
  const target = new Date(scheduledFor);
  if (isNaN(target.getTime())) return "ok";
  const diffDays = (target.getTime() - now.getTime()) / 86_400_000;
  if (diffDays < 0) return "overdue";
  if (diffDays < 1) return "due_today";
  if (diffDays <= 3) return "due_soon";
  return "ok";
}

function followUpResultFromDb(
  state: DEOperationalStateRow | undefined,
  row: DEFollowUpRow,
  now: Date
): FollowUpResult {
  const nextAt = state?.next_follow_up_at ?? row.scheduled_for;
  const nextDate = scheduledForDayKey(nextAt);
  return {
    next_follow_up_at: nextDate,
    sla_status: slaFromScheduled(row.scheduled_for, now),
    pending_action: row.reason ?? "Seguimiento programado",
    snoozed_until: null,
    follow_up_reason: row.reason ?? "Seguimiento en cola operativa",
    operational_state: state?.legacy_follow_up_state ?? "monitor",
  };
}

function buildFollowUpQueueFromRanked(allRanked: RankedClient[]): FollowUpQueueItem[] {
  return allRanked
    .filter((c) => isActionableFollowUp(c.follow_up_result))
    .slice(0, MAX_FOLLOW_UP_QUEUE)
    .map((c) => ({
      company_id:        c.company_id,
      company_name:      c.company_name,
      currency_code:     c.currency_code,
      pending_amount:    c.pending_amount,
      oldest_days:       c.oldest_days,
      risk_level:        c.risk_assessment.level,
      risk_score:        c.risk_assessment.score,
      follow_up_result:  c.follow_up_result,
      recommendation:    c.recommendation,
      collection_status: c.collection_status,
      last_action_date:  c.last_action_date,
      promise_date:      c.promise_date,
    }));
}

function buildFollowUpQueueFromDb(
  bundle: DecisionEngineDataBundle,
  allRanked: RankedClient[],
  now: Date
): FollowUpQueueItem[] {
  const rankedById = new Map(allRanked.map((c) => [c.company_id, c]));
  const stateByCustomer = new Map(
    bundle.operationalStates.map((s) => [s.customer_id, s])
  );
  const companyById = new Map(bundle.companies.map((c) => [c.id, c.name]));

  const items: FollowUpQueueItem[] = [];
  const sorted = [...bundle.pendingFollowUps].sort(
    (a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime()
  );

  for (const row of sorted) {
    if (items.length >= MAX_FOLLOW_UP_QUEUE) break;

    const state = stateByCustomer.get(row.customer_id);
    const ranked = rankedById.get(row.customer_id);
    const follow_up_result =
      ranked?.follow_up_result ?? followUpResultFromDb(state, row, now);

    if (!isActionableFollowUp(follow_up_result, state)) continue;

    items.push({
      company_id:        row.customer_id,
      company_name:
        ranked?.company_name ?? companyById.get(row.customer_id) ?? row.customer_id,
      currency_code:     ranked?.currency_code ?? "UYU",
      pending_amount:    ranked?.pending_amount ?? 0,
      oldest_days:       ranked?.oldest_days ?? 0,
      risk_level:        state?.current_risk ?? ranked?.risk_assessment.level ?? "medium",
      risk_score:
        ranked?.risk_assessment.score ??
        RISK_LEVEL_SCORES[state?.current_risk ?? "medium"],
      follow_up_result: {
        ...follow_up_result,
        follow_up_reason: state?.transition_reason ?? follow_up_result.follow_up_reason,
      },
      recommendation:
        ranked?.recommendation ??
        ({
          action: "monitor",
          channel: null,
          urgency: "medium",
          rationale: ["Cola operativa persistida"],
          confidence: 0.5,
          next_suggested_at: follow_up_result.next_follow_up_at,
        } as FollowUpQueueItem["recommendation"]),
      collection_status: ranked?.collection_status ?? null,
      last_action_date:  ranked?.last_action_date ?? null,
      promise_date:      ranked?.promise_date ?? null,
    });
  }

  return items;
}

function buildFollowUpQueue(
  bundle: DecisionEngineDataBundle,
  allRanked: RankedClient[],
  now: Date
): FollowUpQueueItem[] {
  if (bundle.pendingFollowUps.length > 0) {
    const dbQueue = buildFollowUpQueueFromDb(bundle, allRanked, now);
    if (dbQueue.length > 0) return dbQueue;
  }
  return buildFollowUpQueueFromRanked(allRanked);
}

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

  const follow_up_queue = buildFollowUpQueue(bundle, allRanked, now);

  return {
    generated_at: bundle.loadedAt,
    portfolio_score: portfolioScore,
    urgent,
    important,
    alerts,
    total_pending_uyu: portfolioScore.total_pending_uyu,
    total_pending_usd: portfolioScore.total_pending_usd,
    total_debtors: portfolioScore.active_debtors_count,
    follow_up_queue,
  };
}
