export type CalendarTabId = "this_month" | "next_month" | "later";

function addDaysIso(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function isoYMD(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getMonthBoundaries(today: string) {
  const [y, m] = today.split("-").map(Number);
  return {
    thisMonthEnd: isoYMD(new Date(Date.UTC(y, m, 0))),
    nextMonthStart: isoYMD(new Date(Date.UTC(y, m, 1))),
    nextMonthEnd: isoYMD(new Date(Date.UTC(y, m + 1, 0))),
  };
}

/**
 * Returns exclusive [start, end] date ranges for each calendar tab.
 * Ranges are mutually exclusive — no date appears in more than one bucket.
 *
 * this_month : today … end of current month
 * next_month : first … last day of next month
 * later      : first day after next month … today + 90 days
 */
export function getCalendarPeriodRange(
  tab: CalendarTabId,
  today: string
): { start: string; end: string } {
  const { thisMonthEnd, nextMonthStart, nextMonthEnd } = getMonthBoundaries(today);
  if (tab === "this_month") return { start: today, end: thisMonthEnd };
  if (tab === "next_month") return { start: nextMonthStart, end: nextMonthEnd };
  return { start: addDaysIso(nextMonthEnd, 1), end: addDaysIso(today, 90) };
}
