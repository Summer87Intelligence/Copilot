import { describe, expect, it } from "vitest";

import {
  DAILY_TASK_PRIORITIES,
  DAILY_TASK_PRIORITY_LABELS,
  DAILY_TASK_STATUSES,
  DAILY_TASK_STATUS_LABELS,
  isValidDailyTaskPriority,
  isValidDailyTaskStatus,
} from "@/lib/daily-tasks/daily-tasks-types";

describe("daily tasks types", () => {
  it("estados esperados", () => {
    expect([...DAILY_TASK_STATUSES]).toEqual([
      "pending",
      "in_progress",
      "done",
      "postponed",
      "cancelled",
    ]);
  });

  it("prioridades esperadas", () => {
    expect([...DAILY_TASK_PRIORITIES]).toEqual(["critical", "high", "medium", "low"]);
  });

  it("labels cubren todos los estados y prioridades", () => {
    for (const status of DAILY_TASK_STATUSES) {
      expect(DAILY_TASK_STATUS_LABELS[status]).toBeTruthy();
    }
    for (const priority of DAILY_TASK_PRIORITIES) {
      expect(DAILY_TASK_PRIORITY_LABELS[priority]).toBeTruthy();
    }
  });

  it("validadores aceptan valores válidos y rechazan inválidos", () => {
    expect(isValidDailyTaskStatus("in_progress")).toBe(true);
    expect(isValidDailyTaskStatus("archived")).toBe(false);
    expect(isValidDailyTaskPriority("high")).toBe(true);
    expect(isValidDailyTaskPriority("urgent")).toBe(false);
  });
});
