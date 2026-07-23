/**
 * FASE BANK-2026-CLEANUP — clasificación pura de grupos de duplicados (A/B/C/D).
 * No escribe DB. Consumido por dry-run / apply scripts y tests.
 */

export type DedupeSafetyClass = "A_exact_safe" | "B_cross_parser_safe" | "C_ambiguous" | "D_legitimate_repeat";

export type DedupeCandidateGroup = {
  fingerprint: string;
  canonicalMovementId: string;
  duplicateMovementIds: string[];
  /** Mismo parser/fuente en todos los miembros. */
  sameSource: boolean;
  /** Algún miembro tiene link financiero / identificación / suggestion distinta del canónico. */
  hasConflictingAssociations: boolean;
  /** Importes/fechas/refs idénticos (exact match). */
  exactFieldMatch: boolean;
  /** Misma operación vista por parsers distintos (PDF vs Excel). */
  crossParser: boolean;
};

export function classifyDedupeGroup(group: DedupeCandidateGroup): DedupeSafetyClass {
  if (group.duplicateMovementIds.length === 0) return "D_legitimate_repeat";
  if (group.hasConflictingAssociations) return "C_ambiguous";
  if (group.crossParser && group.exactFieldMatch) return "B_cross_parser_safe";
  if (group.sameSource && group.exactFieldMatch) return "A_exact_safe";
  if (group.exactFieldMatch) return "A_exact_safe";
  return "C_ambiguous";
}

export function isAutoSafeDedupeClass(klass: DedupeSafetyClass): boolean {
  return klass === "A_exact_safe" || klass === "B_cross_parser_safe";
}

export type PlannedDuplicateMark = {
  movementId: string;
  canonicalMovementId: string;
  safetyClass: DedupeSafetyClass;
  excluded_from_operations: true;
  duplicate_of: string;
  exclusion_reason: "duplicate_of_import";
};

export function planSafeDuplicateMarks(
  groups: DedupeCandidateGroup[]
): { apply: PlannedDuplicateMark[]; skipped: Array<{ fingerprint: string; safetyClass: DedupeSafetyClass }> } {
  const apply: PlannedDuplicateMark[] = [];
  const skipped: Array<{ fingerprint: string; safetyClass: DedupeSafetyClass }> = [];
  for (const group of groups) {
    const safetyClass = classifyDedupeGroup(group);
    if (!isAutoSafeDedupeClass(safetyClass)) {
      skipped.push({ fingerprint: group.fingerprint, safetyClass });
      continue;
    }
    for (const movementId of group.duplicateMovementIds) {
      apply.push({
        movementId,
        canonicalMovementId: group.canonicalMovementId,
        safetyClass,
        excluded_from_operations: true,
        duplicate_of: group.canonicalMovementId,
        exclusion_reason: "duplicate_of_import",
      });
    }
  }
  return { apply, skipped };
}
