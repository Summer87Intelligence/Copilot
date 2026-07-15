import { describe, expect, it } from "vitest";

import { alertSeverityToPriority, alertTaskDedupKey, alertTaskTitle } from "@/lib/tasks/alert-task";

describe("alertSeverityToPriority", () => {
  it("critical → high (nunca critical, para no gatear a no-admin)", () => {
    expect(alertSeverityToPriority("critical")).toBe("high");
  });
  it("warning → medium", () => {
    expect(alertSeverityToPriority("warning")).toBe("medium");
  });
  it("info / desconocido → low", () => {
    expect(alertSeverityToPriority("info")).toBe("low");
    expect(alertSeverityToPriority("otro")).toBe("low");
  });
});

describe("alertTaskTitle", () => {
  it("prefija sin volcar payload y recorta", () => {
    expect(alertTaskTitle("Caja crítica")).toBe("Revisar alerta: Caja crítica");
    const long = "x".repeat(300);
    expect(alertTaskTitle(long).length).toBeLessThanOrEqual("Revisar alerta: ".length + 160);
  });
});

describe("alertTaskDedupKey", () => {
  it("clave estable por workspace + alerta", () => {
    expect(alertTaskDedupKey("ws1", "a1")).toBe("ws1:alert:a1");
    expect(alertTaskDedupKey("ws1", "a1")).toBe(alertTaskDedupKey("ws1", "a1"));
    expect(alertTaskDedupKey("ws2", "a1")).not.toBe(alertTaskDedupKey("ws1", "a1"));
  });
});
