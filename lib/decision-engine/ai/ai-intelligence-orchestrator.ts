/**
 * Phase 5A — orquestación de inteligencia operacional (cache + generación).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { selectAutomationActions, selectAutomationRuns } from "@/lib/data/decision-automation-repository";
import {
  isAIBriefingPayloadCurrent,
  isAIBriefingSnapshotFresh,
  readAIBriefingSnapshot,
  upsertAIBriefingSnapshot,
} from "@/lib/data/decision-ai-briefing-repository";
import { readDailyQueueSnapshot } from "@/lib/data/decision-daily-queue-repository";
import { selectOperationalOwnershipStats } from "@/lib/data/decision-operational-state-repository";
import { getOperationalAnalytics } from "@/lib/decision-engine/operational-analytics-orchestrator";
import { buildClientOperationalSummaries } from "@/lib/decision-engine/client-operational-summary-builder";
import { QUEUE_SECTION_ORDER } from "@/lib/decision-engine/daily-operations-queue-panel.helpers";
import type { DailyOperationsQueue } from "@/lib/decision-engine/de-types";
import { buildOperationalBriefing } from "@/lib/decision-engine/ai/ai-operational-briefing";
import { detectOperationalAnomalies } from "@/lib/decision-engine/ai/ai-anomaly-detector";
import { buildOperatorInsights } from "@/lib/decision-engine/ai/ai-operator-insights";
import {
  buildRiskNarrative,
  riskNarrativeInputFromSummary,
} from "@/lib/decision-engine/ai/ai-risk-narrative-engine";
import { explainPriority } from "@/lib/decision-engine/ai/ai-priority-explainer";
import type {
  AIIntelligenceBundle,
  AIIntelligenceContext,
  AIOperationalIntelligencePayload,
  AIRiskSummaryResponse,
} from "@/lib/decision-engine/ai/ai-types";
import type { ClientOperationalHydrationRecord } from "@/lib/decision-engine/de-types";
import type { CopilotRequestLogger } from "@/lib/copilot-structured-logger";

export const AI_BRIEFING_TYPE = "operational_intelligence_v1";

async function loadIntelligenceContext(
  supabase: SupabaseClient,
  tenantCompanyId: string
): Promise<AIIntelligenceContext> {
  const [analyticsResult, queueRow, ownership, automation_runs, automation_actions] =
    await Promise.all([
      getOperationalAnalytics(supabase, tenantCompanyId, { force: false }),
      readDailyQueueSnapshot(supabase, tenantCompanyId),
      selectOperationalOwnershipStats(supabase, tenantCompanyId),
      selectAutomationRuns(supabase, tenantCompanyId, 5),
      selectAutomationActions(supabase, tenantCompanyId, { limit: 30 }),
    ]);

  const queue: DailyOperationsQueue | null = queueRow?.payload ?? null;
  const allTasks = queue
    ? QUEUE_SECTION_ORDER.flatMap((sec) => queue.sections[sec] ?? [])
    : [];

  return {
    analytics: analyticsResult.analytics,
    queue,
    ownership,
    automation_runs,
    automation_actions,
    client_summaries: buildClientOperationalSummaries(allTasks),
    loaded_at: new Date().toISOString(),
  };
}

export function buildOperationalIntelligencePayload(
  ctx: AIIntelligenceContext,
  generationMs: number
): AIOperationalIntelligencePayload {
  const briefing = buildOperationalBriefing(ctx);
  const anomalies = detectOperationalAnomalies(ctx);
  const operator_insights = buildOperatorInsights(ctx.analytics);

  const criticalInsights =
    operator_insights.filter((i) => i.severity === "critical" || i.severity === "high").length +
    anomalies.filter((a) => a.severity === "critical" || a.severity === "high").length;

  return {
    generated_at: new Date().toISOString(),
    briefing,
    anomalies,
    operator_insights,
    metrics: {
      anomalies_detected: anomalies.length,
      critical_insights: criticalInsights,
      workload_alerts: briefing.workload_warnings.length,
      generation_ms: generationMs,
    },
    source_snapshot_ids: {
      analytics_generated_at: ctx.analytics?.generated_at ?? null,
      queue_generated_at: ctx.queue?.generated_at ?? null,
    },
  };
}

export async function generateOperationalIntelligence(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  options: { force?: boolean; persist?: boolean } = {},
  log?: CopilotRequestLogger
): Promise<AIIntelligenceBundle> {
  if (!options.force) {
    const cached = await readAIBriefingSnapshot(supabase, tenantCompanyId, AI_BRIEFING_TYPE);
    if (cached && isAIBriefingSnapshotFresh(cached) && isAIBriefingPayloadCurrent(cached.payload)) {
      log?.info("ai_briefing_cache_hit", { tenant_id: tenantCompanyId });
      return {
        ...cached.payload,
        cached: true,
        expires_at: cached.expires_at,
      };
    }
  }

  const t0 = Date.now();
  log?.info("ai_briefing_generated", { tenant_id: tenantCompanyId, phase: "start" });

  const ctx = await loadIntelligenceContext(supabase, tenantCompanyId);
  const payload = buildOperationalIntelligencePayload(ctx, Date.now() - t0);

  log?.info("ai_anomaly_detected", {
    count: payload.metrics.anomalies_detected,
    critical: payload.anomalies.filter((a) => a.severity === "critical").length,
  });
  log?.info("ai_operator_warning", {
    count: payload.operator_insights.length,
    workload_alerts: payload.metrics.workload_alerts,
  });

  if (options.persist !== false) {
    await upsertAIBriefingSnapshot(supabase, tenantCompanyId, AI_BRIEFING_TYPE, payload, payload.metrics.generation_ms);
  }

  const row = await readAIBriefingSnapshot(supabase, tenantCompanyId, AI_BRIEFING_TYPE);

  log?.info("ai_briefing_generated", {
    tenant_id: tenantCompanyId,
    generation_ms: payload.metrics.generation_ms,
    anomalies_detected: payload.metrics.anomalies_detected,
  });

  return {
    ...payload,
    cached: false,
    expires_at: row?.expires_at ?? null,
  };
}

export async function buildRiskSummaryForCustomer(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  customerId: string,
  hydration?: ClientOperationalHydrationRecord | null
): Promise<AIRiskSummaryResponse | null> {
  const ctx = await loadIntelligenceContext(supabase, tenantCompanyId);
  const summary = ctx.client_summaries.find((s) => s.customer_id === customerId);
  if (!summary) return null;

  const narrative = buildRiskNarrative(riskNarrativeInputFromSummary(summary, hydration ?? null));
  const priority = explainPriority({ summary, hydration });

  return {
    customer_id: customerId,
    customer_name: summary.customer_name,
    narrative,
    priority,
    task: summary.primary_action,
  };
}
