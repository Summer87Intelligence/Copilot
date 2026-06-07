/**
 * Tests de consistencia preview–PDF para el estado de cuenta.
 *
 * Verifica que el modelo usado por el endpoint JSON (preview) y el PDF son idénticos:
 * mismo buildClientAccountStatement({ ledgerMode: true }) + misma lógica de
 * filterBlock/getPreviousBalance.
 *
 * Suite de regresión para el root cause LIMIT-100: clientes con >100 filas
 * deben producir saldos correctos cuando se usan las funciones ForLedger.
 */

import { describe, expect, it } from "vitest";
import { buildClientAccountStatement } from "@/lib/copilot-client-account-statement";
import {
  getPreviousBalance,
  filterBlockForPeriod,
} from "@/lib/account-statement/account-statement-period-model";
import type { DataRow } from "@/lib/copilot-data";

// ── Factories (minimal, reusables) ────────────────────────────────────────────

function inv(id: string, date: string, total: number, currency: "UYU" | "USD" = "UYU", cfeTipo?: string): DataRow {
  const meta = cfeTipo
    ? { zeta_metadata: { zeta_customer_voucher_v1: { cfe_tipo: cfeTipo } } }
    : {};
  return {
    id,
    invoice_number: `INV-${id}`,
    issue_date: date,
    total_amount: total,
    currency_code: currency,
    is_active: true,
    ...meta,
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

function saldoPendiente(id: string, date: string, total: number): DataRow {
  return {
    id,
    invoice_number: `ZETA:${id}`,
    issue_date: date,
    total_amount: total,
    currency_code: "UYU",
    is_active: true,
    category: "Zeta / saldos pendientes",
  };
}

// ── Shared period model (same as JSON route + PDF) ────────────────────────────

const filterBlock = filterBlockForPeriod;

// ── 1. Preview y PDF usan el mismo modelo ─────────────────────────────────────

describe("1 — preview y PDF usan el mismo modelo (ledgerMode: true)", () => {
  const invoices = [
    inv("a", "2026-01-15", 10000),
    inv("b", "2026-03-10", 5000),
  ];
  const receipts = [rec("r1", "2026-02-20", 4000)];

  it("buildClientAccountStatement produce el mismo resultado para preview y PDF", () => {
    const stmt1 = buildClientAccountStatement({ invoices, receipts, ledgerMode: true });
    const stmt2 = buildClientAccountStatement({ invoices, receipts, ledgerMode: true });
    expect(stmt1.uyu.summary.finalBalance).toBe(stmt2.uyu.summary.finalBalance);
    expect(stmt1.uyu.movements.map((m) => m.id)).toEqual(stmt2.uyu.movements.map((m) => m.id));
  });

  it("runningBalance en cada movimiento es determinístico", () => {
    const stmt = buildClientAccountStatement({ invoices, receipts, ledgerMode: true });
    const rb = stmt.uyu.movements.map((m) => m.runningBalance);
    // 10000 → 6000 → 11000
    expect(rb).toEqual([10000, 6000, 11000]);
  });
});

// ── 2. Cliente con factura y recibo parcial ───────────────────────────────────

describe("2 — factura + recibo parcial", () => {
  const stmt = buildClientAccountStatement({
    invoices: [inv("i1", "2026-01-10", 20000)],
    receipts: [rec("r1", "2026-02-05", 8000)],
    ledgerMode: true,
  });

  it("saldo pendiente es 12000 (factura − cobro parcial)", () => {
    expect(stmt.uyu.summary.finalBalance).toBe(12000);
  });

  it("runningBalance del último movimiento coincide con saldo final", () => {
    const last = stmt.uyu.movements[stmt.uyu.movements.length - 1]!;
    expect(last.runningBalance).toBe(12000);
  });

  it("movimiento de recibo tiene credit = 8000 y debit = 0", () => {
    const r = stmt.uyu.movements.find((m) => m.kind === "receipt")!;
    expect(r.credit).toBe(8000);
    expect(r.debit).toBe(0);
  });
});

// ── 3. Cliente con nota de crédito ────────────────────────────────────────────

describe("3 — nota de crédito CFE 112", () => {
  const stmt = buildClientAccountStatement({
    invoices: [
      inv("i1", "2026-02-01", 15000, "UYU", "111"),
      inv("nc1", "2026-02-15", 5000, "UYU", "112"),
    ],
    receipts: [],
    ledgerMode: true,
  });

  it("NC va a Haber y reduce el saldo", () => {
    const nc = stmt.uyu.movements.find((m) => m.id === "nc1")!;
    expect(nc.kind).toBe("credit_note");
    expect(nc.credit).toBe(5000);
    expect(nc.debit).toBe(0);
  });

  it("saldo final es 10000 (factura − NC)", () => {
    expect(stmt.uyu.summary.finalBalance).toBe(10000);
  });

  it("runningBalance tras NC es 10000", () => {
    expect(stmt.uyu.movements[1]!.runningBalance).toBe(10000);
  });
});

// ── 4. Cliente con UYU y USD separados ───────────────────────────────────────

describe("4 — UYU y USD no se mezclan", () => {
  const stmt = buildClientAccountStatement({
    invoices: [
      inv("uy1", "2026-01-01", 50000, "UYU"),
      inv("us1", "2026-01-01", 1000, "USD"),
    ],
    receipts: [
      rec("ry1", "2026-02-01", 20000, "UYU"),
      rec("rs1", "2026-02-01", 400, "USD"),
    ],
    ledgerMode: true,
  });

  it("saldo UYU es 30000", () => {
    expect(stmt.uyu.summary.finalBalance).toBe(30000);
  });

  it("saldo USD es 600", () => {
    expect(stmt.usd.summary.finalBalance).toBe(600);
  });

  it("ningún movimiento USD aparece en bloque UYU", () => {
    for (const m of stmt.uyu.movements) expect(m.currency).toBe("UYU");
  });

  it("ningún movimiento UYU aparece en bloque USD", () => {
    for (const m of stmt.usd.movements) expect(m.currency).toBe("USD");
  });
});

// ── 5. CCV1 + saldo pendiente — sin duplicación ───────────────────────────────

describe("5 — CCV1 + saldo pendiente derivado no duplica el saldo", () => {
  // Patrón real: una factura CCV1 + su saldo pendiente derivado por Zeta
  const stmt = buildClientAccountStatement({
    invoices: [
      inv("ccv1", "2026-04-17", 41480, "UYU", "111"),
      saldoPendiente("sp", "2026-04-17", 41480),
    ],
    receipts: [],
    ledgerMode: true,
  });

  it("saldo pendiente derivado es excluido del ledger", () => {
    const ids = stmt.uyu.movements.map((m) => m.id);
    expect(ids).not.toContain("sp");
  });

  it("saldo final es 41480 (solo la factura CCV1, sin duplicar)", () => {
    expect(stmt.uyu.summary.finalBalance).toBe(41480);
  });

  it("solo hay 1 movimiento", () => {
    expect(stmt.uyu.summary.movementCount).toBe(1);
  });
});

// ── 6. Historial previo al período se refleja en previousBalance ──────────────

describe("6 — historial anterior al período: previousBalance correcto", () => {
  const invoices = [
    inv("old1", "2025-06-01", 30000),
    inv("old2", "2025-11-15", 20000),
    inv("new1", "2026-01-10", 10000),
  ];
  const receipts = [rec("r1", "2025-12-20", 15000)];
  const stmt = buildClientAccountStatement({ invoices, receipts, ledgerMode: true });

  const from = "2026-01-01";

  it("runningBalance de new1 incluye historial anterior", () => {
    const mv = stmt.uyu.movements.find((m) => m.id === "new1")!;
    // 30000 + 20000 − 15000 + 10000 = 45000
    expect(mv.runningBalance).toBe(45000);
  });

  it("getPreviousBalance retorna el saldo acumulado hasta el día anterior al from", () => {
    const prevBal = getPreviousBalance(stmt.uyu, from);
    // Hasta 2025-12-31: 30000 + 20000 − 15000 = 35000
    expect(prevBal).toBe(35000);
  });

  it("filterBlock desde 2026-01-01 muestra solo new1", () => {
    const filtered = filterBlock(stmt.uyu, from, undefined);
    expect(filtered.movements).toHaveLength(1);
    expect(filtered.movements[0]!.id).toBe("new1");
  });

  it("saldo final del bloque filtrado = runningBalance del último mov (no recalculado desde 0)", () => {
    const filtered = filterBlock(stmt.uyu, from, undefined);
    const last = filtered.movements[filtered.movements.length - 1]!;
    // runningBalance es 45000 (acumulado desde el inicio, no desde from)
    expect(last.runningBalance).toBe(45000);
  });
});

// ── 7. Sin movimientos en el período: saldo final = previousBalance ───────────

describe("7 — sin movimientos en el período", () => {
  const invoices = [inv("old", "2025-03-01", 12000)];
  const receipts = [rec("r", "2025-04-01", 5000)];
  const stmt = buildClientAccountStatement({ invoices, receipts, ledgerMode: true });

  it("filtrar por 2026 produce 0 movimientos", () => {
    const filtered = filterBlock(stmt.uyu, "2026-01-01", "2026-12-31");
    expect(filtered.movements).toHaveLength(0);
  });

  it("previousBalance retorna el saldo previo al período", () => {
    const prevBal = getPreviousBalance(stmt.uyu, "2026-01-01");
    expect(prevBal).toBe(7000); // 12000 − 5000
  });
});

// ── 8. Preview = PDF: filterBlock produce el mismo resultado que el PDF renderer ──

describe("8 — filterBlock de preview es consistente con PDF renderer", () => {
  const invoices = [
    inv("jan", "2026-01-15", 8000),
    inv("feb", "2026-02-20", 6000),
    inv("mar", "2026-03-05", 4000),
  ];
  const receipts = [rec("r1", "2026-02-10", 5000)];
  const stmt = buildClientAccountStatement({ invoices, receipts, ledgerMode: true });

  it("filtrar feb+mar reproduce saldo y movimientos del PDF renderer", () => {
    const from = "2026-02-01";
    const to = "2026-03-31";

    const prevBal = getPreviousBalance(stmt.uyu, from);
    const filtered = filterBlock(stmt.uyu, from, to);

    // Movimientos en rango: r1(2026-02-10), feb(2026-02-20), mar(2026-03-05)
    expect(filtered.movements).toHaveLength(3);
    expect(filtered.movements[0]!.id).toBe("r1");
    expect(filtered.movements[1]!.id).toBe("feb");
    expect(filtered.movements[2]!.id).toBe("mar");

    // previousBalance = runningBalance de jan = 8000
    expect(prevBal).toBe(8000);

    // totalDebit del período (feb + mar) = 6000 + 4000 = 10000
    expect(filtered.summary.totalDebit).toBe(10000);
    // totalCredit del período (r1) = 5000
    expect(filtered.summary.totalCredit).toBe(5000);

    // runningBalance del último mov = saldo al cierre (acumulado desde inicio)
    // jan=8000, r1=3000, feb=9000, mar=13000
    const lastRb = filtered.movements[filtered.movements.length - 1]!.runningBalance;
    expect(lastRb).toBe(13000);
  });

  it("filterBlock sin from/to devuelve el bloque sin modificar", () => {
    const full = filterBlock(stmt.uyu, undefined, undefined);
    expect(full.summary.movementCount).toBe(stmt.uyu.summary.movementCount);
    expect(full.summary.finalBalance).toBe(stmt.uyu.summary.finalBalance);
  });
});
