import { describe, expect, it } from "vitest";

import type { DailyTask } from "@/lib/daily-tasks/daily-tasks-types";
import { summarizeTasks, workloadByUser } from "@/lib/tasks/task-summary";

const TODAY = "2026-07-15";

function t(overrides: Partial<DailyTask>): DailyTask {
  return {
    id: crypto.randomUUID(),
    workspace_id: "ws",
    assigned_to_user_id: null,
    title: "T",
    description: null,
    module_key: "general",
    source_type: null,
    source_id: null,
    priority: "medium",
    status: "pending",
    due_date: null,
    completed_at: null,
    completed_by: null,
    action_url: null,
    task_key: null,
    snoozed_until: null,
    created_by_user_id: null,
    visibility: "workspace",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

describe("summarizeTasks", () => {
  it("cuenta estados, atraso, hoy, sin asignar y completadas del período", () => {
    const tasks = [
      t({ status: "pending", due_date: "2026-07-14" }), // overdue + pending + unassigned
      t({ status: "in_progress", due_date: TODAY, assigned_to_user_id: "u1" }), // dueToday
      t({ status: "pending", assigned_to_user_id: "u1" }), // pending
      t({ status: "done", completed_at: "2026-07-15T10:00:00Z" }), // completed today
      t({ status: "done", completed_at: "2026-06-01T10:00:00Z" }), // fuera del período
      t({ status: "cancelled", due_date: "2026-01-01" }), // no cuenta atraso
    ];
    const s = summarizeTasks(tasks, { todayYmd: TODAY, periodStartYmd: "2026-07-01" });
    expect(s.pending).toBe(2);
    expect(s.inProgress).toBe(1);
    expect(s.overdue).toBe(1);
    expect(s.dueToday).toBe(1);
    expect(s.unassigned).toBe(1);
    expect(s.completedInPeriod).toBe(1);
    expect(s.total).toBe(6);
  });
});

describe("workloadByUser", () => {
  it("agrupa por usuario y pone 'sin asignar' primero", () => {
    const tasks = [
      t({ assigned_to_user_id: null, status: "pending" }),
      t({ assigned_to_user_id: "u1", status: "pending" }),
      t({ assigned_to_user_id: "u1", status: "in_progress", due_date: "2026-07-14" }),
      t({ assigned_to_user_id: "u2", status: "pending" }),
    ];
    const wl = workloadByUser(tasks, { todayYmd: TODAY });
    expect(wl[0].userId).toBeNull();
    const u1 = wl.find((w) => w.userId === "u1")!;
    expect(u1.active).toBe(2);
    expect(u1.overdue).toBe(1);
  });
});
