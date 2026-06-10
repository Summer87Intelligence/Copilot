/**
 * GET /api/copilot/enterprise-sync-health
 *
 * Observabilidad enterprise del sistema de sincronización Zeta.
 * Devuelve para el workspace autenticado:
 * - Últimas auditorías de completeness por entidad (invoices, receipts)
 * - Violaciones de integridad abiertas por severidad
 * - Jobs de re-sync recientes
 * - Resumen de health por entidad
 *
 * Tenant-authenticated, read-only.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireCopilotModuleAccess } from "@/lib/auth/copilot-module-api-auth";
import {
  getLatestCompletenessAudits,
  getOpenIntegrityViolations,
  getRecentResyncJobs,
} from "@/lib/data/zeta-enterprise-sync-repository";
import type {
  CompletenessAuditRow,
  EntityHealthSummary,
  EnterpriseSyncHealth,
  ZetaAuditableEntity,
} from "@/lib/integrations/zeta/zeta-enterprise-sync-types";

const ENTITIES: ZetaAuditableEntity[] = ["invoices", "receipts", "installments", "contacts"];

function deriveEntityHealth(
  entity: ZetaAuditableEntity,
  audits: CompletenessAuditRow[],
  openViolationsByEntity: Record<string, { total: number; critical: number }>
): EntityHealthSummary {
  const entityAudits = audits
    .filter((a) => a.entity === entity)
    .sort((a, b) => new Date(b.audited_at).getTime() - new Date(a.audited_at).getTime());

  const latest = entityAudits[0];
  const violations = openViolationsByEntity[entity] ?? { total: 0, critical: 0 };

  return {
    entity,
    last_audit_at: latest?.audited_at ?? null,
    last_severity: latest?.severity ?? null,
    last_drift: latest?.local_count != null && latest?.zeta_count != null
      ? latest.local_count - latest.zeta_count
      : null,
    last_drift_pct: latest
      ? Math.round(
          (latest.zeta_count > 0
            ? (Math.abs(latest.local_count - latest.zeta_count) / latest.zeta_count) * 100
            : 0) * 100
        ) / 100
      : null,
    open_violations: violations.total,
    critical_violations: violations.critical,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireCopilotModuleAccess(request, "hoy", {});
  if (!auth.ok) return auth.response;

  const workspaceId = auth.ctx.tenantCompanyId?.trim();
  if (!workspaceId) {
    return NextResponse.json({ ok: false, code: "TENANT_MISSING" }, { status: 403 });
  }

  const supabase = auth.ctx.supabase;

  try {
    // Fetch datos en paralelo
    const [audits, violations, recentJobs] = await Promise.all([
      getLatestCompletenessAudits(supabase, workspaceId, 3),
      getOpenIntegrityViolations(supabase, workspaceId),
      getRecentResyncJobs(supabase, workspaceId, 10),
    ]);

    // Agrupar violaciones por entidad
    const violationsByEntity: Record<string, { total: number; critical: number }> = {};
    for (const v of violations) {
      const key = v.entity;
      if (!violationsByEntity[key]) violationsByEntity[key] = { total: 0, critical: 0 };
      violationsByEntity[key]!.total++;
      if (v.severity === "critical") violationsByEntity[key]!.critical++;
    }

    // Totales
    const totalOpen = violations.length;
    const totalCritical = violations.filter((v) => v.severity === "critical").length;

    // Health por entidad
    const entities: EntityHealthSummary[] = ENTITIES.map((entity) =>
      deriveEntityHealth(entity, audits, violationsByEntity)
    );

    const health: EnterpriseSyncHealth = {
      generated_at: new Date().toISOString(),
      workspace_company_id: workspaceId,
      entities,
      total_open_violations: totalOpen,
      total_critical_violations: totalCritical,
      recent_resync_jobs: recentJobs,
    };

    return NextResponse.json({ ok: true, health });
  } catch (err) {
    return NextResponse.json(
      { ok: false, code: "INTERNAL_ERROR", message: String(err) },
      { status: 500 }
    );
  }
}
