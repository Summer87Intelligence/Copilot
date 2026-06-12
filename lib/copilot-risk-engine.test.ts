import { describe, expect, it } from "vitest";

import {
  coverageBand,
  derivePriorityForClient,
  deriveRiskStatus,
  RISK_ENGINE_THRESHOLDS,
} from "@/lib/copilot-risk-engine";

describe("coverageBand", () => {
  it("ratio 0 o negativo es adjusted", () => {
    expect(coverageBand(0)).toBe("adjusted");
    expect(coverageBand(-1)).toBe("adjusted");
    expect(coverageBand(NaN)).toBe("adjusted");
  });
  it("ratio < 0.5 es critical", () => {
    expect(coverageBand(0.1)).toBe("critical");
    expect(coverageBand(0.49)).toBe("critical");
  });
  it("ratio entre 0.5 y 1.0 es adjusted", () => {
    expect(coverageBand(0.5)).toBe("adjusted");
    expect(coverageBand(0.99)).toBe("adjusted");
  });
  it("ratio >= 1.0 es comfortable", () => {
    expect(coverageBand(1.0)).toBe("comfortable");
    expect(coverageBand(3.5)).toBe("comfortable");
  });
});

describe("deriveRiskStatus", () => {
  const base = {
    riskBand: "low" as const,
    coverageRatio: 1.5,
    highRiskClientCount: 0,
    overdueClientCount: 0,
  };

  it("healthy cuando nada apremia", () => {
    expect(deriveRiskStatus(base).status).toBe("healthy");
  });

  it("crítico por riskBand critical aunque todo lo demás OK", () => {
    const r = deriveRiskStatus({ ...base, riskBand: "critical" });
    expect(r.status).toBe("critical");
    expect(r.reasons).toContain("risk_band_critical");
  });

  it("crítico por coverage <0.5", () => {
    const r = deriveRiskStatus({ ...base, coverageRatio: 0.3 });
    expect(r.status).toBe("critical");
    expect(r.reasons).toContain("coverage_critical");
  });

  it("crítico por 3+ clientes high-risk", () => {
    const r = deriveRiskStatus({ ...base, highRiskClientCount: 3 });
    expect(r.status).toBe("critical");
    expect(r.reasons).toContain("high_risk_clients_critical");
  });

  it("atención por riskBand high", () => {
    const r = deriveRiskStatus({ ...base, riskBand: "high" });
    expect(r.status).toBe("attention");
    expect(r.reasons).toContain("risk_band_high");
  });

  it("atención por coverage 0.5–1.0", () => {
    const r = deriveRiskStatus({ ...base, coverageRatio: 0.75 });
    expect(r.status).toBe("attention");
    expect(r.reasons).toContain("coverage_low");
  });

  it("atención por overdue clients > 0", () => {
    const r = deriveRiskStatus({ ...base, overdueClientCount: 1 });
    expect(r.status).toBe("attention");
    expect(r.reasons).toContain("overdue_clients");
  });

  it("atención por high-risk clients = 1 (no crítico)", () => {
    const r = deriveRiskStatus({ ...base, highRiskClientCount: 1 });
    expect(r.status).toBe("attention");
    expect(r.reasons).toContain("high_risk_clients_attention");
    expect(r.reasons).not.toContain("high_risk_clients_critical");
  });

  it("determinístico: misma data ⇒ mismo veredicto", () => {
    const a = deriveRiskStatus({ ...base, overdueClientCount: 5, riskBand: "high" });
    const b = deriveRiskStatus({ ...base, overdueClientCount: 5, riskBand: "high" });
    expect(a).toEqual(b);
  });

  it("thresholds exportados son la fuente única de ajuste", () => {
    expect(RISK_ENGINE_THRESHOLDS.coverage.critical).toBe(0.5);
    expect(RISK_ENGINE_THRESHOLDS.highRiskClients.critical).toBe(3);
  });
});

describe("derivePriorityForClient", () => {
  it("critical si >=60 días de mora", () => {
    expect(
      derivePriorityForClient({
        riskLevel: "Bajo",
        overdueDays: 60,
        hasOverdueDebt: true,
        derivedFromDebt: false,
      })
    ).toBe("critical");
  });

  it("critical si Alto + vencido", () => {
    expect(
      derivePriorityForClient({
        riskLevel: "Alto",
        overdueDays: 10,
        hasOverdueDebt: true,
        derivedFromDebt: false,
      })
    ).toBe("critical");
  });

  it("high si overdue > 0", () => {
    expect(
      derivePriorityForClient({
        riskLevel: "Medio",
        overdueDays: 5,
        hasOverdueDebt: true,
        derivedFromDebt: false,
      })
    ).toBe("high");
  });

  it("medium si derivedFromDebt sin overdue", () => {
    expect(
      derivePriorityForClient({
        riskLevel: "Bajo",
        overdueDays: 0,
        hasOverdueDebt: false,
        derivedFromDebt: true,
      })
    ).toBe("medium");
  });

  it("low default", () => {
    expect(
      derivePriorityForClient({
        riskLevel: "Bajo",
        overdueDays: 0,
        hasOverdueDebt: false,
        derivedFromDebt: false,
      })
    ).toBe("low");
  });
});
