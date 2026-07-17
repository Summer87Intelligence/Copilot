/**
 * FASE F — Agregador puro: corre el registro de reglas y arma el reporte
 * ejecutivo (estado global, conteos, por categoría, por módulo, cobertura).
 */

import { INTEGRITY_RULES, type IntegrityInputs } from "@/lib/integrity/integrity-rules";
import {
  emptyByCategory,
  type IntegrityFinding,
  type IntegrityModule,
  type IntegrityObservability,
  type IntegrityReport,
  type IntegrityRulePass,
  type IntegrityStatus,
} from "@/lib/integrity/integrity-types";

function statusFromCounts(critical: number, warning: number, info: number): IntegrityStatus {
  if (critical > 0) return "critical";
  if (warning > 0) return "warning";
  if (info > 0) return "info";
  return "healthy";
}

export function emptyObservability(): IntegrityObservability {
  return {
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
}

export function buildIntegrityReport(
  inputs: IntegrityInputs,
  observability: IntegrityObservability = emptyObservability(),
  now: Date = new Date(),
  /** Hallazgos ya computados por otros motores (p.ej. zeta_integrity_violations). */
  externalFindings: IntegrityFinding[] = []
): IntegrityReport {
  const findings: IntegrityFinding[] = [...externalFindings];
  const passes: IntegrityRulePass[] = [];
  const skippedRules: string[] = [];
  let evaluated = 0;

  for (const rule of INTEGRITY_RULES) {
    if (!rule.applicable(inputs)) {
      skippedRules.push(rule.ruleId);
      continue;
    }
    evaluated += 1;
    const finding = rule.run(inputs);
    if (finding) {
      findings.push(finding);
    } else {
      passes.push({ ruleId: rule.ruleId, category: rule.category, title: rule.title });
    }
  }

  // Orden: críticos primero, luego por count desc.
  const sevRank = { critical: 0, warning: 1, info: 2 } as const;
  findings.sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || b.count - a.count);

  const counts = { critical: 0, warning: 0, info: 0, total: findings.length };
  const byCategory = emptyByCategory();
  const byModule: Partial<Record<IntegrityModule, number>> = {};

  for (const f of findings) {
    counts[f.severity] += 1;
    byCategory[f.category] += 1;
    for (const m of f.modules) byModule[m] = (byModule[m] ?? 0) + 1;
  }

  return {
    status: statusFromCounts(counts.critical, counts.warning, counts.info),
    computedAt: now.toISOString(),
    findings,
    passes,
    counts,
    byCategory,
    byModule,
    coverage: {
      evaluated,
      skipped: skippedRules.length,
      skippedRules,
    },
    observability,
  };
}
