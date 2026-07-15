import { describe, expect, it } from "vitest";

import type { DailyTask } from "@/lib/daily-tasks/daily-tasks-types";
import { openTasksForEntity, tasksForEntity } from "@/lib/tasks/task-entity";

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

describe("tasksForEntity", () => {
  const tasks = [
    t({ source_type: "client", source_id: "c1", status: "pending" }),
    t({ source_type: "client", source_id: "c1", status: "done" }),
    t({ source_type: "client", source_id: "c2" }),
    t({ source_type: "alert", source_id: "c1" }),
  ];
  it("filtra por tipo e id", () => {
    expect(tasksForEntity(tasks, "client", "c1")).toHaveLength(2);
    expect(tasksForEntity(tasks, "alert", "c1")).toHaveLength(1);
  });
  it("openTasksForEntity excluye completadas", () => {
    expect(openTasksForEntity(tasks, "client", "c1")).toHaveLength(1);
  });
});
