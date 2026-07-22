/**
 * Visibilidad operativa de movimientos (FASE BANK-UNIFIED-RECONCILIATION-CORRECTION-AND-MOVEMENT-VISIBILITY-001).
 *
 * Vive en `bank_movements.metadata` (sin DDL): ocultar ≠ ignorar (status) ni
 * revertir una conciliación. Efecto global por workspace.
 */

export const BANK_MOVEMENT_UI_HIDDEN_KEY = "ui_hidden" as const;

export type BankMovementVisibilityFilter = "visible" | "hidden" | "all";

export function isBankMovementUiHidden(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.[BANK_MOVEMENT_UI_HIDDEN_KEY] === true;
}

export function buildHideMetadata(
  existing: Record<string, unknown> | null | undefined,
  input: { actorId: string; reason?: string | null; at?: string }
): Record<string, unknown> {
  const now = input.at ?? new Date().toISOString();
  return {
    ...(existing ?? {}),
    ui_hidden: true,
    hidden_at: now,
    hidden_by: input.actorId,
    hidden_reason: input.reason?.trim() || null,
    restored_at: null,
    restored_by: null,
  };
}

export function buildRestoreMetadata(
  existing: Record<string, unknown> | null | undefined,
  input: { actorId: string; at?: string }
): Record<string, unknown> {
  const now = input.at ?? new Date().toISOString();
  return {
    ...(existing ?? {}),
    ui_hidden: false,
    restored_at: now,
    restored_by: input.actorId,
  };
}
