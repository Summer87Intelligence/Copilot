import { describe, expect, it } from "vitest";

import { priorityLabel, priorityTone, statusLabel, statusTone } from "@/lib/tasks/task-ui";

describe("task-ui tones", () => {
  it("estado → tono", () => {
    expect(statusTone("done")).toBe("positive");
    expect(statusTone("in_progress")).toBe("warning");
    expect(statusTone("pending")).toBe("neutral");
  });
  it("prioridad → tono", () => {
    expect(priorityTone("critical")).toBe("danger");
    expect(priorityTone("high")).toBe("danger");
    expect(priorityTone("medium")).toBe("warning");
    expect(priorityTone("low")).toBe("neutral");
  });
  it("labels", () => {
    expect(statusLabel("done")).toBe("Completada");
    expect(priorityLabel("critical")).toBe("Crítica");
  });
});
