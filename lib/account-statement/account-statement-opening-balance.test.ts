/**
 * Tests: opening balance (saldo anterior) en estado de cuenta.
 *
 * Escenario real documentado: Estudio Fletcher SAS UYU, período 01/01/26–31/12/26.
 *   Zeta PDF: saldo anterior -700, saldo final 28.580
 *   Copilot sin fix: saldo anterior 0, saldo final 29.280
 *   Causa: proto_receipts no tenía recibos pre-2026 (fuera de cobertura de sync).
 *   Fix: ledger_opening_balance_uyu = -700 en proto_companies → openingBalanceUyu = -700.
 */

import { describe, expect, it } from "vitest";
import { buildClientAccountStatement } from "@/lib/copilot-client-account-statement";
import { getPreviousBalance } from "@/lib/account-statement/account-statement-period-model";
import type { DataRow } from "@/lib/copilot-data";

// ── Factories ─────────────────────────────────────────────────────────────────

function inv(id: string, date: string, total: number, currency: "UYU" | "USD" = "UYU"): DataRow {
  return {
    id,
    invoice_number: `INV-${id}`,
    issue_date: date,
    total_amount: total,
    currency_code: currency,
    is_active: true,
  };
}

function rec(id: string, date: string, amount: number, currency: "UYU" | "USD" = "UYU"): DataRow {
  return {
    id,
    receipt_number: `REC-${id}`,
    receipt_date: date,
    amount,
    currency_code: currency,
    is_active: true,
  };
}

// getPreviousBalance imported from account-statement-period-model.ts

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("openingBalance — saldo anterior negativo (crédito preexistente)", () => {
  // Estudio Fletcher scenario: -700 UYU credit before period, 29.280 net in period
  const invoices = [inv("a", "2026-01-15", 29280)];
  const receipts: DataRow[] = [];
  const stmt = buildClientAccountStatement({
    invoices,
    receipts,
    ledgerMode: true,
    openingBalanceUyu: -700,
  });

  it("baselineBalance is propagated to the UYU block", () => {
    expect(stmt.uyu.baselineBalance).toBe(-700);
  });

  it("first movement runningBalance starts from baseline", () => {
    expect(stmt.uyu.movements[0].runningBalance).toBe(-700 + 29280); // 28580
  });

  it("summary.finalBalance includes baseline", () => {
    expect(stmt.uyu.summary.finalBalance).toBe(28580);
  });

  it("getPreviousBalance returns baseline when from is before all movements", () => {
    expect(getPreviousBalance(stmt.uyu, "2026-01-01")).toBe(-700);
  });

  it("getPreviousBalance returns last pre-period runningBalance when movements exist before from", () => {
    // Add a pre-period invoice to verify last.runningBalance is used (not baseline)
    const invPre = inv("pre", "2025-12-20", 500);
    const stmtWithPre = buildClientAccountStatement({
      invoices: [invPre, invoices[0]],
      receipts: [],
      ledgerMode: true,
      openingBalanceUyu: -700,
    });
    // pre-period invoice: running = -700 + 500 = -200
    expect(getPreviousBalance(stmtWithPre.uyu, "2026-01-01")).toBe(-200);
  });

  it("summary.pendingBalance coincide con finalBalance", () => {
    expect(stmt.uyu.summary.pendingBalance).toBe(stmt.uyu.summary.finalBalance);
  });

  it("USD block is unaffected (no USD opening balance)", () => {
    expect(stmt.usd.baselineBalance).toBe(0);
    expect(stmt.usd.movements).toHaveLength(0);
  });
});

describe("openingBalance — saldo anterior positivo (deuda preexistente)", () => {
  const invoices = [inv("x", "2026-03-01", 1000)];
  const stmt = buildClientAccountStatement({
    invoices,
    receipts: [],
    ledgerMode: true,
    openingBalanceUyu: 500,
  });

  it("baselineBalance is 500", () => {
    expect(stmt.uyu.baselineBalance).toBe(500);
  });

  it("first movement runningBalance = 500 + 1000 = 1500", () => {
    expect(stmt.uyu.movements[0].runningBalance).toBe(1500);
  });

  it("getPreviousBalance returns 500 when from is before all movements", () => {
    expect(getPreviousBalance(stmt.uyu, "2026-01-01")).toBe(500);
  });

  it("finalBalance is 1500", () => {
    expect(stmt.uyu.summary.finalBalance).toBe(1500);
  });
});

describe("openingBalance — sin saldo anterior (cero, default)", () => {
  const stmt = buildClientAccountStatement({
    invoices: [inv("y", "2026-02-01", 300)],
    receipts: [rec("z", "2026-02-15", 100)],
    ledgerMode: true,
  });

  it("baselineBalance defaults to 0", () => {
    expect(stmt.uyu.baselineBalance).toBe(0);
  });

  it("running balance starts from 0", () => {
    const mvs = stmt.uyu.movements;
    const invoiceMv = mvs.find((m) => m.kind === "invoice")!;
    expect(invoiceMv.runningBalance).toBe(300);
  });

  it("getPreviousBalance returns 0 when no pre-period movements and baseline=0", () => {
    expect(getPreviousBalance(stmt.uyu, "2026-01-01")).toBe(0);
  });
});

describe("openingBalance — openingBalanceUyu null / undefined treated as 0", () => {
  it("null is treated as 0", () => {
    const stmt = buildClientAccountStatement({
      invoices: [inv("a", "2026-01-01", 100)],
      receipts: [],
      ledgerMode: true,
      openingBalanceUyu: null,
    });
    expect(stmt.uyu.baselineBalance).toBe(0);
    expect(stmt.uyu.movements[0].runningBalance).toBe(100);
  });

  it("undefined is treated as 0", () => {
    const stmt = buildClientAccountStatement({
      invoices: [inv("a", "2026-01-01", 100)],
      receipts: [],
      ledgerMode: true,
      openingBalanceUyu: undefined,
    });
    expect(stmt.uyu.baselineBalance).toBe(0);
  });
});

describe("openingBalance — USD independiente de UYU", () => {
  const stmt = buildClientAccountStatement({
    invoices: [
      inv("u1", "2026-01-10", 200, "UYU"),
      inv("d1", "2026-01-10", 100, "USD"),
    ],
    receipts: [],
    ledgerMode: true,
    openingBalanceUyu: -50,
    openingBalanceUsd: 30,
  });

  it("UYU baseline is -50", () => {
    expect(stmt.uyu.baselineBalance).toBe(-50);
  });

  it("USD baseline is 30", () => {
    expect(stmt.usd.baselineBalance).toBe(30);
  });

  it("UYU running balance = -50 + 200 = 150", () => {
    expect(stmt.uyu.movements[0].runningBalance).toBe(150);
  });

  it("USD running balance = 30 + 100 = 130", () => {
    expect(stmt.usd.movements[0].runningBalance).toBe(130);
  });

  it("UYU finalBalance = 150", () => {
    expect(stmt.uyu.summary.finalBalance).toBe(150);
  });

  it("USD finalBalance = 130", () => {
    expect(stmt.usd.summary.finalBalance).toBe(130);
  });
});

describe("openingBalance — período vacío (sin movimientos en el período)", () => {
  // Client had a -700 credit but no invoices/receipts in 2026
  const stmt = buildClientAccountStatement({
    invoices: [],
    receipts: [],
    ledgerMode: true,
    openingBalanceUyu: -700,
  });

  it("baselineBalance is preserved even with no movements", () => {
    expect(stmt.uyu.baselineBalance).toBe(-700);
  });

  it("finalBalance = -700 when no movements", () => {
    expect(stmt.uyu.summary.finalBalance).toBe(-700);
  });

  it("getPreviousBalance returns baseline when there are no movements at all", () => {
    expect(getPreviousBalance(stmt.uyu, "2026-01-01")).toBe(-700);
  });

  it("hasNegativeBalance is true", () => {
    expect(stmt.uyu.summary.hasNegativeBalance).toBe(true);
  });
});

describe("openingBalance — preview = PDF (consistencia de modelo)", () => {
  // Verifica que la lógica de getPreviousBalance es idéntica en preview y PDF.
  const invoices = [
    inv("i1", "2025-06-01", 1000),  // pre-period
    inv("i2", "2026-01-15", 5000),  // in-period
    inv("i3", "2026-03-10", 3000),  // in-period
  ];
  const receipts = [
    rec("r1", "2025-12-15", 800),   // pre-period
    rec("r2", "2026-02-01", 2000),  // in-period
  ];

  const stmt = buildClientAccountStatement({
    invoices,
    receipts,
    ledgerMode: true,
    openingBalanceUyu: -100,
  });

  it("saldo anterior al 2026-01-01 = baseline + pre-period net = -100 + 1000 - 800 = 100", () => {
    expect(getPreviousBalance(stmt.uyu, "2026-01-01")).toBe(100);
  });

  it("último movimiento del período tiene runningBalance = previousBalance + period_net", () => {
    const prevBal = getPreviousBalance(stmt.uyu, "2026-01-01");
    const inPeriod = stmt.uyu.movements.filter((m) => m.date >= "2026-01-01");
    const periodNet = inPeriod.reduce((s, m) => s + m.debit - m.credit, 0);
    const lastMv = inPeriod[inPeriod.length - 1];
    expect(lastMv.runningBalance).toBe(prevBal + periodNet);
  });

  it("modelo es determinista — segunda llamada produce el mismo resultado", () => {
    const stmt2 = buildClientAccountStatement({
      invoices,
      receipts,
      ledgerMode: true,
      openingBalanceUyu: -100,
    });
    expect(getPreviousBalance(stmt2.uyu, "2026-01-01")).toBe(
      getPreviousBalance(stmt.uyu, "2026-01-01")
    );
  });
});

describe("openingBalance — individual = masivo (misma lógica de modelo)", () => {
  // Simula que el PDF individual y el PDF masivo usan el mismo buildClientAccountStatement
  const invoices = [inv("m1", "2026-04-01", 8000)];
  const receipts = [rec("m2", "2026-04-20", 3000)];
  const openingBalanceUyu = -400;

  const individual = buildClientAccountStatement({
    invoices, receipts, ledgerMode: true, openingBalanceUyu,
  });
  const masivo = buildClientAccountStatement({
    invoices, receipts, ledgerMode: true, openingBalanceUyu,
  });

  it("baselineBalance coincide", () => {
    expect(individual.uyu.baselineBalance).toBe(masivo.uyu.baselineBalance);
  });

  it("finalBalance coincide", () => {
    expect(individual.uyu.summary.finalBalance).toBe(masivo.uyu.summary.finalBalance);
  });

  it("runningBalance del último movimiento coincide", () => {
    const lastIndividual = individual.uyu.movements[individual.uyu.movements.length - 1];
    const lastMasivo = masivo.uyu.movements[masivo.uyu.movements.length - 1];
    expect(lastIndividual.runningBalance).toBe(lastMasivo.runningBalance);
  });
});

// ── Casos reales del backfill ─────────────────────────────────────────────────

describe("Caso real — Estudio Fletcher SAS UYU (backfill -700)", () => {
  // Zeta PDF 2026: saldo anterior -700, saldo final 28.580
  // Copilot SIN fix: saldo anterior 0, saldo final 29.280  (diferencia 700)
  // Copilot CON fix: saldo anterior -700, saldo final 28.580 ✓
  //
  // Hipótesis: neto del período = 29.280 (sin considerar el crédito previo).
  // Con opening = -700: runningBalance final = -700 + 29280 = 28580.
  const PERIOD_NET = 29280;

  it("sin opening balance: saldo anterior = 0, saldo final = 29280 (incorrecto)", () => {
    const stmt = buildClientAccountStatement({
      invoices: [inv("f1", "2026-01-15", PERIOD_NET)],
      receipts: [],
      ledgerMode: true,
    });
    expect(getPreviousBalance(stmt.uyu, "2026-01-01")).toBe(0);
    expect(stmt.uyu.summary.finalBalance).toBe(29280);
  });

  it("CON opening balance -700: saldo anterior = -700, saldo final = 28580 ✓", () => {
    const stmt = buildClientAccountStatement({
      invoices: [inv("f1", "2026-01-15", PERIOD_NET)],
      receipts: [],
      ledgerMode: true,
      openingBalanceUyu: -700,
    });
    expect(getPreviousBalance(stmt.uyu, "2026-01-01")).toBe(-700);
    expect(stmt.uyu.summary.finalBalance).toBe(28580);
  });

  it("diferencia antes/después = 700 (el importe del opening balance)", () => {
    const before = buildClientAccountStatement({
      invoices: [inv("f1", "2026-01-15", PERIOD_NET)],
      receipts: [],
      ledgerMode: true,
    });
    const after = buildClientAccountStatement({
      invoices: [inv("f1", "2026-01-15", PERIOD_NET)],
      receipts: [],
      ledgerMode: true,
      openingBalanceUyu: -700,
    });
    expect(before.uyu.summary.finalBalance - after.uyu.summary.finalBalance).toBe(700);
  });
});

describe("Caso real — ACQUAGARDEN USD (backfill 30.35)", () => {
  // Zeta PDF: opening USD 30.35, saldo final 29.26
  // Período: neto = 29.26 - 30.35 = -1.09 (recibos > facturas en 1.09 USD)
  // Con opening = 30.35: runningBalance final = 30.35 - 1.09 = 29.26
  const PERIOD_RECEIPT = 1.09;

  it("CON opening balance 30.35 y recibo 1.09: saldo final = 29.26 ✓", () => {
    const stmt = buildClientAccountStatement({
      invoices: [],
      receipts: [rec("r1", "2026-01-20", PERIOD_RECEIPT, "USD")],
      ledgerMode: true,
      openingBalanceUsd: 30.35,
    });
    expect(getPreviousBalance(stmt.usd, "2026-01-01")).toBe(30.35);
    expect(stmt.usd.summary.finalBalance).toBe(29.26);
  });

  it("UYU no afectado (ACQUAGARDEN solo tiene opening en USD)", () => {
    const stmt = buildClientAccountStatement({
      invoices: [],
      receipts: [rec("r1", "2026-01-20", PERIOD_RECEIPT, "USD")],
      ledgerMode: true,
      openingBalanceUsd: 30.35,
    });
    expect(stmt.uyu.baselineBalance).toBe(0);
    expect(stmt.uyu.summary.finalBalance).toBe(0);
  });
});

describe("Casos reales — otros clientes del backfill UYU", () => {
  it("ALKITODO: opening 14640, período net 1000 → final 15640", () => {
    const stmt = buildClientAccountStatement({
      invoices: [inv("a", "2026-02-01", 1000)],
      receipts: [],
      ledgerMode: true,
      openingBalanceUyu: 14640,
    });
    expect(getPreviousBalance(stmt.uyu, "2026-01-01")).toBe(14640);
    expect(stmt.uyu.summary.finalBalance).toBe(15640);
  });

  it("Botica del Señor SRL: opening -20 (crédito), período net 5000 → final 4980", () => {
    const stmt = buildClientAccountStatement({
      invoices: [inv("b", "2026-03-01", 5000)],
      receipts: [],
      ledgerMode: true,
      openingBalanceUyu: -20,
    });
    expect(getPreviousBalance(stmt.uyu, "2026-01-01")).toBe(-20);
    expect(stmt.uyu.summary.finalBalance).toBe(4980);
  });

  it("Atántico Solution USD: opening -122 (crédito), período net 500 → final 378", () => {
    const stmt = buildClientAccountStatement({
      invoices: [inv("c", "2026-04-01", 500, "USD")],
      receipts: [],
      ledgerMode: true,
      openingBalanceUsd: -122,
    });
    expect(getPreviousBalance(stmt.usd, "2026-01-01")).toBe(-122);
    expect(stmt.usd.summary.finalBalance).toBe(378);
  });

  it("DOBSURA CORPORATION SA USD: opening -298.90 (crédito), período net 100 → final -198.90", () => {
    const stmt = buildClientAccountStatement({
      invoices: [inv("d", "2026-05-01", 100, "USD")],
      receipts: [],
      ledgerMode: true,
      openingBalanceUsd: -298.90,
    });
    expect(getPreviousBalance(stmt.usd, "2026-01-01")).toBe(-298.90);
    expect(stmt.usd.summary.finalBalance).toBe(-198.90);
  });
});
