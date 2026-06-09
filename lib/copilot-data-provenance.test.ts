import { describe, expect, it } from "vitest";

import {
  buildCopilotProvenanceLine,
  formatCopilotPeriodLabel,
  formatCopilotRelativeUpdated,
} from "@/lib/copilot-data-provenance";

describe("copilot-data-provenance", () => {
  it("formatea mes actual cuando el rango es mes a hoy", () => {
    const today = new Date().toISOString().slice(0, 10);
    const from = `${today.slice(0, 7)}-01`;
    expect(formatCopilotPeriodLabel(from, today)).toBe("mes actual");
  });

  it("formatea actualización relativa en horas", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatCopilotRelativeUpdated(twoHoursAgo)).toMatch(/hace \d+ h/);
  });

  it("arma línea con fuente Zeta por defecto", () => {
    const line = buildCopilotProvenanceLine({
      updatedAt: new Date().toISOString(),
      periodLabel: "mes actual",
    });
    expect(line.source).toBe("Zeta");
    expect(line.periodLabel).toBe("mes actual");
  });
});
