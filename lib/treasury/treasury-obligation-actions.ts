import type { PlannedObligationStatus } from "@/lib/treasury/treasury-types";

export type PaymentActions = {
  canPay: boolean;
  canEdit: boolean;
  canReschedule: boolean;
  canCancel: boolean;
  canDelete: boolean;
};

export function getTreasuryPaymentActionsByStatus(
  effective: PlannedObligationStatus
): PaymentActions {
  const isOpen =
    effective === "planned" || effective === "confirmed" || effective === "overdue";
  return {
    canPay: isOpen,
    canEdit: effective === "planned" || effective === "confirmed",
    canReschedule: effective === "overdue",
    canCancel: isOpen,
    canDelete: true,
  };
}

export function formatPaymentStatusLabel(effective: PlannedObligationStatus): string {
  const labels: Record<PlannedObligationStatus, string> = {
    planned: "Pendiente",
    confirmed: "Confirmado",
    overdue: "Vencido",
    paid: "Pagado",
    cancelled: "Cancelado",
  };
  return labels[effective] ?? effective;
}

export type PaymentConfirmationPayload = {
  id: string;
  amountFinal: number | undefined;
  registerCashMovement: boolean;
};

export function buildPaymentConfirmationPayload(
  id: string,
  amountFinal: number | undefined,
  registerCashMovement: boolean
): PaymentConfirmationPayload {
  return { id, amountFinal, registerCashMovement };
}

// ─── Due-time helpers ────────────────────────────────────────────────────────
//
// due_date is a PostgreSQL `date` column (YYYY-MM-DD only).
// We store the optional hour in metadata.due_time as "HH:MM" (24h, local time).
// No schema migration required — metadata JSONB already exists and is accepted
// by all create/update API endpoints.

/** Extract a validated "HH:MM" time string from obligation metadata. */
export function getDueTime(
  row: { metadata?: Record<string, unknown> | null }
): string | null {
  const t = row.metadata?.due_time;
  return typeof t === "string" && /^\d{2}:\d{2}$/.test(t) ? t : null;
}

/** Format YYYY-MM-DD as DD/MM/YYYY. */
export function formatDueDate(ymd: string): string {
  const parts = ymd.split("-");
  if (parts.length !== 3) return ymd;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/**
 * Format due date with optional time for display.
 * "2026-05-22", "15:00" → "22/05/2026 · 15:00"
 * "2026-05-22", null   → "22/05/2026"
 */
export function formatDueWithTime(ymd: string, dueTime?: string | null): string {
  const date = formatDueDate(ymd);
  return dueTime ? `${date} · ${dueTime}` : date;
}

/**
 * Merge existing metadata with a due_time value.
 * Passing null removes due_time while preserving other metadata keys.
 */
export function buildMetaWithDueTime(
  existing: Record<string, unknown> | null | undefined,
  dueTime: string | null
): Record<string, unknown> | null {
  const base: Record<string, unknown> = { ...(existing ?? {}) };
  if (dueTime) {
    base.due_time = dueTime;
  } else {
    delete base.due_time;
  }
  return Object.keys(base).length > 0 ? base : null;
}

/**
 * Enhanced status label that adds intra-day time information when the
 * obligation is due today and has a stored due_time.
 *
 * @param nowHHMM  Current local time as "HH:MM" — pass from the component.
 */
export function buildDueStatusLabelWithTime(
  effective: PlannedObligationStatus,
  dueDate: string,
  asOfDate: string,
  dueTime: string | null,
  nowHHMM: string
): string {
  if (effective === "paid") return "Pagado";
  if (effective === "cancelled") return "Cancelado";
  const isToday = dueDate === asOfDate;
  if (isToday && dueTime) {
    const isPast = nowHHMM >= dueTime;
    return isPast ? `Vencido hoy · ${dueTime}` : `Vence hoy · ${dueTime}`;
  }
  return formatPaymentStatusLabel(effective);
}
