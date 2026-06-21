import { describe, expect, it } from "vitest";
import {
  buildWeeklyCashProjection,
  futureFridaysUntilHorizon,
  monthEndYmd,
  nextFridaysAfterToday,
  weeklyProjectionMilestones,
  WEEKLY_PROJECTION_DEFAULT_FRIDAY_COUNT,
} from "@/lib/weekly-cash-projection";

// today = viernes 2026-06-19 para todos los tests (a menos que se indique)
const TODAY = "2026-06-19";

describe("weeklyProjectionMilestones", () => {
  it("default: Hoy + próximos 5 viernes (6 milestones)", () => {
    expect(weeklyProjectionMilestones(TODAY)).toEqual([
      TODAY,
      "2026-06-26",
      "2026-07-03",
      "2026-07-10",
      "2026-07-17",
      "2026-07-24",
    ]);
  });

  it("si hoy es viernes, el primer viernes futuro es +7 días", () => {
    expect(nextFridaysAfterToday(TODAY, 1)).toEqual(["2026-06-26"]);
  });

  it("horizonEnd explícito fin de mes respeta fin de mes", () => {
    expect(weeklyProjectionMilestones("2026-06-01", "2026-06-30")).toEqual([
      "2026-06-01",
      "2026-06-05",
      "2026-06-12",
      "2026-06-19",
      "2026-06-26",
    ]);
  });

  it("default no incluye más de 5 viernes futuros", () => {
    const milestones = weeklyProjectionMilestones(TODAY);
    expect(milestones).toHaveLength(1 + WEEKLY_PROJECTION_DEFAULT_FRIDAY_COUNT);
    expect(milestones).not.toContain("2026-08-07");
  });
});

describe("futureFridaysUntilHorizon", () => {
  it("respeta horizonte custom", () => {
    expect(futureFridaysUntilHorizon("2026-06-01", "2026-06-12")).toEqual([
      "2026-06-05",
      "2026-06-12",
    ]);
  });
});

describe("buildWeeklyCashProjection", () => {
  it("sin flujos futuros devuelve los mismos balances en todas las filas", () => {
    const rows = buildWeeklyCashProjection({
      today: TODAY,
      cashUyu: 100_000,
      cashUsd: 5_000,
      outflows: [],
      inflows: [],
      fxRate: 40,
    });
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(row.uyu).toBe(100_000);
      expect(row.usd).toBe(5_000);
    }
  });

  it("primera fila es Hoy con status green y label 'Hoy'", () => {
    const rows = buildWeeklyCashProjection({
      today: TODAY,
      cashUyu: 50_000,
      cashUsd: 2_000,
      outflows: [],
      inflows: [],
      fxRate: 40,
    });
    expect(rows[0].isToday).toBe(true);
    expect(rows[0].label).toBe("Hoy");
    expect(rows[0].status).toBe("green");
    expect(rows[0].statusLabel).toBe("Base actual");
    expect(rows[0].deltaUsdEquivalent).toBe(0);
  });

  it("today 2026-06-19 genera 6 milestones con labels cortos", () => {
    const rows = buildWeeklyCashProjection({
      today: TODAY,
      cashUyu: 0,
      cashUsd: 0,
      outflows: [],
      inflows: [],
      fxRate: 40,
    });
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.label)).toEqual([
      "Hoy",
      "Próximo viernes",
      "Vie 03/07",
      "Vie 10/07",
      "Vie 17/07",
      "Vie 24/07",
    ]);
    expect(rows.some((r) => r.label.includes("90"))).toBe(false);
    expect(rows[rows.length - 1].isHorizonEnd).toBe(true);
  });

  it("horizonEnd explícito fin de mes: respeta todos los viernes del mes", () => {
    const rows = buildWeeklyCashProjection({
      today: "2026-06-01",
      cashUyu: 0,
      cashUsd: 0,
      outflows: [],
      inflows: [],
      fxRate: 40,
      horizonEnd: monthEndYmd("2026-06-01"),
    });
    expect(rows).toHaveLength(5);
    const last = rows[rows.length - 1];
    expect(last.date).toBe("2026-06-26");
    expect(last.label).toBe("Vie 26/06");
    expect(last.isHorizonEnd).toBe(true);
  });

  it("viernes se ordenan ascendente y están después de Hoy (horizonte fin de mes)", () => {
    const rows = buildWeeklyCashProjection({
      today: "2026-06-01",
      cashUyu: 0,
      cashUsd: 0,
      outflows: [],
      inflows: [],
      fxRate: 40,
      horizonEnd: "2026-06-30",
    });
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].date > rows[i - 1].date).toBe(true);
    }
    expect(rows.filter((r) => r.isFriday && !r.isToday).map((r) => r.date)).toEqual([
      "2026-06-05",
      "2026-06-12",
      "2026-06-19",
      "2026-06-26",
    ]);
  });

  it("pago USD reduce balance USD en la fila correcta (USD mode)", () => {
    const rows = buildWeeklyCashProjection({
      today: TODAY,
      cashUyu: 0,
      cashUsd: 10_000,
      outflows: [{ date: "2026-06-26", currency: "USD", amount: 3_000 }],
      inflows: [],
      fxRate: 40,
    });
    const todayRow = rows.find((r) => r.isToday)!;
    const nextFriday = rows.find((r) => r.date === "2026-06-26")!;
    expect(todayRow.usd).toBe(10_000);
    expect(nextFriday.usd).toBe(7_000);
  });

  it("pago UYU se convierte a USD equivalente correctamente", () => {
    const rows = buildWeeklyCashProjection({
      today: TODAY,
      cashUyu: 80_000,
      cashUsd: 0,
      outflows: [{ date: "2026-06-26", currency: "UYU", amount: 40_000 }],
      inflows: [],
      fxRate: 40,
    });
    const todayRow = rows.find((r) => r.isToday)!;
    const nextFriday = rows.find((r) => r.date === "2026-06-26")!;
    expect(todayRow.usdEquivalent).toBeCloseTo(2_000, 1);
    expect(nextFriday.usdEquivalent).toBeCloseTo(1_000, 1);
    expect(nextFriday.uyu).toBe(40_000);
  });

  it("cobro UYU se suma convertido en USD equivalente", () => {
    const rows = buildWeeklyCashProjection({
      today: TODAY,
      cashUyu: 0,
      cashUsd: 0,
      outflows: [],
      inflows: [{ date: "2026-06-26", currency: "UYU", amount: 80_000 }],
      fxRate: 40,
    });
    const nextFriday = rows.find((r) => r.date === "2026-06-26")!;
    expect(nextFriday.usdEquivalent).toBeCloseTo(2_000, 1);
    expect(nextFriday.uyu).toBe(80_000);
  });

  it("cobro USD se suma sin conversión", () => {
    const rows = buildWeeklyCashProjection({
      today: TODAY,
      cashUyu: 0,
      cashUsd: 5_000,
      outflows: [],
      inflows: [{ date: "2026-06-26", currency: "USD", amount: 2_000 }],
      fxRate: 40,
    });
    const nextFriday = rows.find((r) => r.date === "2026-06-26")!;
    expect(nextFriday.usd).toBe(7_000);
  });

  it("native mode: monedas se mantienen separadas", () => {
    const rows = buildWeeklyCashProjection({
      today: TODAY,
      cashUyu: 100_000,
      cashUsd: 5_000,
      outflows: [{ date: "2026-06-26", currency: "USD", amount: 1_000 }],
      inflows: [{ date: "2026-06-26", currency: "UYU", amount: 20_000 }],
      fxRate: 40,
    });
    const nextFriday = rows.find((r) => r.date === "2026-06-26")!;
    expect(nextFriday.uyu).toBe(120_000);
    expect(nextFriday.usd).toBe(4_000);
  });

  it("cálculo acumulativo: pagos en viernes intermedio afectan viernes posteriores", () => {
    const rows = buildWeeklyCashProjection({
      today: "2026-06-01",
      cashUyu: 0,
      cashUsd: 10_000,
      outflows: [
        { date: "2026-06-12", currency: "USD", amount: 2_000 },
        { date: "2026-06-26", currency: "USD", amount: 1_000 },
      ],
      inflows: [],
      fxRate: 40,
      horizonEnd: "2026-06-30",
    });
    expect(rows.find((r) => r.date === "2026-06-05")!.usd).toBe(10_000);
    expect(rows.find((r) => r.date === "2026-06-12")!.usd).toBe(8_000);
    expect(rows.find((r) => r.date === "2026-06-19")!.usd).toBe(8_000);
    expect(rows.find((r) => r.date === "2026-06-26")!.usd).toBe(7_000);
  });

  it("status rojo cuando balance USD equivalente es negativo", () => {
    const rows = buildWeeklyCashProjection({
      today: TODAY,
      cashUyu: 0,
      cashUsd: 1_000,
      outflows: [{ date: "2026-06-26", currency: "USD", amount: 5_000 }],
      inflows: [],
      fxRate: 40,
    });
    const nextFriday = rows.find((r) => r.date === "2026-06-26")!;
    expect(nextFriday.status).toBe("red");
    expect(nextFriday.statusLabel).toBe("Falta dinero");
    expect(nextFriday.usdNegative).toBe(true);
  });

  it("status naranja cuando balance positivo pero menor que hoy", () => {
    const rows = buildWeeklyCashProjection({
      today: TODAY,
      cashUyu: 0,
      cashUsd: 10_000,
      outflows: [{ date: "2026-06-26", currency: "USD", amount: 3_000 }],
      inflows: [],
      fxRate: 40,
    });
    const nextFriday = rows.find((r) => r.date === "2026-06-26")!;
    expect(nextFriday.status).toBe("orange");
    expect(nextFriday.statusLabel).toBe("Baja caja");
  });

  it("status verde cuando balance mayor o igual que hoy", () => {
    const rows = buildWeeklyCashProjection({
      today: TODAY,
      cashUyu: 0,
      cashUsd: 10_000,
      outflows: [],
      inflows: [{ date: "2026-06-26", currency: "USD", amount: 2_000 }],
      fxRate: 40,
    });
    const nextFriday = rows.find((r) => r.date === "2026-06-26")!;
    expect(nextFriday.status).toBe("green");
    expect(nextFriday.statusLabel).toBe("Mejor que hoy");
  });

  it("flujos en fechas anteriores a hoy no afectan el balance", () => {
    const rows = buildWeeklyCashProjection({
      today: TODAY,
      cashUyu: 0,
      cashUsd: 10_000,
      outflows: [{ date: "2026-06-10", currency: "USD", amount: 5_000 }],
      inflows: [],
      fxRate: 40,
    });
    for (const row of rows) {
      expect(row.usd).toBe(10_000);
    }
  });

  it("flujos exactamente en 'today' no cuentan (ya están en caja)", () => {
    const rows = buildWeeklyCashProjection({
      today: TODAY,
      cashUyu: 0,
      cashUsd: 10_000,
      outflows: [{ date: TODAY, currency: "USD", amount: 2_000 }],
      inflows: [],
      fxRate: 40,
    });
    const todayRow = rows.find((r) => r.isToday)!;
    expect(todayRow.usd).toBe(10_000);
  });

  it("uyuNegative se activa solo cuando UYU es negativo", () => {
    const rows = buildWeeklyCashProjection({
      today: TODAY,
      cashUyu: 1_000,
      cashUsd: 50_000,
      outflows: [{ date: "2026-06-26", currency: "UYU", amount: 5_000 }],
      inflows: [],
      fxRate: 40,
    });
    const nextFriday = rows.find((r) => r.date === "2026-06-26")!;
    expect(nextFriday.uyuNegative).toBe(true);
    expect(nextFriday.usdNegative).toBe(false);
  });

  it("monthEndYmd devuelve último día del mes", () => {
    expect(monthEndYmd("2026-06-10")).toBe("2026-06-30");
    expect(monthEndYmd("2026-02-15")).toBe("2026-02-28");
  });
});
