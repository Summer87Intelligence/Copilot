import { describe, expect, it } from "vitest";

import {
  buildTreasuryDueBody,
  computeTreasuryDueMilestone,
  type DueMilestone,
} from "@/lib/copilot-notifications/notification-events";

// ── computeTreasuryDueMilestone ───────────────────────────────────────────────

describe("computeTreasuryDueMilestone", () => {
  it("0 días → today", () => expect(computeTreasuryDueMilestone(0)).toBe("today"));
  it("negativo → today", () => expect(computeTreasuryDueMilestone(-1)).toBe("today"));
  it("1 día → 1d", () => expect(computeTreasuryDueMilestone(1)).toBe("1d"));
  it("2 días → 3d", () => expect(computeTreasuryDueMilestone(2)).toBe("3d"));
  it("3 días → 3d", () => expect(computeTreasuryDueMilestone(3)).toBe("3d"));
  it("4 días → 7d", () => expect(computeTreasuryDueMilestone(4)).toBe("7d"));
  it("7 días → 7d", () => expect(computeTreasuryDueMilestone(7)).toBe("7d"));
  it("8 días → 7d (fuera de ventana, clasifica igual)", () =>
    expect(computeTreasuryDueMilestone(8)).toBe("7d"));
});

// ── buildTreasuryDueBody ──────────────────────────────────────────────────────

describe("buildTreasuryDueBody", () => {
  it("today sin hora", () =>
    expect(buildTreasuryDueBody("BPS", "today", 0)).toBe("BPS vence hoy."));

  it("today con hora HH:mm:ss recorta a HH:mm", () =>
    expect(buildTreasuryDueBody("BPS", "today", 0, "15:00:00")).toBe(
      "BPS vence hoy a las 15:00."
    ));

  it("today con hora HH:mm", () =>
    expect(buildTreasuryDueBody("BPS", "today", 0, "08:30")).toBe(
      "BPS vence hoy a las 08:30."
    ));

  it("1d sin hora", () =>
    expect(buildTreasuryDueBody("Sueldo mensual", "1d", 1)).toBe(
      "Sueldo mensual vence mañana."
    ));

  it("1d con hora", () =>
    expect(buildTreasuryDueBody("Sueldo mensual", "1d", 1, "09:00")).toBe(
      "Sueldo mensual vence mañana a las 09:00."
    ));

  it("3d muestra días exactos", () =>
    expect(buildTreasuryDueBody("DGI", "3d", 3)).toBe("DGI vence en 3 días."));

  it("3d con 2 días reales", () =>
    expect(buildTreasuryDueBody("DGI", "3d", 2)).toBe("DGI vence en 2 días."));

  it("7d muestra días exactos", () =>
    expect(buildTreasuryDueBody("BPS", "7d", 7)).toBe("BPS vence en 7 días."));

  it("7d con 6 días reales (primer run antes del hito exacto)", () =>
    expect(buildTreasuryDueBody("BPS", "7d", 6)).toBe("BPS vence en 6 días."));

  it("dueTime null no agrega hora", () =>
    expect(buildTreasuryDueBody("BPS", "today", 0, null)).toBe("BPS vence hoy."));
});

// ── dedup_key suffix por hito ─────────────────────────────────────────────────

describe("dedup_key format por hito", () => {
  const id = "oblig-uuid";
  const date = "2026-06-10";

  const cases: Array<[number, DueMilestone]> = [
    [0, "today"],
    [-2, "today"],
    [1, "1d"],
    [2, "3d"],
    [3, "3d"],
    [4, "7d"],
    [7, "7d"],
  ];

  for (const [days, expectedMilestone] of cases) {
    it(`${days} días → dedup_key :${expectedMilestone}`, () => {
      const milestone = computeTreasuryDueMilestone(days);
      expect(`treasury_payment_due:${id}:${date}:${milestone}`).toBe(
        `treasury_payment_due:${id}:${date}:${expectedMilestone}`
      );
    });
  }
});

// ── cada hito genera una dedup_key distinta ───────────────────────────────────

describe("hitos generan dedup_keys distintas entre sí", () => {
  const id = "oblig-uuid";
  const date = "2026-06-10";

  it("los 4 hitos no colisionan entre sí", () => {
    const milestones: DueMilestone[] = ["7d", "3d", "1d", "today"];
    const keys = milestones.map((m) => `treasury_payment_due:${id}:${date}:${m}`);
    expect(new Set(keys).size).toBe(4);
  });

  it("overdue usa tipo distinto → no colisiona con due", () => {
    const dueKey = `treasury_payment_due:${id}:${date}:today`;
    const overdueKey = `treasury_payment_overdue:${id}:${date}`;
    expect(dueKey).not.toBe(overdueKey);
  });
});
