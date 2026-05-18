/**
 * Phase 3C — carga hidratación operacional para respuesta daily-queue.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadDecisionEngineOperationalIndex } from "@/lib/data/decision-engine-data-loader";
import { resolveAssigneeDisplayNames } from "@/lib/data/decision-operational-state-repository";
import type { ClientOperationalHydrationRecord, DailyOperationsQueue } from "@/lib/decision-engine/de-types";
import {
  attachAssigneeNamesToHydration,
  buildHydrationByCustomer,
} from "@/lib/decision-engine/client-operational-hydration-builder";
import { collectCompanyIdsFromQueue } from "@/lib/decision-engine/client-operational-execution-context";

export async function loadDailyQueueHydration(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  queue: DailyOperationsQueue
): Promise<Record<string, ClientOperationalHydrationRecord>> {
  const customerIds = collectCompanyIdsFromQueue(queue.sections);
  if (customerIds.length === 0) return {};
  const index = await loadDecisionEngineOperationalIndex(supabase, tenantCompanyId);
  const raw = buildHydrationByCustomer(customerIds, index);
  const userIds = [
    ...new Set(
      Object.values(raw)
        .map((r) => r.assigned_user_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const names = await resolveAssigneeDisplayNames(supabase, tenantCompanyId, userIds);
  return attachAssigneeNamesToHydration(raw, names);
}
