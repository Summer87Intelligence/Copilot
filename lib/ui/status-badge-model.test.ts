import { describe, expect, it } from "vitest";

import {
  overdueDaysToStatusTone,
  riskToStatusTone,
} from "@/lib/ui/status-badge-model";

describe("status-badge-model", () => {
  it("mapea nivel de riesgo a tono", () => {
    expect(riskToStatusTone("healthy")).toBe("positive");
    expect(riskToStatusTone("attention")).toBe("warning");
    expect(riskToStatusTone("critical")).toBe("danger");
  });

  it("mapea días de atraso a tono con cortes en 0 y 14", () => {
    expect(overdueDaysToStatusTone(0)).toBe("positive");
    expect(overdueDaysToStatusTone(-3)).toBe("positive");
    expect(overdueDaysToStatusTone(1)).toBe("warning");
    expect(overdueDaysToStatusTone(14)).toBe("warning");
    expect(overdueDaysToStatusTone(15)).toBe("danger");
    expect(overdueDaysToStatusTone(120)).toBe("danger");
  });
});
