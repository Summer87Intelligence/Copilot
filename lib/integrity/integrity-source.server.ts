import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { mapLinkRowsToReconciliationLinks } from "@/lib/integrity/integrity-link-map";
import { buildIntegrityReport } from "@/lib/integrity/integrity-report";
import type { BankMovInput, IntegrityInputs } from "@/lib/integrity/integrity-rules";
import type {
  IntegrityFinding,
  IntegrityObservability,
  IntegrityReport,
  IntegritySeverity,
} from "@/lib/integrity/integrity-types";

const RECON_TABLE = "bank_movement_reconciliation_links";

function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / (1000 * 60 * 60);
}

function normalizeSeverity(raw: unknown): IntegritySeverity {
  const s = String(raw ?? "").toLowerCase();
  if (s === "critical" || s === "error") return "critical";
  if (s === "warning" || s === "warn") return "warning";
  return "info";
}

const SEV_RANK: Record<IntegritySeverity, number> = { critical: 0, warning: 1, info: 2 };

/** Traduce las violaciones abiertas del checker Zeta (ya computadas) a hallazgos, agrupando por check. */
async function loadZetaViolationFindings(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<IntegrityFinding[]> {
  try {
    const { data, error } = await supabase
      .from("zeta_integrity_violations")
      .select("check_name, entity, record_id, record_key, description, severity")
      .eq("workspace_company_id", workspaceId)
      .eq("status", "open")
      .limit(2000);
    if (error || !data) return [];

    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of data as Record<string, unknown>[]) {
      const key = String(row.check_name ?? "zeta_violation");
      const arr = groups.get(key) ?? [];
      arr.push(row);
      groups.set(key, arr);
    }

    const findings: IntegrityFinding[] = [];
    for (const [check, rows] of groups.entries()) {
      const severity = rows
        .map((r) => normalizeSeverity(r.severity))
        .sort((a, b) => SEV_RANK[a] - SEV_RANK[b])[0] ?? "info";
      findings.push({
        ruleId: `zeta:${check}`,
        category: "documents",
        severity,
        title: `Zeta · ${check}`,
        count: rows.length,
        impact: "Violación de integridad detectada por el checker Zeta.",
        where: "zeta_integrity_violations (status=open)",
        modules: ["ventas", "finanzas", "sistema"],
        resolution: "Revisar y resolver la violación en el checker de integridad Zeta.",
        autoRepairable: false,
        evidence: rows.slice(0, 5).map((r) => ({
          entityId: String(r.record_id ?? r.record_key ?? ""),
          label: String(r.entity ?? check),
          detail: String(r.description ?? "").slice(0, 160),
        })),
      });
    }
    return findings;
  } catch {
    return [];
  }
}

async function loadBankInput(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<IntegrityInputs["bank"] | undefined> {
  try {
    const { data: movRows, error: movErr } = await supabase
      .from("bank_movements")
      .select("id, description, amount, currency, metadata")
      .eq("workspace_id", workspaceId)
      .limit(3000);
    if (movErr || !movRows) return undefined;

    const movements: BankMovInput[] = (movRows as Record<string, unknown>[]).map((m) => {
      const meta = (m.metadata as Record<string, unknown> | null) ?? {};
      const fp = m.fingerprint != null ? String(m.fingerprint) : meta.fingerprint != null ? String(meta.fingerprint) : null;
      return {
        id: String(m.id),
        label: String(m.description ?? "").slice(0, 60) || String(m.id).slice(0, 8),
        amount: typeof m.amount === "number" ? m.amount : parseFloat(String(m.amount)) || 0,
        currency: String(m.currency ?? ""),
        fingerprint: fp,
      };
    });

    let links: ReturnType<typeof mapLinkRowsToReconciliationLinks> = [];
    const { data: linkRows, error: linkErr } = await supabase
      .from(RECON_TABLE)
      .select("id, bank_movement_id, target_type, target_id, applied_amount, currency, direction, method, confidence, archived_at")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .limit(5000);
    if (!linkErr && linkRows) {
      links = mapLinkRowsToReconciliationLinks(linkRows as Record<string, unknown>[]);
    }

    return { movements, links };
  } catch {
    return undefined;
  }
}

async function loadSystemInput(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<{ system: IntegrityInputs["system"]; observability: IntegrityObservability }> {
  const obs: IntegrityObservability = {
    lastCronAt: null,
    lastSyncAt: null,
    lastSnapshotAt: null,
    lastBankImportAt: null,
    lastReconciliationAt: null,
    lastMigrationAt: null,
    pendingJobs: 0,
    hoursSinceCron: null,
    hoursSinceSync: null,
  };

  try {
    const { data: sync } = await supabase
      .from("zeta_sync_runs")
      .select("started_at, status")
      .eq("company_id", workspaceId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastSyncStatus = sync?.status ? String(sync.status) : null;
    obs.lastSyncAt = sync?.started_at ? String(sync.started_at) : null;

    const { data: pipeline } = await supabase
      .from("zeta_pipeline_runs")
      .select("started_at")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    obs.lastCronAt = pipeline?.started_at ? String(pipeline.started_at) : null;

    const { count: pending } = await supabase
      .from("zeta_resync_jobs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_company_id", workspaceId)
      .in("status", ["pending", "running"]);
    obs.pendingJobs = pending ?? 0;

    obs.hoursSinceCron = hoursSince(obs.lastCronAt);
    obs.hoursSinceSync = hoursSince(obs.lastSyncAt);

    const system: IntegrityInputs["system"] = {
      hoursSinceCron: obs.hoursSinceCron,
      hoursSinceSync: obs.hoursSinceSync,
      hoursSinceSnapshot: null,
      lastSyncFailed: lastSyncStatus === "failed",
      // rlsAudit y pendingMigrations no se introspectan en runtime (regla marcada skipped);
      // se auditan read-only en FASE F y quedan documentados.
    };
    return { system, observability: obs };
  } catch {
    return { system: undefined, observability: obs };
  }
}

/** Carga canónica + ejecución del motor de integridad para un workspace. */
export async function loadIntegrityReport(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<IntegrityReport> {
  const [external, bank, sys] = await Promise.all([
    loadZetaViolationFindings(supabase, workspaceId),
    loadBankInput(supabase, workspaceId),
    loadSystemInput(supabase, workspaceId),
  ]);

  const inputs: IntegrityInputs = {
    ...(bank ? { bank } : {}),
    ...(sys.system ? { system: sys.system } : {}),
  };

  return buildIntegrityReport(inputs, sys.observability, new Date(), external);
}
