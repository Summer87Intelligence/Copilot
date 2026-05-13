import type {
  PlannedCashObligation,
  PlannedObligationStatus,
} from "@/lib/treasury/treasury-types";

const OPEN_STATUSES = new Set<PlannedObligationStatus>(["planned", "confirmed", "overdue"]);

export function parseYmdToUtcMs(ymd: string): number | null {
  const trimmed = ymd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const ms = Date.parse(`${trimmed}T12:00:00.000Z`);
  return Number.isFinite(ms) ? ms : null;
}

export function startOfUtcDayMs(ymd: string): number | null {
  return parseYmdToUtcMs(ymd);
}

export function effectivePlannedObligationStatus(
  storedStatus: PlannedObligationStatus,
  dueDate: string,
  asOfDate: string
): PlannedObligationStatus {
  if (storedStatus === "paid" || storedStatus === "cancelled") {
    return storedStatus;
  }
  const dueMs = startOfUtcDayMs(dueDate);
  const asOfMs = startOfUtcDayMs(asOfDate);
  if (dueMs == null || asOfMs == null) return storedStatus;
  if (dueMs < asOfMs && (storedStatus === "planned" || storedStatus === "confirmed")) {
    return "overdue";
  }
  return storedStatus;
}

export function isPlannedObligationOverdue(
  obligation: Pick<PlannedCashObligation, "status" | "dueDate">,
  asOfDate: string
): boolean {
  return effectivePlannedObligationStatus(obligation.status, obligation.dueDate, asOfDate) === "overdue";
}

export function isPlannedObligationPendingForCashflow(
  obligation: Pick<PlannedCashObligation, "status" | "dueDate" | "affectsCashflow">,
  asOfDate: string
): boolean {
  if (!obligation.affectsCashflow) return false;
  const effective = effectivePlannedObligationStatus(
    obligation.status,
    obligation.dueDate,
    asOfDate
  );
  return OPEN_STATUSES.has(effective);
}

export function daysUntilDue(dueDate: string, asOfDate: string): number | null {
  const dueMs = startOfUtcDayMs(dueDate);
  const asOfMs = startOfUtcDayMs(asOfDate);
  if (dueMs == null || asOfMs == null) return null;
  return Math.round((dueMs - asOfMs) / 86_400_000);
}

export function filterUpcomingObligations(
  obligations: readonly PlannedCashObligation[],
  asOfDate: string,
  withinDays: number
): PlannedCashObligation[] {
  return obligations.filter((o) => {
    if (!isPlannedObligationPendingForCashflow(o, asOfDate)) return false;
    const days = daysUntilDue(o.dueDate, asOfDate);
    return days != null && days >= 0 && days <= withinDays;
  });
}

export function filterOverdueObligations(
  obligations: readonly PlannedCashObligation[],
  asOfDate: string
): PlannedCashObligation[] {
  return obligations.filter((o) => isPlannedObligationOverdue(o, asOfDate));
}
