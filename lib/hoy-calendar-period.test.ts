import { describe, expect, it } from "vitest";
import { getCalendarPeriodRange, type CalendarTabId } from "./hoy-calendar-period";

const TODAY = "2026-07-02";
const TABS: CalendarTabId[] = ["this_month", "next_month", "later"];

function inRange(date: string, tab: CalendarTabId, today: string): boolean {
  const { start, end } = getCalendarPeriodRange(tab, today);
  return date >= start && date <= end;
}

describe("getCalendarPeriodRange", () => {
  it("this_month: starts on the 1st (includes overdue earlier this month), ends end of July", () => {
    const r = getCalendarPeriodRange("this_month", TODAY);
    expect(r.start).toBe("2026-07-01");
    expect(r.end).toBe("2026-07-31");
  });

  it("2026-07-01 (overdue earlier this month) falls only in this_month", () => {
    expect(inRange("2026-07-01", "this_month", TODAY)).toBe(true);
    expect(inRange("2026-07-01", "next_month", TODAY)).toBe(false);
    expect(inRange("2026-07-01", "later", TODAY)).toBe(false);
  });

  it("2026-06-30 (overdue from prior month) is excluded from all tabs", () => {
    for (const tab of TABS) {
      expect(inRange("2026-06-30", tab, TODAY)).toBe(false);
    }
  });

  it("next_month: full August", () => {
    const r = getCalendarPeriodRange("next_month", TODAY);
    expect(r.start).toBe("2026-08-01");
    expect(r.end).toBe("2026-08-31");
  });

  it("later: Sep 1 to today + 90 days (Sep 30)", () => {
    const r = getCalendarPeriodRange("later", TODAY);
    expect(r.start).toBe("2026-09-01");
    expect(r.end).toBe("2026-09-30");
  });

  it("2026-07-03 falls only in this_month", () => {
    expect(inRange("2026-07-03", "this_month", TODAY)).toBe(true);
    expect(inRange("2026-07-03", "next_month", TODAY)).toBe(false);
    expect(inRange("2026-07-03", "later", TODAY)).toBe(false);
  });

  it("2026-07-31 falls only in this_month", () => {
    expect(inRange("2026-07-31", "this_month", TODAY)).toBe(true);
    expect(inRange("2026-07-31", "next_month", TODAY)).toBe(false);
    expect(inRange("2026-07-31", "later", TODAY)).toBe(false);
  });

  it("2026-08-01 falls only in next_month", () => {
    expect(inRange("2026-08-01", "this_month", TODAY)).toBe(false);
    expect(inRange("2026-08-01", "next_month", TODAY)).toBe(true);
    expect(inRange("2026-08-01", "later", TODAY)).toBe(false);
  });

  it("2026-08-31 falls only in next_month", () => {
    expect(inRange("2026-08-31", "this_month", TODAY)).toBe(false);
    expect(inRange("2026-08-31", "next_month", TODAY)).toBe(true);
    expect(inRange("2026-08-31", "later", TODAY)).toBe(false);
  });

  it("2026-09-01 falls only in later", () => {
    expect(inRange("2026-09-01", "this_month", TODAY)).toBe(false);
    expect(inRange("2026-09-01", "next_month", TODAY)).toBe(false);
    expect(inRange("2026-09-01", "later", TODAY)).toBe(true);
  });

  it("2026-09-02 falls only in later", () => {
    expect(inRange("2026-09-02", "this_month", TODAY)).toBe(false);
    expect(inRange("2026-09-02", "next_month", TODAY)).toBe(false);
    expect(inRange("2026-09-02", "later", TODAY)).toBe(true);
  });

  it("2026-10-01 is excluded from all tabs (91 days from today)", () => {
    for (const tab of TABS) {
      expect(inRange("2026-10-01", tab, TODAY)).toBe(false);
    }
  });

  it("no date appears in more than one tab (mutual exclusivity)", () => {
    const dates = [
      "2026-07-02", "2026-07-03", "2026-07-31",
      "2026-08-01", "2026-08-15", "2026-08-31",
      "2026-09-01", "2026-09-15", "2026-09-30",
    ];
    for (const date of dates) {
      const matches = TABS.filter((tab) => inRange(date, tab, TODAY));
      expect(
        matches.length,
        `${date} matched ${matches.join(", ")} — must be exactly 1`
      ).toBe(1);
    }
  });

  it("works for year-end boundary (Dec 28)", () => {
    const r = getCalendarPeriodRange("later", "2026-12-28");
    expect(r.start).toBe("2027-02-01");
    expect(r.end).toBe("2027-03-28");
  });
});
