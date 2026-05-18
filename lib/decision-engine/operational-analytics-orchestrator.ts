/**
 * Phase 4B — orquestación analytics (cache + recálculo).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadOperatorAnalyticsInput } from "@/lib/data/decision-operator-analytics-loader";
import {
  isOperationalAnalyticsPayloadCurrent,
  isOperationalAnalyticsSnapshotFresh,
  readOperationalAnalyticsSnapshot,
  upsertOperationalAnalyticsSnapshot,
} from "@/lib/data/decision-operational-analytics-repository";
import type { OperationalAnalyticsSnapshot } from "@/lib/decision-engine/de-types";
import { buildOperationalAnalyticsSnapshot } from "@/lib/decision-engine/operator-analytics-engine";

export type RecalculateOperationalAnalyticsResult = {
  analytics: OperationalAnalyticsSnapshot;
  cached: boolean;
  generation_ms: number;
};

export async function recalculateOperationalAnalytics(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  options: { persist?: boolean } = {}
): Promise<RecalculateOperationalAnalyticsResult> {
  const t0 = Date.now();
  const input = await loadOperatorAnalyticsInput(supabase, tenantCompanyId);
  const analytics = buildOperationalAnalyticsSnapshot(input);
  const generation_ms = Date.now() - t0;

  if (options.persist !== false) {
    await upsertOperationalAnalyticsSnapshot(
      supabase,
      tenantCompanyId,
      analytics,
      generation_ms
    );
  }

  return { analytics, cached: false, generation_ms };
}

export async function getOperationalAnalytics(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  options: { force?: boolean; persist?: boolean } = {}
): Promise<RecalculateOperationalAnalyticsResult> {
  if (!options.force) {
    const cached = await readOperationalAnalyticsSnapshot(supabase, tenantCompanyId);
    if (
      cached &&
      isOperationalAnalyticsSnapshotFresh(cached) &&
      isOperationalAnalyticsPayloadCurrent(cached.payload)
    ) {
      return {
        analytics: cached.payload,
        cached: true,
        generation_ms: cached.generation_ms ?? 0,
      };
    }
  }

  return recalculateOperationalAnalytics(supabase, tenantCompanyId, {
    persist: options.persist,
  });
}
