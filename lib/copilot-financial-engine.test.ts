import { describe, expect, it } from "vitest";

import {
  buildFinancialSnapshotFromRows,
  getFinancialRisks,
  type FinancialEngineSnapshotRows,
} from "@/lib/copilot-financial-engine";

const TODAY = "2025-06-15";

function emptyRows(): FinancialEngineSnapshotRows {
  return {
    receipts: [],
    payments: [],
    invoices: [],
    taxObligations: [],
    taxPayments: [],
  };
}

describe("buildFinancialSnapshotFromRows", () => {
  it("con datasets vacíos devuelve caja y flujos en cero y cobertura 999 si no hay egresos", () => {
    const s = buildFinancialSnapshotFromRows(emptyRows(), TODAY);
    expect(s.available_cash).toBe(0);
    expect(s.expected_inflows).toBe(0);
    expect(s.expected_outflows).toBe(0);
    expect(s.projected_balance).toBe(0);
    expect(s.coverage_ratio).toBe(999);
    expect(s.risk_level).toBe("low");
  });

  it("calcula caja como recibos positivos menos todos los pagos operativos", () => {
    const rows: FinancialEngineSnapshotRows = {
      ...emptyRows(),
      receipts: [{ amount: 10_000 }, { amount: -50 }, { amount: 0 }],
      payments: [{ amount: 3_000, payment_date: "2025-01-01" }],
    };
    const s = buildFinancialSnapshotFromRows(rows, TODAY);
    expect(s.available_cash).toBe(7000);
  });

  it("suma cobranza esperada como balance × probabilidad normalizada en facturas abiertas", () => {
    const rows: FinancialEngineSnapshotRows = {
      ...emptyRows(),
      invoices: [
        { balance_amount: 1000, collection_probability: 50 },
        { balance_amount: 500, collection_probability: null },
        { balance_amount: 0, collection_probability: 1 },
      ],
    };
    const s = buildFinancialSnapshotFromRows(rows, TODAY);
    expect(s.expected_inflows).toBeCloseTo(800, 5);
  });

  it("solo cuenta pagos futuros (fecha estrictamente posterior a hoy)", () => {
    const rows: FinancialEngineSnapshotRows = {
      ...emptyRows(),
      payments: [
        { amount: 100, payment_date: TODAY },
        { amount: 200, payment_date: "2025-06-16" },
        { amount: 50, payment_date: "2025-06-14" },
      ],
    };
    const s = buildFinancialSnapshotFromRows(rows, TODAY);
    expect(s.expected_outflows).toBe(200);
  });

  it("incluye obligaciones fiscales no pagadas con vencimiento dentro del horizonte y resta pagos paid vinculados", () => {
    const rows: FinancialEngineSnapshotRows = {
      ...emptyRows(),
      taxObligations: [
        {
          id: "o1",
          due_date: "2025-07-01",
          estimated_amount: 1000,
          status: "pending",
        },
        {
          id: "o2",
          due_date: "2025-08-20",
          estimated_amount: 500,
          status: "pending",
        },
      ],
      taxPayments: [
        { obligation_id: "o1", amount: 400, status: "paid" },
        { obligation_id: "o1", amount: 999, status: "scheduled" },
      ],
    };
    const s = buildFinancialSnapshotFromRows(rows, TODAY);
    expect(s.expected_outflows).toBe(600);
  });

  it("no suma obligaciones marcadas como paid ni vencidas fuera de horizonte+30", () => {
    const rows: FinancialEngineSnapshotRows = {
      ...emptyRows(),
      taxObligations: [
        {
          id: "a",
          due_date: "2025-07-20",
          estimated_amount: 300,
          status: "paid",
        },
        {
          id: "b",
          due_date: "2025-08-01",
          estimated_amount: 1000,
          status: "pending",
        },
      ],
      taxPayments: [],
    };
    const s = buildFinancialSnapshotFromRows(rows, TODAY);
    expect(s.expected_outflows).toBe(0);
  });

  it("proyecta balance = caja + cobranzas esperadas - egresos y marca riesgo crítico con cobertura baja", () => {
    const rows: FinancialEngineSnapshotRows = {
      receipts: [{ amount: 100 }],
      payments: [{ amount: 0, payment_date: "2025-07-01" }],
      invoices: [{ balance_amount: 0, collection_probability: 1 }],
      taxObligations: [
        {
          id: "t1",
          due_date: "2025-06-20",
          estimated_amount: 1000,
          status: "overdue",
        },
      ],
      taxPayments: [],
    };
    const s = buildFinancialSnapshotFromRows(rows, TODAY);
    expect(s.projected_balance).toBe(100 - 1000);
    expect(s.risk_level).toBe("critical");
    expect(s.coverage_ratio).toBeLessThan(0.5);
  });
});

describe("getFinancialRisks", () => {
  it("agrega señal de desbalance cuando cobertura < 1 y hay egresos", () => {
    const signals = getFinancialRisks({
      available_cash: 100,
      expected_inflows: 100,
      expected_outflows: 500,
      projected_balance: -300,
      coverage_ratio: 0.4,
      risk_level: "critical",
    });
    expect(signals.some((m) => m.includes("egresos esperados"))).toBe(true);
    expect(signals.some((m) => m.includes("Balance proyectado negativo"))).toBe(
      true
    );
    expect(signals.some((m) => m.includes("crítico"))).toBe(true);
  });

  it("sin egresos no advierte por cobertura aunque ratio sea bajo en número", () => {
    const signals = getFinancialRisks({
      available_cash: 0,
      expected_inflows: 0,
      expected_outflows: 0,
      projected_balance: 0,
      coverage_ratio: 999,
      risk_level: "low",
    });
    expect(signals.filter((m) => m.includes("egresos esperados"))).toHaveLength(
      0
    );
  });

  it("riesgo high sin critical incluye aviso de liquidez alto", () => {
    const signals = getFinancialRisks({
      available_cash: 1000,
      expected_inflows: 0,
      expected_outflows: 2000,
      projected_balance: -1000,
      coverage_ratio: 0.55,
      risk_level: "high",
    });
    expect(signals.some((m) => m.includes("alto"))).toBe(true);
    expect(signals.some((m) => m.includes("crítico"))).toBe(false);
  });
});
