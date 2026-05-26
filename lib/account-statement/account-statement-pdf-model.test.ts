/**
 * Tests del modelo de estado de cuenta orientados al PDF:
 * running balance, saldo anterior, saldo final, separación de monedas,
 * fixture El País S.A. con datos de producción (saldos pendientes + NC A391).
 */
import { describe, expect, it } from "vitest";

import {
  buildClientAccountStatement,
} from "@/lib/copilot-client-account-statement";
import { extractSerieNumero } from "./extract-serie-numero";
import type { DataRow } from "@/lib/copilot-data";

// ── Factories ─────────────────────────────────────────────────────────────────

function invoice(opts: {
  id: string;
  number?: string;
  date: string;
  total: number;
  currency?: "UYU" | "USD";
  category?: string;
  cfeTipo?: string | number;
  /** serie + numero para metadata CCV1 (e.g. serie:"A", numero:"2934") */
  serie?: string;
  numero?: string;
  /** primer ítem del comprobante para Lineas[0].Descripcion */
  linea?: string;
}): DataRow {
  const hasCcv1 = opts.cfeTipo != null || opts.serie != null || opts.numero != null || opts.linea != null;
  const lineas = opts.linea != null ? [{ Descripcion: opts.linea }] : undefined;
  const ccv1: Record<string, unknown> = {};
  if (opts.cfeTipo != null) ccv1.cfe_tipo = String(opts.cfeTipo);
  if (opts.serie != null) ccv1.serie = opts.serie;
  if (opts.numero != null) ccv1.numero = opts.numero;
  if (lineas) ccv1.raw_payload = { Lineas: lineas };
  const meta: Record<string, unknown> | undefined = hasCcv1
    ? { zeta_customer_voucher_v1: ccv1 }
    : undefined;
  return {
    id: opts.id,
    invoice_number: opts.number ?? `INV-${opts.id}`,
    issue_date: opts.date,
    total_amount: opts.total,
    currency_code: opts.currency ?? "UYU",
    is_active: true,
    ...(opts.category !== undefined ? { category: opts.category } : {}),
    ...(meta !== undefined ? { zeta_metadata: meta } : {}),
  };
}

function receipt(opts: {
  id: string;
  number?: string;
  date: string;
  amount: number;
  currency?: "UYU" | "USD";
  /** Número real del recibo visible en Zeta (e.g. "A-768") */
  reference?: string;
  paymentMethod?: string;
}): DataRow {
  return {
    id: opts.id,
    receipt_number: opts.number ?? `REC-${opts.id}`,
    receipt_date: opts.date,
    amount: opts.amount,
    currency_code: opts.currency ?? "UYU",
    is_active: true,
    ...(opts.reference !== undefined ? { reference: opts.reference } : {}),
    ...(opts.paymentMethod !== undefined ? { payment_method: opts.paymentMethod } : {}),
  };
}

// ── Fixture El País S.A. — datos de producción ────────────────────────────────
//
// Situación real en proto_invoices / proto_receipts:
//
//   ZETA:CCV1:0:36:A:2821  13/03/26  CFE 101  Venta Crédito   17.080  → Debe
//   ZETA:CCV1:0:36:A:2877  17/04/26  CFE 101  Venta Crédito   41.480  → Debe
//   ZETA:2574              17/04/26  —        saldos pendientes 41.480 → EXCLUIR
//   ZETA:CCV1:0:36:A:2932  07/05/26  CFE 101  Venta Crédito    8.662  → Debe
//   ZETA:CCV1:0:36:A:2934  08/05/26  CFE 101  Venta Crédito    8.662  → Debe
//   ZETA:2674              08/05/26  —        saldos pendientes  8.662 → EXCLUIR
//   ZETA:CCV1:0:36:A:391   08/05/26  CFE 181  Nota de Crédito  8.662  → Haber
//   A768                   20/05/26  Recibo   Recibo de Cobro 41.480  → Haber
//
// Saldo final esperado: 17.080 + 41.480 + 8.662 + 8.662 − 8.662 − 41.480 = 25.742

const EL_PAIS_INVOICES = [
  invoice({ id: "i1", number: "ZETA:CCV1:0:36:A:2821", date: "2026-03-13", total: 17080, cfeTipo: "101" }),
  invoice({ id: "i2", number: "ZETA:CCV1:0:36:A:2877", date: "2026-04-17", total: 41480, cfeTipo: "101" }),
  // saldo pendiente derivado — debe excluirse
  invoice({ id: "sp1", number: "ZETA:2574",             date: "2026-04-17", total: 41480, category: "Zeta / saldos pendientes" }),
  invoice({ id: "i3", number: "ZETA:CCV1:0:36:A:2932", date: "2026-05-07", total: 8662,  cfeTipo: "101" }),
  invoice({ id: "i4", number: "ZETA:CCV1:0:36:A:2934", date: "2026-05-08", total: 8662,  cfeTipo: "101" }),
  // saldo pendiente derivado — debe excluirse
  invoice({ id: "sp2", number: "ZETA:2674",             date: "2026-05-08", total: 8662,  category: "Zeta / saldos pendientes" }),
  // nota de crédito CFE 181 — debe ir a Haber
  invoice({ id: "nc1", number: "ZETA:CCV1:0:36:A:391",  date: "2026-05-08", total: 8662,  cfeTipo: "181" }),
];

const EL_PAIS_RECEIPTS = [
  // receipt_number es el RegistroId interno "ZETA:COB:2732"; reference es el número visible en Zeta "A-768"
  receipt({ id: "r1", number: "ZETA:COB:2732", date: "2026-05-20", amount: 41480, reference: "A-768" }),
];

describe("fixture El País S.A. — producción", () => {
  const stmt = buildClientAccountStatement({
    invoices: EL_PAIS_INVOICES,
    receipts: EL_PAIS_RECEIPTS,
    ledgerMode: true,
  });

  it("saldo final UYU es 25742 (coincide con PDF Zeta)", () => {
    expect(stmt.uyu.summary.finalBalance).toBe(25742);
  });

  it("hay 6 movimientos UYU (saldos pendientes excluidos)", () => {
    expect(stmt.uyu.movements).toHaveLength(6);
  });

  it("no incluye los registros de saldos pendientes 2574 y 2674", () => {
    const ids = stmt.uyu.movements.map((m) => m.id);
    expect(ids).not.toContain("sp1");
    expect(ids).not.toContain("sp2");
  });

  it("A391 está clasificada como credit_note (no invoice)", () => {
    const nc = stmt.uyu.movements.find((m) => m.id === "nc1");
    expect(nc?.kind).toBe("credit_note");
    expect(nc?.credit).toBe(8662);
    expect(nc?.debit).toBe(0);
  });

  it("totalDebit es 75884 (solo facturas reales)", () => {
    expect(stmt.uyu.summary.totalDebit).toBe(75884);
  });

  it("totalCredit es 50142 (recibo + NC)", () => {
    // A768(41480) + A391(8662) = 50142
    expect(stmt.uyu.summary.totalCredit).toBe(50142);
  });

  it("totalCreditNotes es 8662", () => {
    expect(stmt.uyu.summary.totalCreditNotes).toBe(8662);
  });

  it("hasCreditNoteSupport es true cuando hay NC detectadas", () => {
    expect(stmt.uyu.summary.hasCreditNoteSupport).toBe(true);
  });

  it("USD vacío", () => {
    expect(stmt.usd.summary.movementCount).toBe(0);
  });

  it("running balance en cada movimiento es correcto", () => {
    const mvs = stmt.uyu.movements;
    // Orden ASC: invoice(0) → credit_note(1) → receipt(2) mismo día
    // 2026-03-13 A2821 debit 17080  → 17080
    // 2026-04-17 A2877 debit 41480  → 58560
    // 2026-05-07 A2932 debit  8662  → 67222
    // 2026-05-08 A2934 debit  8662  → 75884  (invoice, orden 0)
    // 2026-05-08 A391  credit 8662  → 67222  (credit_note, orden 1)
    // 2026-05-20 A768  credit 41480 → 25742
    const expected = [17080, 58560, 67222, 75884, 67222, 25742];
    expect(mvs.map((m) => m.runningBalance)).toEqual(expected);
  });

  it("extractSerieNumero produce los códigos legibles correctos", () => {
    const mvs = stmt.uyu.movements;
    expect(mvs.map((m) => extractSerieNumero(m.number))).toEqual([
      "A2821", "A2877", "A2932", "A2934", "A391", "A768",
    ]);
  });

  it("primer movimiento es la factura más antigua (A2821)", () => {
    expect(extractSerieNumero(stmt.uyu.movements[0].number)).toBe("A2821");
    expect(stmt.uyu.movements[0].kind).toBe("invoice");
  });

  it("último movimiento es el recibo A768 con saldo 25742", () => {
    const last = stmt.uyu.movements[stmt.uyu.movements.length - 1];
    expect(last.number).toBe("A768");
    expect(last.kind).toBe("receipt");
    expect(last.runningBalance).toBe(25742);
  });
});

// ── Saldos pendientes excluidos en ledgerMode ─────────────────────────────────

describe("saldos pendientes", () => {
  it("se excluyen del ledger (ledgerMode: true)", () => {
    const stmt = buildClientAccountStatement({
      invoices: [
        invoice({ id: "sp", number: "ZETA:2574", date: "2026-04-17", total: 41480, category: "Zeta / saldos pendientes" }),
        invoice({ id: "real", number: "ZETA:CCV1:0:36:A:2877", date: "2026-04-17", total: 41480, cfeTipo: "101" }),
      ],
      receipts: [],
      ledgerMode: true,
    });
    expect(stmt.uyu.movements).toHaveLength(1);
    expect(stmt.uyu.movements[0].id).toBe("real");
  });

  it("se incluyen en modo operacional (ledgerMode: false) si están activos", () => {
    const stmt = buildClientAccountStatement({
      invoices: [
        invoice({ id: "sp", number: "ZETA:2574", date: "2026-04-17", total: 41480, category: "Zeta / saldos pendientes" }),
      ],
      receipts: [],
      ledgerMode: false,
    });
    expect(stmt.uyu.movements).toHaveLength(1);
  });
});

// ── Detección de notas de crédito por CFE tipo ────────────────────────────────

describe("credit_note detection", () => {
  it("CFE 181 → credit_note / Haber", () => {
    const stmt = buildClientAccountStatement({
      invoices: [invoice({ id: "nc", date: "2026-01-01", total: 5000, cfeTipo: "181" })],
      receipts: [],
      ledgerMode: true,
    });
    const m = stmt.uyu.movements[0];
    expect(m.kind).toBe("credit_note");
    expect(m.credit).toBe(5000);
    expect(m.debit).toBe(0);
  });

  it("CFE 182 → credit_note / Haber", () => {
    const stmt = buildClientAccountStatement({
      invoices: [invoice({ id: "nc", date: "2026-01-01", total: 3000, cfeTipo: "182" })],
      receipts: [],
      ledgerMode: true,
    });
    expect(stmt.uyu.movements[0].kind).toBe("credit_note");
  });

  it("CFE 101 → invoice / Debe", () => {
    const stmt = buildClientAccountStatement({
      invoices: [invoice({ id: "inv", date: "2026-01-01", total: 5000, cfeTipo: "101" })],
      receipts: [],
      ledgerMode: true,
    });
    const m = stmt.uyu.movements[0];
    expect(m.kind).toBe("invoice");
    expect(m.debit).toBe(5000);
    expect(m.credit).toBe(0);
  });

  it("sin metadata CFE → invoice por defecto", () => {
    const stmt = buildClientAccountStatement({
      invoices: [invoice({ id: "inv", date: "2026-01-01", total: 5000 })],
      receipts: [],
      ledgerMode: true,
    });
    expect(stmt.uyu.movements[0].kind).toBe("invoice");
  });

  it("NC no se detecta en modo operacional (ledgerMode: false)", () => {
    const stmt = buildClientAccountStatement({
      invoices: [invoice({ id: "nc", date: "2026-01-01", total: 5000, cfeTipo: "181" })],
      receipts: [],
      ledgerMode: false,
    });
    expect(stmt.uyu.movements[0].kind).toBe("invoice");
  });

  it("NC reduce el saldo en el runningBalance", () => {
    const stmt = buildClientAccountStatement({
      invoices: [
        invoice({ id: "inv", date: "2026-01-01", total: 10000 }),
        invoice({ id: "nc",  date: "2026-01-15", total:  3000, cfeTipo: "181" }),
      ],
      receipts: [],
      ledgerMode: true,
    });
    const mvs = stmt.uyu.movements;
    expect(mvs[0].runningBalance).toBe(10000);
    expect(mvs[1].runningBalance).toBe(7000);
    expect(stmt.uyu.summary.finalBalance).toBe(7000);
  });
});

// ── Saldo anterior al filtrar por período ────────────────────────────────────

describe("saldo anterior al filtrar por período", () => {
  it("movimientos antes del período afectan el runningBalance de los posteriores", () => {
    const stmt = buildClientAccountStatement({
      invoices: [
        invoice({ id: "prev", date: "2025-12-01", total: 5000 }),
        invoice({ id: "curr", date: "2026-01-15", total: 3000 }),
      ],
      receipts: [],
      ledgerMode: true,
    });
    const jan = stmt.uyu.movements.find((m) => m.id === "curr");
    expect(jan?.runningBalance).toBe(8000);
    const dec = stmt.uyu.movements.find((m) => m.id === "prev");
    expect(dec?.runningBalance).toBe(5000);
  });
});

// ── Aislamiento por moneda ────────────────────────────────────────────────────

describe("aislamiento por moneda", () => {
  const stmt = buildClientAccountStatement({
    invoices: [
      invoice({ id: "uyu1", date: "2026-01-01", total: 10000, currency: "UYU" }),
      invoice({ id: "usd1", date: "2026-01-02", total: 500,   currency: "USD" }),
    ],
    receipts: [
      receipt({ id: "uyu-r", date: "2026-02-01", amount: 3000, currency: "UYU" }),
      receipt({ id: "usd-r", date: "2026-02-01", amount: 200,  currency: "USD" }),
    ],
    ledgerMode: true,
  });

  it("ningún movimiento UYU aparece en USD", () => {
    for (const m of stmt.usd.movements) expect(m.currency).toBe("USD");
  });

  it("ningún movimiento USD aparece en UYU", () => {
    for (const m of stmt.uyu.movements) expect(m.currency).toBe("UYU");
  });

  it("saldo UYU es 7000", () => {
    expect(stmt.uyu.summary.finalBalance).toBe(7000);
  });

  it("saldo USD es 300", () => {
    expect(stmt.usd.summary.finalBalance).toBe(300);
  });
});

// ── Serie y número real desde metadata CCV1 ──────────────────────────────────

describe("número de comprobante desde metadata CCV1", () => {
  it("usa serie+numero del bloque CCV1 cuando están presentes", () => {
    const stmt = buildClientAccountStatement({
      invoices: [invoice({ id: "i", date: "2026-01-01", total: 5000, serie: "A", numero: "2934" })],
      receipts: [],
      ledgerMode: true,
    });
    expect(stmt.uyu.movements[0].number).toBe("A2934");
  });

  it("solo numero sin serie queda como el número", () => {
    const stmt = buildClientAccountStatement({
      invoices: [invoice({ id: "i", date: "2026-01-01", total: 5000, numero: "391" })],
      receipts: [],
      ledgerMode: true,
    });
    expect(stmt.uyu.movements[0].number).toBe("391");
  });

  it("sin metadata CCV1 cae al invoice_number crudo", () => {
    const stmt = buildClientAccountStatement({
      invoices: [invoice({ id: "i", number: "ZETA:CCV1:0:36:A:2821", date: "2026-01-01", total: 5000 })],
      receipts: [],
      ledgerMode: true,
    });
    // Sin metadata CCV1, cae al invoice_number crudo
    expect(stmt.uyu.movements[0].number).toBe("ZETA:CCV1:0:36:A:2821");
  });

  it("serie+numero tiene prioridad sobre invoice_number", () => {
    const stmt = buildClientAccountStatement({
      invoices: [invoice({ id: "i", number: "ZETA:CCV1:0:36:A:2821", date: "2026-01-01", total: 5000, serie: "A", numero: "2821" })],
      receipts: [],
      ledgerMode: true,
    });
    expect(stmt.uyu.movements[0].number).toBe("A2821");
  });
});

// ── Descripción de ítems desde Lineas ────────────────────────────────────────

describe("detalle desde Lineas[0].Descripcion", () => {
  it("usa la descripción del primer ítem del comprobante (Descripcion)", () => {
    const stmt = buildClientAccountStatement({
      invoices: [invoice({ id: "i", date: "2026-01-01", total: 5000, linea: "Filmación" })],
      receipts: [],
      ledgerMode: true,
    });
    expect(stmt.uyu.movements[0].detail).toBe("Filmación");
  });

  it("usa Concepto como fallback de descripción (clave documentada en Zeta)", () => {
    // Zeta docs show Lineas[].Concepto; algunas respuestas QueryComprobantes usan esta clave
    const row: DataRow = {
      id: "i",
      invoice_number: "INV-i",
      issue_date: "2026-01-01",
      total_amount: 5000,
      currency_code: "UYU",
      is_active: true,
      zeta_metadata: {
        zeta_customer_voucher_v1: {
          raw_payload: { Lineas: [{ Concepto: "Mantenimiento web" }] },
        },
      },
    };
    const stmt = buildClientAccountStatement({ invoices: [row], receipts: [], ledgerMode: true });
    expect(stmt.uyu.movements[0].detail).toBe("Mantenimiento web");
  });

  it("no muestra categoría técnica 'Zeta / comprobantes por cliente'", () => {
    const stmt = buildClientAccountStatement({
      invoices: [invoice({ id: "i", date: "2026-01-01", total: 5000, category: "Zeta / comprobantes por cliente" })],
      receipts: [],
      ledgerMode: true,
    });
    expect(stmt.uyu.movements[0].detail).not.toContain("Zeta /");
  });

  it("sin metadata ni categoría válida devuelve string vacío", () => {
    const stmt = buildClientAccountStatement({
      invoices: [invoice({ id: "i", date: "2026-01-01", total: 5000 })],
      receipts: [],
      ledgerMode: true,
    });
    expect(stmt.uyu.movements[0].detail).toBe("");
  });

  it("categoría no-Zeta se usa como detalle", () => {
    const stmt = buildClientAccountStatement({
      invoices: [invoice({ id: "i", date: "2026-01-01", total: 5000, category: "Servicios de diseño" })],
      receipts: [],
      ledgerMode: true,
    });
    expect(stmt.uyu.movements[0].detail).toBe("Servicios de diseño");
  });

  it("Lineas tiene prioridad sobre category válida", () => {
    const stmt = buildClientAccountStatement({
      invoices: [invoice({ id: "i", date: "2026-01-01", total: 5000, category: "Servicios", linea: "Mantenimiento web" })],
      receipts: [],
      ledgerMode: true,
    });
    expect(stmt.uyu.movements[0].detail).toBe("Mantenimiento web");
  });
});

// ── Número visible de recibo (reference) ─────────────────────────────────────

describe("número de recibo desde reference", () => {
  it("normaliza 'A-768' a 'A768'", () => {
    const stmt = buildClientAccountStatement({
      invoices: [],
      receipts: [receipt({ id: "r", number: "ZETA:COB:2732", date: "2026-01-01", amount: 1000, reference: "A-768" })],
      ledgerMode: true,
    });
    expect(stmt.uyu.movements[0].number).toBe("A768");
  });

  it("reference sin guión se usa directamente", () => {
    const stmt = buildClientAccountStatement({
      invoices: [],
      receipts: [receipt({ id: "r", number: "ZETA:COB:999", date: "2026-01-01", amount: 1000, reference: "B123" })],
      ledgerMode: true,
    });
    expect(stmt.uyu.movements[0].number).toBe("B123");
  });

  it("referencia interna con ':' se ignora y cae al receipt_number", () => {
    const stmt = buildClientAccountStatement({
      invoices: [],
      receipts: [receipt({ id: "r", number: "ZETA:COB:2732", date: "2026-01-01", amount: 1000, reference: "ZETA:COB:2732" })],
      ledgerMode: true,
    });
    expect(stmt.uyu.movements[0].number).toBe("ZETA:COB:2732");
  });

  it("sin reference usa receipt_number como fallback", () => {
    const stmt = buildClientAccountStatement({
      invoices: [],
      receipts: [receipt({ id: "r", number: "REC-999", date: "2026-01-01", amount: 1000 })],
      ledgerMode: true,
    });
    expect(stmt.uyu.movements[0].number).toBe("REC-999");
  });

  it("recibo detalle usa payment_method, no reference", () => {
    const stmt = buildClientAccountStatement({
      invoices: [],
      receipts: [receipt({ id: "r", number: "REC-1", date: "2026-01-01", amount: 1000, reference: "A-768", paymentMethod: "Transferencia" })],
      ledgerMode: true,
    });
    expect(stmt.uyu.movements[0].detail).toBe("Transferencia");
  });

  it("recibo sin payment_method tiene detail vacío", () => {
    const stmt = buildClientAccountStatement({
      invoices: [],
      receipts: [receipt({ id: "r", date: "2026-01-01", amount: 1000, reference: "A-768" })],
      ledgerMode: true,
    });
    expect(stmt.uyu.movements[0].detail).toBe("");
  });
});

// ── Fixture El País S.A. — número de recibo real ──────────────────────────────

describe("fixture El País S.A. — número de recibo real", () => {
  const stmt = buildClientAccountStatement({
    invoices: [
      invoice({ id: "i1", number: "ZETA:CCV1:0:36:A:2821", date: "2026-03-13", total: 17080, serie: "A", numero: "2821", cfeTipo: "101" }),
    ],
    receipts: [
      receipt({ id: "r1", number: "ZETA:COB:2732", date: "2026-05-20", amount: 17080, reference: "A-768" }),
    ],
    ledgerMode: true,
  });

  it("factura muestra 'A2821' desde metadata CCV1", () => {
    expect(stmt.uyu.movements[0].number).toBe("A2821");
  });

  it("recibo muestra 'A768' desde reference normalizado", () => {
    const rec = stmt.uyu.movements.find((m) => m.kind === "receipt");
    expect(rec?.number).toBe("A768");
  });
});
