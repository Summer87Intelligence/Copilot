/**
 * Phase 5B — orquestación predictiva (cache + generación).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  indexDecisionEngineOperationalData,
  loadDecisionEngineBundle,
} from "@/lib/data/decision-engine-data-loader";
import {
  isPredictiveSnapshotFresh,
  isPredictiveSnapshotPayloadCurrent,
  readPredictiveSnapshot,
  upsertPredictiveSnapshot,
} from "@/lib/data/decision-predictive-snapshot-repository";
import { readDailyQueueSnapshot } from "@/lib/data/decision-daily-queue-repository";
import { selectOperationalOwnershipStats } from "@/lib/data/decision-operational-state-repository";
import { buildClientOperationalSummaries } from "@/lib/decision-engine/client-operational-summary-builder";
import { loadDailyQueueHydration } from "@/lib/decision-engine/daily-queue-hydration";
import { QUEUE_SECTION_ORDER } from "@/lib/decision-engine/daily-operations-queue-panel.helpers";
import type { DailyOperationsQueue, DERecentReceipt } from "@/lib/decision-engine/de-types";
import { getOperationalAnalytics } from "@/lib/decision-engine/operational-analytics-orchestrator";
import { buildPortfolioDeteriorationForecasts } from "@/lib/decision-engine/predictive/portfolio-deterioration-forecast";
import { buildOperatorLoadForecasts } from "@/lib/decision-engine/predictive/operator-load-forecast";
import {
  buildRecoveryLikelihoodInput,
  computeRecoveryLikelihood,
} from "@/lib/decision-engine/predictive/recovery-likelihood-engine";
import { detectRecoveryOpportunities } from "@/lib/decision-engine/predictive/recovery-opportunity-detector";
import { buildSLAStressForecasts } from "@/lib/decision-engine/predictive/sla-stress-forecast";
import type {
  PredictiveBundle,
  PredictiveContext,
  PredictiveSnapshot,
  RecoveryLikelihood,
} from "@/lib/decision-engine/predictive/predictive-types";
import type { CopilotRequestLogger } from "@/lib/copilot-structured-logger";

export const PREDICTIVE_SNAPSHOT_TYPE = "predictive_v1";

function indexReceiptsByCustomer(receipts: DERecentReceipt[]): Map<string, DERecentReceipt[]> {
  const map = new Map<string, DERecentReceipt[]>();
  for (const r of receipts) {
    if (!r.company_id) continue;
    const list = map.get(r.company_id) ?? [];
    list.push(r);
    map.set(r.company_id, list);
  }
  return map;
}

async function loadPredictiveContext(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<PredictiveContext> {
  const [analyticsResult, queueRow, ownership, bundle] = await Promise.all([
    getOperationalAnalytics(supabase, tenantCompanyId, { force: false }),
    readDailyQueueSnapshot(supabase, tenantCompanyId),
    selectOperationalOwnershipStats(supabase, tenantCompanyId),
    loadDecisionEngineBundle(supabase, tenantCompanyId),
  ]);

  const queue: DailyOperationsQueue | null = queueRow?.payload ?? null;
  const allTasks = queue
    ? QUEUE_SECTION_ORDER.flatMap((sec) => queue.sections[sec] ?? [])
    : [];

  const hydration_by_customer = queue
    ? await loadDailyQueueHydration(supabase, tenantCompanyId, queue)
    : {};

  const opIndex = indexDecisionEngineOperationalData(bundle);

  return {
    analytics: analyticsResult.analytics,
    queue,
    ownership,
    client_summaries: buildClientOperationalSummaries(allTasks),
    hydration_by_customer,
    recent_actions_by_customer: opIndex.recentActionsByCustomer,
    follow_ups_by_customer: opIndex.pendingFollowUpByCustomer,
    recent_receipts_by_customer: indexReceiptsByCustomer(bundle.recentReceipts),
    loaded_at: new Date().toISOString(),
  };
}

function buildExecutiveSummary(snapshot: Omit<PredictiveSnapshot, "executive_prediction_summary">): string {
  const pf30 = snapshot.portfolio_forecasts.find((f) => f.horizon_days === 30);
  const sla7 = snapshot.sla_forecasts.find((f) => f.horizon_days === 7);
  const avg = snapshot.metrics.avg_recovery_likelihood_pct;
  const opps = snapshot.recovery_opportunities.length;
  const overloaded = snapshot.operator_load_forecasts.filter(
    (o) => o.projected_band === "overloaded" || o.projected_band === "critical"
  ).length;

  const parts: string[] = [];
  parts.push(`Probabilidad media de recuperación: ${avg}%.`);
  if (pf30) {
    parts.push(
      `Cartera a 30d: ${pf30.deterioration_band.toUpperCase()} (+${pf30.projected_risk_delta_pct}% riesgo proyectado).`
    );
  }
  if (sla7) {
    parts.push(`SLA 7d: banda ${sla7.stress_band} (~${sla7.projected_sla_breaches} nuevos incumplimientos).`);
  }
  if (opps > 0) parts.push(`${opps} oportunidad(es) de recuperación rápida detectadas.`);
  if (overloaded > 0) parts.push(`${overloaded} operador(es) en riesgo de sobrecarga futura.`);
  return parts.join(" ");
}

export function buildPredictiveSnapshot(
  ctx: PredictiveContext,
  generationMs: number
): PredictiveSnapshot {
  const recovery_likelihoods: RecoveryLikelihood[] = ctx.client_summaries.map((summary) => {
    const hydration = ctx.hydration_by_customer[summary.customer_id] ?? null;
    const actions = ctx.recent_actions_by_customer.get(summary.customer_id) ?? [];
    const followUp = ctx.follow_ups_by_customer.get(summary.customer_id) ?? null;
    const receipts = ctx.recent_receipts_by_customer.get(summary.customer_id) ?? [];
    const input = buildRecoveryLikelihoodInput(summary, hydration, actions, followUp, receipts);
    return computeRecoveryLikelihood(input);
  });

  const portfolio_forecasts = buildPortfolioDeteriorationForecasts(ctx);
  const sla_forecasts = buildSLAStressForecasts(ctx);
  const operator_load_forecasts = buildOperatorLoadForecasts(ctx.analytics);
  const recovery_opportunities = detectRecoveryOpportunities(ctx);

  const avg_recovery_likelihood_pct =
    recovery_likelihoods.length > 0
      ? Math.round(
          recovery_likelihoods.reduce((s, r) => s + r.probability_pct, 0) /
            recovery_likelihoods.length
        )
      : 0;

  const sla7 = sla_forecasts.find((f) => f.horizon_days === 7);
  const pf30 = portfolio_forecasts.find((f) => f.horizon_days === 30);

  const partial: Omit<PredictiveSnapshot, "executive_prediction_summary"> = {
    generated_at: new Date().toISOString(),
    recovery_likelihoods,
    portfolio_forecasts,
    sla_forecasts,
    operator_load_forecasts,
    recovery_opportunities,
    metrics: {
      predicted_critical_cases: pf30?.projected_critical_cases ?? 0,
      projected_sla_breaches_7d: sla7?.projected_sla_breaches ?? 0,
      recovery_opportunities_count: recovery_opportunities.length,
      avg_recovery_likelihood_pct,
      generation_ms: generationMs,
    },
    source_snapshot_ids: {
      analytics_generated_at: ctx.analytics?.generated_at ?? null,
      queue_generated_at: ctx.queue?.generated_at ?? null,
    },
  };

  return {
    ...partial,
    executive_prediction_summary: buildExecutiveSummary(partial),
  };
}

export async function generatePredictiveSnapshot(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  options: { force?: boolean; persist?: boolean } = {},
  log?: CopilotRequestLogger
): Promise<PredictiveBundle> {
  if (!options.force) {
    const cached = await readPredictiveSnapshot(supabase, tenantCompanyId, PREDICTIVE_SNAPSHOT_TYPE);
    if (cached && isPredictiveSnapshotFresh(cached) && isPredictiveSnapshotPayloadCurrent(cached.payload)) {
      log?.info("predictive_snapshot_cache_hit", { tenant_id: tenantCompanyId });
      return {
        ...cached.payload,
        cached: true,
        expires_at: cached.expires_at,
      };
    }
  }

  const t0 = Date.now();
  log?.info("predictive_snapshot_generated", { tenant_id: tenantCompanyId, phase: "start" });

  const ctx = await loadPredictiveContext(supabase, tenantCompanyId);
  const payload = buildPredictiveSnapshot(ctx, Date.now() - t0);

  log?.info("recovery_likelihood_computed", { count: payload.recovery_likelihoods.length });
  log?.info("portfolio_forecast_generated", {
    horizons: payload.portfolio_forecasts.map((f) => f.horizon_days),
  });
  log?.info("sla_stress_forecast_generated", {
    horizons: payload.sla_forecasts.map((f) => f.horizon_days),
  });
  log?.info("recovery_opportunity_detected", {
    count: payload.metrics.recovery_opportunities_count,
  });

  if (options.persist !== false) {
    await upsertPredictiveSnapshot(
      supabase,
      tenantCompanyId,
      PREDICTIVE_SNAPSHOT_TYPE,
      payload,
      payload.metrics.generation_ms
    );
  }

  const row = await readPredictiveSnapshot(supabase, tenantCompanyId, PREDICTIVE_SNAPSHOT_TYPE);

  return {
    ...payload,
    cached: false,
    expires_at: row?.expires_at ?? null,
  };
}

export async function getRecoveryLikelihoodForCustomer(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  customerId: string
): Promise<RecoveryLikelihood | null> {
  const bundle = await generatePredictiveSnapshot(supabase, tenantCompanyId, { force: false });
  return bundle.recovery_likelihoods.find((r) => r.customer_id === customerId) ?? null;
}
