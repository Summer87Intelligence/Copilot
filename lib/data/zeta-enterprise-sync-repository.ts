/**
 * ZETA-13: Repositorio de datos para el sistema enterprise de sincronización.
 * Operaciones sobre: zeta_completeness_audits, zeta_sync_divergences,
 * zeta_integrity_violations, zeta_resync_jobs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CompletenessAuditResult,
  CompletenessAuditRow,
  CreateResyncJobInput,
  IntegrityViolation,
  IntegrityViolationRow,
  ResyncJobRow,
  SyncDivergence,
  ZetaAuditableEntity,
} from "@/lib/integrations/zeta/zeta-enterprise-sync-types";

// ── Completeness Audits ───────────────────────────────────────────────────────

export async function insertCompletenessAudit(
  supabase: SupabaseClient,
  workspaceId: string,
  result: CompletenessAuditResult
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("zeta_completeness_audits")
    .insert({
      workspace_company_id: workspaceId,
      entity: result.entity,
      audit_scope: result.audit_scope,
      period_year: result.period_year ?? null,
      period_month: result.period_month ?? null,
      zeta_count: result.zeta_count,
      local_count: result.local_count,
      missing_registro_ids: result.missing_registro_ids,
      orphan_registro_ids: result.orphan_registro_ids,
      notes: result.notes ?? result.zeta_error ?? null,
      severity: result.severity,
      auto_resync_triggered: false,
      metadata: result.metadata ?? null,
    })
    .select("id")
    .single();

  if (error) {
    // Dedup conflict (unique index on hour bucket) → ignorar silenciosamente
    if (error.code === "23505") return null;
    console.error(
      JSON.stringify({ source: "zeta-enterprise-repo", kind: "insert_completeness_audit_error", error: error.message })
    );
    return null;
  }
  return data as { id: string };
}

export async function markCompletenessAuditResyncTriggered(
  supabase: SupabaseClient,
  auditId: string
): Promise<void> {
  await supabase
    .from("zeta_completeness_audits")
    .update({ auto_resync_triggered: true })
    .eq("id", auditId);
}

export async function getLatestCompletenessAudits(
  supabase: SupabaseClient,
  workspaceId: string,
  limitPerEntity = 3
): Promise<CompletenessAuditRow[]> {
  const entities: ZetaAuditableEntity[] = ["invoices", "receipts", "installments", "contacts"];
  const rows: CompletenessAuditRow[] = [];

  for (const entity of entities) {
    const { data } = await supabase
      .from("zeta_completeness_audits")
      .select("*")
      .eq("workspace_company_id", workspaceId)
      .eq("entity", entity)
      .order("audited_at", { ascending: false })
      .limit(limitPerEntity);

    if (data) rows.push(...(data as CompletenessAuditRow[]));
  }

  return rows;
}

// ── Sync Divergences ──────────────────────────────────────────────────────────

export async function upsertSyncDivergence(
  supabase: SupabaseClient,
  workspaceId: string,
  divergence: SyncDivergence
): Promise<void> {
  const { error } = await supabase.from("zeta_sync_divergences").upsert(
    {
      workspace_company_id: workspaceId,
      entity: divergence.entity,
      zeta_registro_id: divergence.zeta_registro_id,
      local_record_id: divergence.local_record_id ?? null,
      field_name: divergence.field_name,
      zeta_value: divergence.zeta_value,
      local_value: divergence.local_value,
      severity: divergence.severity,
      status: "open",
      detected_at: new Date().toISOString(),
    },
    {
      onConflict: "workspace_company_id,entity,zeta_registro_id,field_name",
      ignoreDuplicates: false,
    }
  );

  if (error && error.code !== "23505") {
    console.error(
      JSON.stringify({ source: "zeta-enterprise-repo", kind: "upsert_divergence_error", error: error.message })
    );
  }
}

export async function resolveSyncDivergences(
  supabase: SupabaseClient,
  workspaceId: string,
  entity: ZetaAuditableEntity,
  registroIds: string[],
  note = "auto_resolved_on_resync"
): Promise<number> {
  if (registroIds.length === 0) return 0;
  const { data } = await supabase
    .from("zeta_sync_divergences")
    .update({ status: "auto_fixed", resolved_at: new Date().toISOString(), resolution_note: note })
    .eq("workspace_company_id", workspaceId)
    .eq("entity", entity)
    .eq("status", "open")
    .in("zeta_registro_id", registroIds)
    .select("id");
  return (data ?? []).length;
}

// ── Integrity Violations ──────────────────────────────────────────────────────

export async function upsertIntegrityViolation(
  supabase: SupabaseClient,
  workspaceId: string,
  violation: IntegrityViolation
): Promise<{ id: string; isNew: boolean } | null> {
  const naturalKey =
    violation.record_id ?? violation.record_key ?? "NULL";

  // Check if open violation already exists
  const { data: existing } = await supabase
    .from("zeta_integrity_violations")
    .select("id")
    .eq("workspace_company_id", workspaceId)
    .eq("check_name", violation.check_name)
    .eq("entity", violation.entity)
    .eq("status", "open")
    .or(
      violation.record_id
        ? `record_id.eq.${violation.record_id}`
        : `record_key.eq.${naturalKey}`
    )
    .maybeSingle();

  if (existing) return { id: existing.id as string, isNew: false };

  const { data, error } = await supabase
    .from("zeta_integrity_violations")
    .insert({
      workspace_company_id: workspaceId,
      check_name: violation.check_name,
      entity: violation.entity,
      record_id: violation.record_id ?? null,
      record_key: violation.record_key ?? null,
      description: violation.description,
      severity: violation.severity,
      status: "open",
      metadata: violation.metadata ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code !== "23505") {
      console.error(
        JSON.stringify({ source: "zeta-enterprise-repo", kind: "insert_violation_error", error: error.message })
      );
    }
    return null;
  }
  return { id: data!.id as string, isNew: true };
}

export async function resolveIntegrityViolation(
  supabase: SupabaseClient,
  violationId: string
): Promise<void> {
  await supabase
    .from("zeta_integrity_violations")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", violationId);
}

/**
 * Auto-resolves open violations for a check that no longer appear in the current run.
 * Called after each check completes — open violations whose key is NOT in `foundKeys`
 * are transitioned to resolved with resolution_note = "auto_resolved_after_recheck".
 * Returns the number of violations resolved.
 */
export async function resolveStaleIntegrityViolations(
  supabase: SupabaseClient,
  workspaceId: string,
  checkName: string,
  foundKeys: Set<string>
): Promise<number> {
  const { data, error } = await supabase
    .from("zeta_integrity_violations")
    .select("id, record_id, record_key")
    .eq("workspace_company_id", workspaceId)
    .eq("check_name", checkName)
    .eq("status", "open");

  if (error || !data?.length) return 0;

  const toResolve = (data as { id: string; record_id: string | null; record_key: string | null }[])
    .filter((row) => {
      const key = row.record_id ?? row.record_key ?? "NULL";
      return !foundKeys.has(key);
    })
    .map((row) => row.id);

  if (toResolve.length === 0) return 0;

  const { data: resolved } = await supabase
    .from("zeta_integrity_violations")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolution_note: "auto_resolved_after_recheck",
    })
    .in("id", toResolve)
    .eq("status", "open")
    .select("id");

  const count = (resolved ?? []).length;
  if (count > 0) {
    console.info(
      JSON.stringify({ source: "zeta-enterprise-repo", kind: "auto_resolved_violations", check_name: checkName, count })
    );
  }
  return count;
}

export async function getOpenIntegrityViolations(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<IntegrityViolationRow[]> {
  const { data } = await supabase
    .from("zeta_integrity_violations")
    .select("*")
    .eq("workspace_company_id", workspaceId)
    .eq("status", "open")
    .order("severity", { ascending: true }) // critical primero si se usa desc, pero queremos critical last alphabetically; mejor por detected_at
    .order("detected_at", { ascending: false })
    .limit(200);
  return (data ?? []) as IntegrityViolationRow[];
}

// ── Re-sync Jobs ──────────────────────────────────────────────────────────────

export async function createResyncJob(
  supabase: SupabaseClient,
  input: CreateResyncJobInput
): Promise<ResyncJobRow | null> {
  // Duplicate prevention: skip if a pending or running job already exists for this (workspace, entity, scope).
  const { data: existing } = await supabase
    .from("zeta_resync_jobs")
    .select("id")
    .eq("workspace_company_id", input.workspace_company_id)
    .eq("entity", input.entity)
    .eq("scope", input.scope)
    .in("status", ["pending", "running"])
    .maybeSingle();

  if (existing) {
    console.info(
      JSON.stringify({
        source: "zeta-enterprise-repo",
        kind: "resync_job_duplicate_skipped",
        existing_id: existing.id,
        entity: input.entity,
        scope: input.scope,
      })
    );
    return null;
  }

  const { data, error } = await supabase
    .from("zeta_resync_jobs")
    .insert({
      workspace_company_id: input.workspace_company_id,
      entity: input.entity,
      scope: input.scope,
      triggered_by: input.triggered_by,
      dry_run: input.dry_run ?? false,
      status: "pending",
      metadata: input.metadata ?? null,
    })
    .select("*")
    .single();

  if (error) {
    console.error(
      JSON.stringify({ source: "zeta-enterprise-repo", kind: "create_resync_job_error", error: error.message })
    );
    return null;
  }
  return data as ResyncJobRow;
}

export async function updateResyncJob(
  supabase: SupabaseClient,
  jobId: string,
  patch: {
    status: "running" | "completed" | "failed" | "skipped" | "dead_letter";
    rows_fetched?: number;
    rows_synced?: number;
    rows_skipped?: number;
    error_summary?: string;
    started_at?: string;
    completed_at?: string;
  }
): Promise<void> {
  const { error } = await supabase
    .from("zeta_resync_jobs")
    .update(patch)
    .eq("id", jobId);

  if (error) {
    console.error(
      JSON.stringify({ source: "zeta-enterprise-repo", kind: "update_resync_job_error", error: error.message })
    );
  }
}

export async function getRecentResyncJobs(
  supabase: SupabaseClient,
  workspaceId: string,
  limit = 10
): Promise<ResyncJobRow[]> {
  const { data } = await supabase
    .from("zeta_resync_jobs")
    .select("*")
    .eq("workspace_company_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as ResyncJobRow[];
}
