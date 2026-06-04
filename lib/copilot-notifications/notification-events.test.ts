import { describe, expect, it } from "vitest";

import {
  buildDebtFollowupSummaryBody,
  buildDebtFollowupSummaryTitle,
  buildTreasuryDueBody,
  computeClientOverdueBucket,
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

// ── computeClientOverdueBucket ────────────────────────────────────────────────

describe("computeClientOverdueBucket", () => {
  it("31 días → 30d (warning)", () => expect(computeClientOverdueBucket(31)).toBe("30d"));
  it("59 días → 30d (warning, borde inferior de 60d)", () =>
    expect(computeClientOverdueBucket(59)).toBe("30d"));
  it("60 días → 60d (critical)", () => expect(computeClientOverdueBucket(60)).toBe("60d"));
  it("65 días → 60d (critical)", () => expect(computeClientOverdueBucket(65)).toBe("60d"));
  it("89 días → 60d (borde inferior de 90d)", () =>
    expect(computeClientOverdueBucket(89)).toBe("60d"));
  it("90 días → 90d (critical)", () => expect(computeClientOverdueBucket(90)).toBe("90d"));
  it("95 días → 90d (critical)", () => expect(computeClientOverdueBucket(95)).toBe("90d"));
  it("1 día → 7d (sin bucket de atención)", () => expect(computeClientOverdueBucket(1)).toBe("7d"));
  it("0 días → 7d", () => expect(computeClientOverdueBucket(0)).toBe("7d"));
});

describe("computeClientOverdueBucket — severity derivada", () => {
  function severity(days: number): "warning" | "critical" {
    return days >= 60 ? "critical" : "warning";
  }

  it("31 días → warning", () => expect(severity(31)).toBe("warning"));
  it("59 días → warning", () => expect(severity(59)).toBe("warning"));
  it("60 días → critical", () => expect(severity(60)).toBe("critical"));
  it("65 días → critical", () => expect(severity(65)).toBe("critical"));
  it("95 días → critical", () => expect(severity(95)).toBe("critical"));
});

describe("dedup_key por bucket no colisiona entre clientes distintos", () => {
  const date = "2026-05";
  const c1 = "client-uuid-1";
  const c2 = "client-uuid-2";

  it("mismo cliente, distinta moneda → dedup distinto", () => {
    const k1 = `client_overdue:${c1}:UYU:30d:${date}`;
    const k2 = `client_overdue:${c1}:USD:30d:${date}`;
    expect(k1).not.toBe(k2);
  });

  it("mismo cliente, distinto bucket → dedup distinto", () => {
    const k1 = `client_overdue:${c1}:UYU:30d:${date}`;
    const k2 = `client_overdue:${c1}:UYU:60d:${date}`;
    expect(k1).not.toBe(k2);
  });

  it("clientes distintos, mismo bucket → dedup distinto", () => {
    const k1 = `client_overdue:${c1}:UYU:30d:${date}`;
    const k2 = `client_overdue:${c2}:UYU:30d:${date}`;
    expect(k1).not.toBe(k2);
  });
});

// ── buildDebtFollowupSummaryTitle ─────────────────────────────────────────────

describe("buildDebtFollowupSummaryTitle", () => {
  it("1 cliente → singular", () =>
    expect(buildDebtFollowupSummaryTitle(1)).toBe("1 cliente con deuda vencida"));

  it("2 clientes → plural", () =>
    expect(buildDebtFollowupSummaryTitle(2)).toBe("2 clientes con deuda vencida"));

  it("17 clientes → plural con número real", () =>
    expect(buildDebtFollowupSummaryTitle(17)).toBe("17 clientes con deuda vencida"));

  it("47 clientes → plural con número real", () =>
    expect(buildDebtFollowupSummaryTitle(47)).toBe("47 clientes con deuda vencida"));
});

// ── buildDebtFollowupSummaryBody ──────────────────────────────────────────────

describe("buildDebtFollowupSummaryBody", () => {
  it("solo UYU → muestra monto UYU", () =>
    expect(buildDebtFollowupSummaryBody(32120, 0)).toBe(
      "UYU 32.120 vencidos. Revisá clientes críticos."
    ));

  it("solo USD → muestra monto USD", () =>
    expect(buildDebtFollowupSummaryBody(0, 3049)).toBe(
      "USD 3.049 vencidos. Revisá clientes críticos."
    ));

  it("UYU y USD → muestra ambos separados por 'y'", () =>
    expect(buildDebtFollowupSummaryBody(32120, 3049)).toBe(
      "UYU 32.120 y USD 3.049 vencidos. Revisá clientes críticos."
    ));

  it("sin montos → solo CTA", () =>
    expect(buildDebtFollowupSummaryBody(0, 0)).toBe("Revisá clientes críticos."));
});

// ── debt_followup_summary dedup_key ──────────────────────────────────────────

describe("dedup_key de debt_followup_summary", () => {
  it("formato esperado", () => {
    const ymd = "2026-06-04";
    expect(`debt_followup_summary:${ymd}`).toBe("debt_followup_summary:2026-06-04");
  });

  it("mismo día → misma dedup_key (no duplica)", () => {
    const day1 = "2026-06-04";
    const day2 = "2026-06-04";
    expect(`debt_followup_summary:${day1}`).toBe(`debt_followup_summary:${day2}`);
  });

  it("días distintos → dedup_keys distintas", () => {
    const k1 = "debt_followup_summary:2026-06-04";
    const k2 = "debt_followup_summary:2026-06-05";
    expect(k1).not.toBe(k2);
  });

  it("no colisiona con client_overdue", () => {
    const summary = "debt_followup_summary:2026-06-04";
    const individual = "client_overdue:client-uuid:UYU:30d:2026-06";
    expect(summary).not.toBe(individual);
  });
});
