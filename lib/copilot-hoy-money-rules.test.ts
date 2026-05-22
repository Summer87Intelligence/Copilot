import { describe, expect, it } from "vitest";

import {
  auditHoyMoneyFieldSources,
  formatHoyMoneySourcesAuditReport,
  HOY_COLLECTION_SYNC_BEHAVIOR,
} from "@/lib/copilot-hoy-money-rules";
import { buildTodayBusinessPulse, type BusinessPulseGate } from "@/lib/copilot-today-business-pulse";
import {
  groupDebtorRowsByCurrency,
  topDebtorRowsPerCurrency,
} from "@/lib/copilot-hoy-cockpit-view";

const gate: BusinessPulseGate = {
  confidence: "high",
  coverage: "full",
  recommendations_enabled: true,
};

describe("auditHoyMoneyFieldSources", () => {
  it("confirma que Dinero disponible y Por cobrar usan campos distintos", () => {
    const pulse = buildTodayBusinessPulse({
      snapshot: null,
      portfolioRows: [
        {
          company_id: "1",
          name: "Cliente UYU",
          debt_uyu: 78_443,
          debt_usd: 0,
          overdue_debt: 10_000,
          risk: "Alto",
        },
        {
          company_id: "2",
          name: "Cliente USD",
          debt_uyu: 0,
          debt_usd: 5_432,
          overdue_debt: 0,
          risk: "Medio",
        },
      ] as never,
      gate,
      treasuryCashPositions: [
        {
          currency: "UYU",
          availableCash: 120_000,
          currentCash: 120_000,
          collectedFromClients: 100_000,
          manualIncome: 20_000,
          manualExpense: 0,
          adjustments: 0,
          transfersNet: 0,
          openingConfigured: false,
          openingBalance: 0,
          movementsCount: 2,
          lastMovement: null,
        },
        {
          currency: "USD",
          availableCash: 3_000,
          currentCash: 3_000,
          collectedFromClients: 3_000,
          manualIncome: 0,
          manualExpense: 0,
          adjustments: 0,
          transfersNet: 0,
          openingConfigured: false,
          openingBalance: 0,
          movementsCount: 1,
          lastMovement: null,
        },
      ],
    });

    const audit = auditHoyMoneyFieldSources(pulse);
    expect(audit.ok).toBe(true);
    expect(audit.violations).toHaveLength(0);

    const cashRow = audit.rows.find((r) => r.metric === "Dinero disponible");
    const recvRow = audit.rows.find((r) => r.metric === "Por cobrar");
    expect(cashRow?.uyu).toBe(120_000);
    expect(recvRow?.uyu).toBe(78_443);
    expect(cashRow?.includesReceivablesInCash).toBe(false);
    expect(cashRow?.uyu).not.toBe(recvRow?.uyu);

    const uyuProj = pulse.projection30dBlocks.find((b) => b.currency === "UYU");
    const uyuState = pulse.currentStateBlocks.find((b) => b.currency === "UYU");
    if (uyuProj?.hasConfiguredPayments && uyuState) {
      expect(uyuProj.safeCash30d).toBe(uyuState.cashAvailable - uyuProj.scheduledPayments);
    }

    const report = formatHoyMoneySourcesAuditReport(audit);
    expect(report).toContain("Dinero disponible");
    expect(report).toContain("Por cobrar");
    expect(HOY_COLLECTION_SYNC_BEHAVIOR.length).toBeGreaterThan(0);
  });
});

describe("receivables drawer grouping", () => {
  it("agrupa deudores por moneda UYU primero, USD después", () => {
    const rows = [
      {
        row_id: "usd-1",
        company_id: "u1",
        name: "USD Client",
        currency: "USD" as const,
        deuda: { currency: "USD" as const, amount: 1000, formatted: "USD U$S 1.000" },
        vencido: null,
        antiguedad: "",
        motivo: "",
        riesgo: "Medio" as const,
        accion: "",
        deepLink: "/x",
        flags: { hasOverdue: false, slowCollection: false, critical30Share: false },
      },
      {
        row_id: "uyu-1",
        company_id: "y1",
        name: "UYU Client",
        currency: "UYU" as const,
        deuda: { currency: "UYU" as const, amount: 2000, formatted: "UYU $ 2.000" },
        vencido: null,
        antiguedad: "",
        motivo: "",
        riesgo: "Alto" as const,
        accion: "",
        deepLink: "/x",
        flags: { hasOverdue: true, slowCollection: false, critical30Share: true },
      },
    ];
    const grouped = groupDebtorRowsByCurrency(rows);
    expect(grouped.map((g) => g.currency)).toEqual(["UYU", "USD"]);
    expect(grouped[0]?.rows[0]?.name).toBe("UYU Client");

    const top = topDebtorRowsPerCurrency(rows, 1);
    expect(top).toHaveLength(2);
    expect(top[0]?.currency).toBe("UYU");
    expect(top[1]?.currency).toBe("USD");
  });
});
