import { describe, expect, it } from "vitest";

import {
  deriveOperationalSemaphore,
  type OperationalSemaphoreAlert,
} from "@/lib/copilot-operational-semaphore";
import type { TodayBusinessPulse } from "@/lib/copilot-today-business-pulse";
import type { CarteraCurrencyTotals } from "@/lib/copilot-cartera-aging-totals";

// ─── Minimal pulse factory ────────────────────────────────────────────────────

function makePulse(overrides: {
  attentionClients?: number;
  dataWarning?: string | null;
  overdue30?: number;
  safeCash30d?: number;
  scheduledPayments?: number;
  hasConfiguredPayments?: boolean;
}): TodayBusinessPulse {
  const {
    attentionClients = 0,
    dataWarning = null,
    overdue30 = 0,
    safeCash30d = 10_000,
    scheduledPayments = 0,
    hasConfiguredPayments = false,
  } = overrides;

  return {
    clientCounts: {
      activeClients: 5,
      debtorClients: attentionClients,
      attentionClients,
      debtorRows: attentionClients,
    },
    dataWarning,
    currentStateBlocks: [
      {
        currency: "UYU",
        cashAvailable: 10_000,
        collectedAccumulated: 0,
        manualIncome: 0,
        manualExpense: 0,
        pendingReceivables: 0,
        overdue30,
        debtorClients: 0,
      } as unknown as TodayBusinessPulse["currentStateBlocks"][number],
    ],
    projection30dBlocks: [
      {
        currency: "UYU",
        currentCash: 10_000,
        scheduledPayments,
        safeCash30d,
        pendingReceivables: 0,
        expectedCash30d: 10_000,
        hasConfiguredPayments,
        safeCoverageStatus: safeCash30d >= 0 ? "healthy" : "deficit",
      } as unknown as TodayBusinessPulse["projection30dBlocks"][number],
    ],
  } as unknown as TodayBusinessPulse;
}

/** Pulso multi-moneda: bloque UYU + bloque USD con pagos configurados. */
function makePulseMultiCurrency(p: {
  uyuSafeCash30d: number;
  usdSafeCash30d: number;
}): TodayBusinessPulse {
  return {
    clientCounts: { activeClients: 5, debtorClients: 0, attentionClients: 0, debtorRows: 0 },
    dataWarning: null,
    currentStateBlocks: [],
    projection30dBlocks: [
      {
        currency: "UYU",
        currentCash: 472_760,
        scheduledPayments: 189_360,
        safeCash30d: p.uyuSafeCash30d,
        pendingReceivables: 0,
        expectedCash30d: p.uyuSafeCash30d,
        hasConfiguredPayments: true,
        safeCoverageStatus: p.uyuSafeCash30d >= 0 ? "healthy" : "deficit",
      },
      {
        currency: "USD",
        currentCash: 10_000,
        scheduledPayments: 3_900,
        safeCash30d: p.usdSafeCash30d,
        pendingReceivables: 0,
        expectedCash30d: p.usdSafeCash30d,
        hasConfiguredPayments: true,
        safeCoverageStatus: p.usdSafeCash30d >= 0 ? "healthy" : "deficit",
      },
    ],
  } as unknown as TodayBusinessPulse;
}

const NO_ALERTS: OperationalSemaphoreAlert[] = [];

// ─── hasPositiveAmount / overdue detection ────────────────────────────────────

describe("hasPositiveAmount — carteraAgingOverdue no mezcla monedas", () => {
  it("UYU 0, USD 0 → sin overdue", () => {
    const overdue: CarteraCurrencyTotals = { UYU: 0, USD: 0 };
    const pulse = makePulse({ overdue30: 0 });
    const r = deriveOperationalSemaphore({ alerts: NO_ALERTS, pulse, carteraAgingOverdue: overdue });
    expect(r.level).toBe("ok");
  });

  it("UYU > 0, USD 0 → overdue detectado", () => {
    const overdue: CarteraCurrencyTotals = { UYU: 50_000, USD: 0 };
    const pulse = makePulse({ overdue30: 0 });
    const r = deriveOperationalSemaphore({ alerts: NO_ALERTS, pulse, carteraAgingOverdue: overdue });
    expect(r.level).toBe("attention");
  });

  it("UYU 0, USD 1 → overdue detectado sin sumar con UYU", () => {
    const overdue: CarteraCurrencyTotals = { UYU: 0, USD: 1 };
    const pulse = makePulse({ overdue30: 0 });
    const r = deriveOperationalSemaphore({ alerts: NO_ALERTS, pulse, carteraAgingOverdue: overdue });
    // USD 1 es overdue real — level debe ser attention, no ok
    expect(r.level).toBe("attention");
  });

  it("UYU > 0, USD > 0 → overdue detectado", () => {
    const overdue: CarteraCurrencyTotals = { UYU: 100, USD: 100 };
    const pulse = makePulse({ overdue30: 0 });
    const r = deriveOperationalSemaphore({ alerts: NO_ALERTS, pulse, carteraAgingOverdue: overdue });
    expect(r.level).toBe("attention");
  });

  it("undefined → sin overdue", () => {
    const pulse = makePulse({ overdue30: 0 });
    const r = deriveOperationalSemaphore({ alerts: NO_ALERTS, pulse });
    expect(r.level).toBe("ok");
  });
});

// ─── highCount no se infla artificialmente ────────────────────────────────────

describe("highCount no se infla cuando solo hay attentionClients", () => {
  it("3 attentionClients sin alertas altas → highCount = 0", () => {
    const pulse = makePulse({ attentionClients: 3 });
    const r = deriveOperationalSemaphore({ alerts: NO_ALERTS, pulse });
    expect(r.highCount).toBe(0);
    expect(r.level).toBe("attention");
  });

  it("0 attentionClients + 1 alerta alta → highCount = 1", () => {
    const pulse = makePulse({ attentionClients: 0 });
    const alerts: OperationalSemaphoreAlert[] = [
      { id: "a1", title: "Alerta alta real", severity: "high" },
    ];
    const r = deriveOperationalSemaphore({ alerts, pulse });
    expect(r.highCount).toBe(1);
  });

  it("attentionClients aparece en operativeItems como señal operativa, no en highItems", () => {
    const pulse = makePulse({ attentionClients: 2 });
    const r = deriveOperationalSemaphore({ alerts: NO_ALERTS, pulse });
    expect(r.operativeItems.some((i) => i.includes("2"))).toBe(true);
    expect(r.highItems).toHaveLength(0);
    expect(r.highCount).toBe(0);
  });
});

// ─── counterLine honesto ──────────────────────────────────────────────────────

describe("counterLine honesto — sin inflación artificial", () => {
  it("level ok → 'Sin alertas activas'", () => {
    const pulse = makePulse({});
    const r = deriveOperationalSemaphore({ alerts: NO_ALERTS, pulse });
    expect(r.counterLine).toBe("Sin alertas activas");
  });

  it("level attention solo con attentionClients → muestra señales, no altas", () => {
    const pulse = makePulse({ attentionClients: 1 });
    const r = deriveOperationalSemaphore({ alerts: NO_ALERTS, pulse });
    expect(r.level).toBe("attention");
    expect(r.counterLine).not.toContain("1 alta");
    expect(r.counterLine).toContain("señal");
  });

  it("level critical con alertas → muestra críticas · altas · medias", () => {
    const pulse = makePulse({});
    const alerts: OperationalSemaphoreAlert[] = [
      { id: "c1", title: "Caja negativa", severity: "critical" },
      { id: "h1", title: "Cliente con 90d", severity: "high" },
      { id: "m1", title: "Pago próximo", severity: "medium" },
    ];
    const r = deriveOperationalSemaphore({ alerts, pulse });
    expect(r.level).toBe("critical");
    expect(r.counterLine).toContain("1 crítica");
    expect(r.counterLine).toContain("1 alta");
    expect(r.counterLine).toContain("1 media");
  });

  it("mediumCount incluido en counterLine sin duplicar", () => {
    const pulse = makePulse({});
    const alerts: OperationalSemaphoreAlert[] = [
      { id: "c1", title: "Deficit", severity: "critical" },
      { id: "m1", title: "Media 1", severity: "medium" },
      { id: "m2", title: "Media 2", severity: "medium" },
    ];
    const r = deriveOperationalSemaphore({ alerts, pulse });
    expect(r.mediumCount).toBe(2);
    expect(r.counterLine).toContain("2 medias");
    // No debe aparecer dos veces
    const parts = r.counterLine.split("2 medias");
    expect(parts.length).toBe(2);
  });
});

// ─── nivel crítico por cashDeficit ───────────────────────────────────────────

describe("cashDeficit → nivel critical", () => {
  it("safeCash30d < 0 + hasConfiguredPayments → critical (solo UYU, consolidado negativo)", () => {
    const pulse = makePulse({ safeCash30d: -1_000, hasConfiguredPayments: true, scheduledPayments: 5_000 });
    const r = deriveOperationalSemaphore({ alerts: NO_ALERTS, pulse });
    expect(r.level).toBe("critical");
    expect(r.criticalItems).toContain("Caja proyectada en negativo");
  });

  it("safeCash30d < 0 pero sin pagos configurados → no critical", () => {
    const pulse = makePulse({ safeCash30d: -1_000, hasConfiguredPayments: false });
    const r = deriveOperationalSemaphore({ alerts: NO_ALERTS, pulse });
    expect(r.level).toBe("ok");
  });

  it("UYU negativo pero USD cubre → attention, no critical (consolidado positivo)", () => {
    // UYU safeCash30d: -7.000 ≡ -175 USD @ tasa 40
    // USD safeCash30d: +6.100
    // Consolidado: 6.100 - 175 = +5.925 USD → positivo → no crítico
    const pulse = makePulseMultiCurrency({ uyuSafeCash30d: -7_000, usdSafeCash30d: 6_100 });
    const r = deriveOperationalSemaphore({ alerts: NO_ALERTS, pulse });
    expect(r.level).toBe("attention");
    expect(r.criticalItems).not.toContain("Caja proyectada en negativo");
    expect(r.operativeItems).toContain("Caja consolidada cubierta en USD equivalente");
    expect(r.primaryReason).toBe("Caja consolidada cubierta en USD equivalente.");
  });

  it("UYU negativo y USD negativo → critical (consolidado negativo)", () => {
    const pulse = makePulseMultiCurrency({ uyuSafeCash30d: -200_000, usdSafeCash30d: -500 });
    const r = deriveOperationalSemaphore({ alerts: NO_ALERTS, pulse });
    expect(r.level).toBe("critical");
    expect(r.criticalItems).toContain("Caja proyectada en negativo");
  });

  it("primaryReason crítico no contiene 'riesgo operativo'", () => {
    const pulse = makePulse({ safeCash30d: -1_000, hasConfiguredPayments: true, scheduledPayments: 5_000 });
    const r = deriveOperationalSemaphore({ alerts: NO_ALERTS, pulse });
    expect(r.primaryReason).not.toContain("riesgo operativo");
    expect(r.primaryReason).toContain("Déficit de caja");
  });
});

// ─── nivel attention por dataPending ─────────────────────────────────────────

describe("dataPending → nivel attention", () => {
  it("dataWarning string → attention con señal en operativeItems", () => {
    const pulse = makePulse({ dataWarning: "Datos parciales" });
    const r = deriveOperationalSemaphore({ alerts: NO_ALERTS, pulse });
    expect(r.level).toBe("attention");
    expect(r.operativeItems).toContain("Datos secundarios pendientes de actualización");
    expect(r.mediumItems).not.toContain("Datos secundarios pendientes de actualización");
  });

  it("dataWarning null → ok", () => {
    const pulse = makePulse({ dataWarning: null });
    const r = deriveOperationalSemaphore({ alerts: NO_ALERTS, pulse });
    expect(r.level).toBe("ok");
  });
});
