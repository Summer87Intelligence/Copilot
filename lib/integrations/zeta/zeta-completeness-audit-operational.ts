import type { CompletenessAuditResult } from "@/lib/integrations/zeta/zeta-enterprise-sync-types";

/**
 * Returns true only when an audit result represents a genuine operational critical
 * condition that warrants creating a resync job.
 *
 * For invoices: re-derives the operational severity excluding historical_legacy_untraceable
 * records (ZETA:CCV1: without zeta_registro_id), which are informational only and do not
 * represent sync loss. Mirrors the computeSeverity(zetaCount, operationalLocalCount) logic
 * in zeta-completeness-audit.ts.
 *
 * For receipts and contacts: delegates directly to the raw severity field — those entities
 * have no legacy record classification.
 */
export function isOperationalCriticalAudit(audit: CompletenessAuditResult): boolean {
  if (audit.severity !== "critical") return false;
  if (audit.entity !== "invoices") return true;

  const legacyCount = audit.metadata?.legacy_untraceable_count ?? 0;
  if (legacyCount === 0) return true;

  // Mirror the audit formula: subtract legacy from BOTH sides.
  // Legacy records exist in both systems but can't be ID-matched — they are accounted for.
  const adjustedZeta = Math.max(0, audit.zeta_count - legacyCount);
  const adjustedLocal = Math.max(0, audit.local_count - legacyCount);

  // Mirrors computeSeverity(adjustedZeta, adjustedLocal)
  if (adjustedZeta === 0) return false; // computeSeverity returns "ok" when zetaCount===0
  const pct = (Math.abs(adjustedZeta - adjustedLocal) / adjustedZeta) * 100;
  return pct > 5;
}
