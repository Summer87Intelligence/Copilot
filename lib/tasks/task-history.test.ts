import { describe, expect, it } from "vitest";

import { commentEntry, createdEntry, diffTaskChanges } from "@/lib/tasks/task-history";

describe("diffTaskChanges", () => {
  it("detecta cambios en campos trackeados", () => {
    const entries = diffTaskChanges(
      { status: "pending", priority: "medium", assigned_to_user_id: null },
      { status: "in_progress", priority: "high", assigned_to_user_id: "u1" }
    );
    const actions = entries.map((e) => e.action);
    expect(actions).toContain("status_changed");
    expect(actions).toContain("priority_changed");
    expect(actions).toContain("assigned");
    const status = entries.find((e) => e.field === "status")!;
    expect(status.old_value).toBe("pending");
    expect(status.new_value).toBe("in_progress");
  });

  it("ignora campos no cambiados", () => {
    expect(diffTaskChanges({ status: "pending" }, { status: "pending" })).toHaveLength(0);
  });

  it("ignora campos no presentes en after", () => {
    expect(diffTaskChanges({ status: "pending", priority: "low" }, { status: "done" })).toHaveLength(1);
  });

  it("null → valor cuenta como asignación", () => {
    const entries = diffTaskChanges({ assigned_to_user_id: null }, { assigned_to_user_id: "u1" });
    expect(entries).toHaveLength(1);
    expect(entries[0].old_value).toBeNull();
    expect(entries[0].new_value).toBe("u1");
  });

  it("entradas de creación y comentario", () => {
    expect(createdEntry().action).toBe("created");
    expect(commentEntry().action).toBe("comment_added");
  });
});
