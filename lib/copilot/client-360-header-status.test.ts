import { describe, expect, it } from "vitest";

import {
  deriveClient360HeaderStatus,
  CLIENT_360_HEADER_STATUS_LABEL,
} from "@/lib/copilot/client-360-header-status";

const base = {
  isActive: true,
  debtUyu: 0,
  debtUsd: 0,
  overdueUyu: 0,
  overdueUsd: 0,
  risk: "Bajo" as const,
};

describe("deriveClient360HeaderStatus", () => {
  it("sin saldo → Al día", () => {
    const r = deriveClient360HeaderStatus(base);
    expect(r.status).toBe("current");
    expect(r.label).toBe("Al día");
  });

  it("deuda sin atraso → Con saldo pendiente", () => {
    const r = deriveClient360HeaderStatus({ ...base, debtUyu: 5000 });
    expect(r.status).toBe("pending");
    expect(r.label).toBe("Con saldo pendiente");
  });

  it("saldo atrasado > 0 → Con atraso", () => {
    const r = deriveClient360HeaderStatus({ ...base, debtUyu: 5000, overdueUyu: 2000 });
    expect(r.status).toBe("delayed");
    expect(r.label).toBe("Con atraso");
    expect(r.tone).toBe("danger");
  });

  it("riesgo alto gana sobre atraso", () => {
    const r = deriveClient360HeaderStatus({
      ...base,
      debtUsd: 9999,
      overdueUsd: 100,
      risk: "Alto",
    });
    expect(r.status).toBe("at_risk");
    expect(r.label).toBe("Riesgo alto");
  });

  it("inactivo gana sobre todo", () => {
    const r = deriveClient360HeaderStatus({
      ...base,
      isActive: false,
      debtUyu: 1000,
      overdueUyu: 1000,
      risk: "Alto",
    });
    expect(r.status).toBe("inactive");
    expect(r.label).toBe("Inactivo");
  });

  it("ninguna etiqueta usa 'vencido/vencida'", () => {
    for (const label of Object.values(CLIENT_360_HEADER_STATUS_LABEL)) {
      expect(label.toLowerCase()).not.toMatch(/vencid/);
    }
  });
});
