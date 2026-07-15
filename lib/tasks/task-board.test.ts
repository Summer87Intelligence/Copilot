import { describe, expect, it } from "vitest";

import type { DailyTask } from "@/lib/daily-tasks/daily-tasks-types";
import {
  ADMIN_ONLY_TABS,
  compareTasks,
  filterTasksForBoard,
  tabCounts,
  visibleTabs,
} from "@/lib/tasks/task-board";

const TODAY = "2026-07-15";
const ME = "me";

function t(overrides: Partial<DailyTask>): DailyTask {
  return {
    id: crypto.randomUUID(),
    workspace_id: "ws",
    assigned_to_user_id: null,
    title: "T",
    description: null,
    module_key: "clientes",
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

describe("visibleTabs", () => {
  it("no-admin no ve tabs administrativos", () => {
    const tabs = visibleTabs(false);
    for (const admin of ADMIN_ONLY_TABS) expect(tabs).not.toContain(admin);
    expect(tabs).toContain("mine");
  });
  it("admin ve todos", () => {
    expect(visibleTabs(true)).toContain("unassigned");
    expect(visibleTabs(true)).toContain("all");
  });
});

describe("filterTasksForBoard tabs", () => {
  const tasks = [
    t({ assigned_to_user_id: ME, status: "pending" }),
    t({ assigned_to_user_id: ME, status: "in_progress", due_date: TODAY }),
    t({ due_date: "2026-07-14", status: "pending" }), // overdue, unassigned
    t({ status: "done", completed_at: "2026-07-15T00:00:00Z" }),
  ];
  const base = { viewerId: ME, todayYmd: TODAY, filters: {} };

  it("mine → asignadas a mí", () => {
    expect(filterTasksForBoard(tasks, { ...base, tab: "mine" })).toHaveLength(2);
  });
  it("today → vence hoy", () => {
    expect(filterTasksForBoard(tasks, { ...base, tab: "today" })).toHaveLength(1);
  });
  it("overdue → atrasadas", () => {
    expect(filterTasksForBoard(tasks, { ...base, tab: "overdue" })).toHaveLength(1);
  });
  it("in_progress", () => {
    expect(filterTasksForBoard(tasks, { ...base, tab: "in_progress" })).toHaveLength(1);
  });
  it("completed", () => {
    expect(filterTasksForBoard(tasks, { ...base, tab: "completed" })).toHaveLength(1);
  });
  it("unassigned → sin asignar y abiertas", () => {
    expect(filterTasksForBoard(tasks, { ...base, tab: "unassigned" })).toHaveLength(1);
  });
  it("all → todas", () => {
    expect(filterTasksForBoard(tasks, { ...base, tab: "all" })).toHaveLength(4);
  });
});

describe("filterTasksForBoard filters", () => {
  const tasks = [
    t({ module_key: "clientes", priority: "high", title: "Llamar cliente" }),
    t({ module_key: "cobranza", priority: "low", title: "Revisar pago", task_key: "auto:x" }),
  ];
  const base = { viewerId: ME, todayYmd: TODAY, tab: "all" as const };

  it("filtra por módulo", () => {
    expect(filterTasksForBoard(tasks, { ...base, filters: { module: "cobranza" } })).toHaveLength(1);
  });
  it("filtra por prioridad", () => {
    expect(filterTasksForBoard(tasks, { ...base, filters: { priority: "high" } })).toHaveLength(1);
  });
  it("filtra por origen (manual vs automatic)", () => {
    expect(filterTasksForBoard(tasks, { ...base, filters: { source: "manual" } })).toHaveLength(1);
    expect(filterTasksForBoard(tasks, { ...base, filters: { source: "automatic" } })).toHaveLength(1);
  });
  it("busca en título", () => {
    expect(filterTasksForBoard(tasks, { ...base, filters: { q: "pago" } })).toHaveLength(1);
  });
});

describe("compareTasks", () => {
  it("crítica antes que alta, luego por fecha", () => {
    const crit = t({ priority: "critical" });
    const high = t({ priority: "high", due_date: "2026-07-10" });
    const highLater = t({ priority: "high", due_date: "2026-07-20" });
    const sorted = [highLater, high, crit].sort(compareTasks);
    expect(sorted[0]).toBe(crit);
    expect(sorted[1]).toBe(high);
  });
});

describe("tabCounts", () => {
  it("cuenta por tab visible", () => {
    const tasks = [
      t({ assigned_to_user_id: ME }),
      t({ due_date: "2026-07-14" }),
    ];
    const counts = tabCounts(tasks, { viewerId: ME, todayYmd: TODAY, isAdmin: true });
    expect(counts.mine).toBe(1);
    expect(counts.overdue).toBe(1);
    expect(counts.all).toBe(2);
  });
});
