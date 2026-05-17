/**
 * ZETA-16: Repository for zeta_acknowledged_drifts.
 *
 * Acknowledgements suppress operational alerts for known/stable drifts.
 * A drift remains suppressed only if:
 *   - Not expired (acknowledgement_expires_at IS NULL OR > now())
 *   - Current drift has not grown beyond last_known_drift + DRIFT_TOLERANCE
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AcknowledgedDrift, AcknowledgedDriftRow } from "@/lib/integrations/zeta/zeta-enterprise-sync-types";

/** Drift may grow up to this many units beyond the acknowledged level without breaking suppression. */
const DRIFT_TOLERANCE = 2;

export async function acknowledgedDrift(
  supabase: SupabaseClient,
  input: AcknowledgedDrift
): Promise<AcknowledgedDriftRow | null> {
  const { data, error } = await supabase
    .from("zeta_acknowledged_drifts")
    .upsert(
      {
        workspace_company_id: input.workspace_company_id,
        entity: input.entity,
        audit_scope: input.audit_scope,
        acknowledged_by: input.acknowledged_by,
        acknowledgement_reason: input.acknowledgement_reason,
        acknowledgement_expires_at: input.acknowledgement_expires_at ?? null,
        last_known_drift: input.last_known_drift,
        last_known_zeta_count: input.last_known_zeta_count,
        last_known_local_count: input.last_known_local_count,
        acknowledged_at: new Date().toISOString(),
      },
      { onConflict: "workspace_company_id,entity,audit_scope" }
    )
    .select("*")
    .single();

  if (error) {
    console.error(
      JSON.stringify({ source: "zeta-ack-drift-repo", kind: "upsert_error", error: error.message })
    );
    return null;
  }
  return data as AcknowledgedDriftRow;
}

export async function getAcknowledgedDrift(
  supabase: SupabaseClient,
  workspaceId: string,
  entity: string,
  auditScope: string
): Promise<AcknowledgedDriftRow | null> {
  const { data } = await supabase
    .from("zeta_acknowledged_drifts")
    .select("*")
    .eq("workspace_company_id", workspaceId)
    .eq("entity", entity)
    .eq("audit_scope", auditScope)
    .maybeSingle();

  return (data as AcknowledgedDriftRow | null) ?? null;
}

/**
 * Returns true if the given drift is suppressed by an active acknowledgement.
 * Suppression holds when:
 *   1. An acknowledgement exists for (workspace, entity, scope)
 *   2. It has not expired
 *   3. The drift has not grown beyond last_known_drift + DRIFT_TOLERANCE
 */
export async function isDriftAcknowledged(
  supabase: SupabaseClient,
  workspaceId: string,
  entity: string,
  auditScope: string,
  currentDrift: number
): Promise<{ suppressed: boolean; reason?: string; ack?: AcknowledgedDriftRow }> {
  const ack = await getAcknowledgedDrift(supabase, workspaceId, entity, auditScope);
  if (!ack) return { suppressed: false };

  // Check expiry
  if (ack.acknowledgement_expires_at) {
    const expires = new Date(ack.acknowledgement_expires_at).getTime();
    if (Date.now() > expires) {
      return { suppressed: false, reason: "acknowledgement_expired" };
    }
  }

  // Check drift growth
  const absDrift = Math.abs(currentDrift);
  const absKnown = Math.abs(ack.last_known_drift);
  if (absDrift > absKnown + DRIFT_TOLERANCE) {
    return {
      suppressed: false,
      reason: `drift_grew: current=${absDrift} > acknowledged=${absKnown}+tolerance=${DRIFT_TOLERANCE}`,
    };
  }

  return {
    suppressed: true,
    reason: `acknowledged by ${ack.acknowledged_by}: ${ack.acknowledgement_reason}`,
    ack,
  };
}

export async function listAcknowledgedDrifts(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<AcknowledgedDriftRow[]> {
  const { data } = await supabase
    .from("zeta_acknowledged_drifts")
    .select("*")
    .eq("workspace_company_id", workspaceId)
    .order("acknowledged_at", { ascending: false });
  return (data ?? []) as AcknowledgedDriftRow[];
}

export async function revokeAcknowledgement(
  supabase: SupabaseClient,
  ackId: string
): Promise<void> {
  await supabase
    .from("zeta_acknowledged_drifts")
    .delete()
    .eq("id", ackId);
}
