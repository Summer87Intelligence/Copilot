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

/** Forma completa de una línea de comprobante Zeta (raw_payload.Lineas[n]). */
type ZetaLinea = {
  Concepto?: string;
  Descripcion?: string;
  Notas?: string;
  Total?: string | number;
  Neto?: string | number;
  IVA?: string | number;
  Cantidad?: string | number;
  PrecioUnitario?: string | number;
  ArticuloCodigo?: string;
};

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
  /** primer ítem del comprobante — Lineas[0].Descripcion (legacy shorthand) */
  linea?: string;
  /** líneas completas del comprobante — usa Concepto+Total igual que Zeta real */
  lineas?: ZetaLinea[];
}): DataRow {
  const hasCcv1 =
    opts.cfeTipo != null ||
    opts.serie != null ||
    opts.numero != null ||
    opts.linea != null ||
    opts.lineas != null;
  // lineas option precede sobre linea shorthand
  const rawLineas: ZetaLinea[] | undefined =
    opts.lineas != null
      ? opts.lineas
      : opts.linea != null
        ? [{ Descripcion: opts.linea }]
        : undefined;
  const ccv1: Record<string, unknown> = {};
  if (opts.cfeTipo != null) ccv1.cfe_tipo = String(opts.cfeTipo);
  if (opts.serie != null) ccv1.serie = opts.serie;
  if (opts.numero != null) ccv1.numero = opts.numero;
  if (rawLineas) ccv1.raw_payload = { Lineas: rawLineas };
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
// CFE tipos REALES confirmados en Supabase (2026-05-26):
//   111 = e-Boleta de Contado  (facturas de este tenant)
//   112 = e-NC de e-Boleta     (nota de crédito A391)
//   NO usan 101/181 — esos son e-Factura/NC e-Factura, no utilizados por este tenant.
//
//   ZETA:CCV1:0:36:A:2821  13/03/26  CFE 111  Venta Crédito   17.080  → Debe
//   ZETA:CCV1:0:36:A:2877  17/04/26  CFE 111  Venta Crédito   41.480  → Debe
//   ZETA:2574              17/04/26  —        saldos pendientes 41.480 → EXCLUIR
//   ZETA:CCV1:0:36:A:2932  07/05/26  CFE 111  Venta Crédito    8.662  → Debe
//   ZETA:CCV1:0:36:A:2934  08/05/26  CFE 111  Venta Crédito    8.662  → Debe
//   ZETA:2674              08/05/26  —        saldos pendientes  8.662 → EXCLUIR
//   ZETA:CCV1:0:36:A:391   08/05/26  CFE 112  Nota de Crédito  8.662  → Haber
//   A768                   20/05/26  Recibo   Recibo de Cobro 41.480  → Haber
//
// Saldo final esperado: 17.080 + 41.480 + 8.662 + 8.662 − 8.662 − 41.480 = 25.742

const EL_PAIS_INVOICES = [
  invoice({ id: "i1", number: "ZETA:CCV1:0:36:A:2821", date: "2026-03-13", total: 17080, cfeTipo: "111" }),
  invoice({ id: "i2", number: "ZETA:CCV1:0:36:A:2877", date: "2026-04-17", total: 41480, cfeTipo: "111" }),
  // saldo pendiente derivado — debe excluirse
  invoice({ id: "sp1", number: "ZETA:2574",             date: "2026-04-17", total: 41480, category: "Zeta / saldos pendientes" }),
  invoice({ id: "i3", number: "ZETA:CCV1:0:36:A:2932", date: "2026-05-07", total: 8662,  cfeTipo: "111" }),
  invoice({ id: "i4", number: "ZETA:CCV1:0:36:A:2934", date: "2026-05-08", total: 8662,  cfeTipo: "111" }),
  // saldo pendiente derivado — debe excluirse
  invoice({ id: "sp2", number: "ZETA:2674",             date: "2026-05-08", total: 8662,  category: "Zeta / saldos pendientes" }),
  // nota de crédito CFE 112 (e-NC de e-Boleta) — debe ir a Haber
  invoice({ id: "nc1", number: "ZETA:CCV1:0:36:A:391",  date: "2026-05-08", total: 8662,  cfeTipo: "112" }),
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

  it("shadow huérfano sin CCV1 se incluye en ledger", () => {
    const stmt = buildClientAccountStatement({
      invoices: [
        invoice({
          id: "orphan",
          number: "ZETA:2746",
          date: "2026-06-04",
          total: 68320,
          category: "Zeta / saldos pendientes",
        }),
      ],
      receipts: [],
      ledgerMode: true,
    });
    expect(stmt.uyu.movements).toHaveLength(1);
    expect(stmt.uyu.movements[0].id).toBe("orphan");
    expect(stmt.uyu.movements[0].debit).toBe(68320);
  });

  it("shadow con par CCV1 mismo día e importe ±tol se excluye del ledger", () => {
    const stmt = buildClientAccountStatement({
      invoices: [
        invoice({
          id: "ccv1",
          number: "ZETA:CCV1:0:107:A:2970",
          date: "2026-06-04",
          total: 96623.88,
          cfeTipo: "101",
        }),
        invoice({
          id: "shadow",
          number: "ZETA:2776",
          date: "2026-06-04",
          total: 96624,
          category: "Zeta / saldos pendientes",
        }),
      ],
      receipts: [],
      ledgerMode: true,
    });
    expect(stmt.uyu.movements).toHaveLength(1);
    expect(stmt.uyu.movements[0].id).toBe("ccv1");
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
  // Tipos reales confirmados en Supabase para este tenant (El País S.A., 2026-05-26):
  //   111 = e-Boleta de Contado (factura normal)
  //   112 = e-NC de e-Boleta de Contado (nota de crédito A391)

  it("CFE 112 → credit_note / Haber (tipo REAL de este tenant)", () => {
    const stmt = buildClientAccountStatement({
      invoices: [invoice({ id: "nc", date: "2026-01-01", total: 5000, cfeTipo: "112" })],
      receipts: [],
      ledgerMode: true,
    });
    const m = stmt.uyu.movements[0];
    expect(m.kind).toBe("credit_note");
    expect(m.credit).toBe(5000);
    expect(m.debit).toBe(0);
  });

  it("CFE 102 → credit_note / Haber (e-Factura NC, Petrovic)", () => {
    const stmt = buildClientAccountStatement({
      invoices: [invoice({ id: "nc102", date: "2026-01-19", total: 484, cfeTipo: "102" })],
      receipts: [],
      ledgerMode: true,
    });
    const m = stmt.uyu.movements[0];
    expect(m.kind).toBe("credit_note");
    expect(m.credit).toBe(484);
    expect(m.debit).toBe(0);
  });

  it("CFE 181 → credit_note / Haber (e-NC de e-Factura, otros tenants)", () => {
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

  it("CFE 111 → invoice / Debe (tipo REAL de facturas de este tenant)", () => {
    const stmt = buildClientAccountStatement({
      invoices: [invoice({ id: "inv", date: "2026-01-01", total: 5000, cfeTipo: "111" })],
      receipts: [],
      ledgerMode: true,
    });
    const m = stmt.uyu.movements[0];
    expect(m.kind).toBe("invoice");
    expect(m.debit).toBe(5000);
    expect(m.credit).toBe(0);
  });

  it("CFE 101 → invoice / Debe (e-Factura, otros tenants)", () => {
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

  it("raw_payload.CFETipo 112 detectado como credit_note (sin cfe_tipo en metadata)", () => {
    // Cubre el caso donde el mapper no puso cfe_tipo pero raw_payload.CFETipo sí está
    const row: DataRow = {
      id: "nc",
      invoice_number: "ZETA:CCV1:0:36:A:391",
      issue_date: "2026-05-08",
      total_amount: 8662,
      currency_code: "UYU",
      is_active: true,
      zeta_metadata: {
        zeta_customer_voucher_v1: {
          raw_payload: { CFETipo: 112 },
          // cfe_tipo ausente — debe caer al raw_payload
        },
      },
    };
    const stmt = buildClientAccountStatement({ invoices: [row], receipts: [], ledgerMode: true });
    expect(stmt.uyu.movements[0].kind).toBe("credit_note");
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
      invoices: [invoice({ id: "nc", date: "2026-01-01", total: 5000, cfeTipo: "112" })],
      receipts: [],
      ledgerMode: false,
    });
    expect(stmt.uyu.movements[0].kind).toBe("invoice");
  });

  it("NC reduce el saldo en el runningBalance", () => {
    const stmt = buildClientAccountStatement({
      invoices: [
        invoice({ id: "inv", date: "2026-01-01", total: 10000 }),
        invoice({ id: "nc",  date: "2026-01-15", total:  3000, cfeTipo: "112" }),
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

// ── detailLines — líneas secundarias enriquecidas ─────────────────────────────

describe("detailLines — factura con Lineas reales", () => {
  it("una línea con Concepto y Total → detailLine con label y debit", () => {
    const stmt = buildClientAccountStatement({
      invoices: [
        invoice({
          id: "i",
          date: "2026-03-13",
          total: 17080,
          cfeTipo: "111",
          lineas: [{ Concepto: "Filmación", Total: "17080.00" }],
        }),
      ],
      receipts: [],
      ledgerMode: true,
    });
    const dl = stmt.uyu.movements[0].detailLines;
    expect(dl).toHaveLength(1);
    expect(dl[0].label).toBe("Filmación");
    expect(dl[0].debit).toBe(17080);
    expect(dl[0].credit).toBeUndefined();
  });

  it("Concepto + Notas no-vacías → label concatenado con ' · '", () => {
    const stmt = buildClientAccountStatement({
      invoices: [
        invoice({
          id: "i",
          date: "2026-04-17",
          total: 41480,
          cfeTipo: "111",
          lineas: [{ Concepto: "Filmación", Notas: "Video Redes", Total: "41480.00" }],
        }),
      ],
      receipts: [],
      ledgerMode: true,
    });
    const dl = stmt.uyu.movements[0].detailLines;
    expect(dl[0].label).toBe("Filmación · Video Redes");
    expect(dl[0].debit).toBe(41480);
  });

  it("múltiples líneas → múltiples detailLines", () => {
    const stmt = buildClientAccountStatement({
      invoices: [
        invoice({
          id: "i",
          date: "2026-01-01",
          total: 10000,
          cfeTipo: "111",
          lineas: [
            { Concepto: "Servicio A", Total: "6000.00" },
            { Concepto: "Servicio B", Total: "4000.00" },
          ],
        }),
      ],
      receipts: [],
      ledgerMode: true,
    });
    const dl = stmt.uyu.movements[0].detailLines;
    expect(dl).toHaveLength(2);
    expect(dl[0].label).toBe("Servicio A");
    expect(dl[0].debit).toBe(6000);
    expect(dl[1].label).toBe("Servicio B");
    expect(dl[1].debit).toBe(4000);
  });

  it("sin Lineas → detailLines vacío", () => {
    const stmt = buildClientAccountStatement({
      invoices: [invoice({ id: "i", date: "2026-01-01", total: 5000 })],
      receipts: [],
      ledgerMode: true,
    });
    expect(stmt.uyu.movements[0].detailLines).toHaveLength(0);
  });

  it("detailLines no modifican el runningBalance", () => {
    const stmt = buildClientAccountStatement({
      invoices: [
        invoice({
          id: "i1",
          date: "2026-01-01",
          total: 10000,
          lineas: [{ Concepto: "Ítem A", Total: "10000.00" }],
        }),
        invoice({
          id: "i2",
          date: "2026-02-01",
          total: 5000,
          lineas: [{ Concepto: "Ítem B", Total: "5000.00" }],
        }),
      ],
      receipts: [],
      ledgerMode: true,
    });
    const mvs = stmt.uyu.movements;
    expect(mvs[0].runningBalance).toBe(10000);
    expect(mvs[1].runningBalance).toBe(15000);
    expect(stmt.uyu.summary.finalBalance).toBe(15000);
  });
});

describe("detailLines — nota de crédito", () => {
  it("NC CFE 112 con Lineas → detailLine credit (no debit)", () => {
    const stmt = buildClientAccountStatement({
      invoices: [
        invoice({
          id: "nc",
          date: "2026-05-08",
          total: 8662,
          cfeTipo: "112",
          lineas: [{ Concepto: "Inn content de Viandas hotel del Prado", Total: "8662.00" }],
        }),
      ],
      receipts: [],
      ledgerMode: true,
    });
    const mv = stmt.uyu.movements[0];
    expect(mv.kind).toBe("credit_note");
    const dl = mv.detailLines;
    expect(dl).toHaveLength(1);
    expect(dl[0].label).toBe("Inn content de Viandas hotel del Prado");
    expect(dl[0].credit).toBe(8662);
    expect(dl[0].debit).toBeUndefined();
  });

  it("NC detailLine credit no altera el runningBalance", () => {
    const stmt = buildClientAccountStatement({
      invoices: [
        invoice({ id: "inv", date: "2026-01-01", total: 10000 }),
        invoice({
          id: "nc",
          date: "2026-01-15",
          total: 3000,
          cfeTipo: "112",
          lineas: [{ Concepto: "Descuento", Total: "3000.00" }],
        }),
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

describe("detailLines — recibo", () => {
  it("recibo con payment_method → detailLine con label solo", () => {
    const stmt = buildClientAccountStatement({
      invoices: [],
      receipts: [
        receipt({ id: "r", date: "2026-05-20", amount: 41480, paymentMethod: "Caja Principal" }),
      ],
      ledgerMode: true,
    });
    const dl = stmt.uyu.movements[0].detailLines;
    expect(dl).toHaveLength(1);
    expect(dl[0].label).toBe("Caja Principal");
    expect(dl[0].debit).toBeUndefined();
    expect(dl[0].credit).toBeUndefined();
  });

  it("recibo sin payment_method → detailLines vacío", () => {
    const stmt = buildClientAccountStatement({
      invoices: [],
      receipts: [receipt({ id: "r", date: "2026-05-20", amount: 41480 })],
      ledgerMode: true,
    });
    expect(stmt.uyu.movements[0].detailLines).toHaveLength(0);
  });

  it("detailLines del recibo no alteran el runningBalance", () => {
    const stmt = buildClientAccountStatement({
      invoices: [invoice({ id: "i", date: "2026-01-01", total: 10000 })],
      receipts: [
        receipt({ id: "r", date: "2026-02-01", amount: 5000, paymentMethod: "Caja Principal" }),
      ],
      ledgerMode: true,
    });
    expect(stmt.uyu.movements[1].runningBalance).toBe(5000);
    expect(stmt.uyu.summary.finalBalance).toBe(5000);
  });
});

describe("fixture El País S.A. — detailLines de producción", () => {
  const EL_PAIS_FULL = buildClientAccountStatement({
    invoices: [
      invoice({
        id: "i1", number: "ZETA:CCV1:0:36:A:2821", date: "2026-03-13", total: 17080,
        cfeTipo: "111", serie: "A", numero: "2821",
        lineas: [{ Concepto: "Filmación", Notas: "Video Redes", Total: "17080.00" }],
      }),
      invoice({
        id: "i2", number: "ZETA:CCV1:0:36:A:2877", date: "2026-04-17", total: 41480,
        cfeTipo: "111", serie: "A", numero: "2877",
        lineas: [{ Concepto: "Filmación", Notas: "Video Redes", Total: "41480.00" }],
      }),
      invoice({ id: "sp1", number: "ZETA:2574", date: "2026-04-17", total: 41480, category: "Zeta / saldos pendientes" }),
      invoice({
        id: "i3", number: "ZETA:CCV1:0:36:A:2932", date: "2026-05-07", total: 8662,
        cfeTipo: "111", serie: "A", numero: "2932",
        lineas: [{ Concepto: "Inn content de Viandas hotel del Prado", Total: "8662.00" }],
      }),
      invoice({
        id: "i4", number: "ZETA:CCV1:0:36:A:2934", date: "2026-05-08", total: 8662,
        cfeTipo: "111", serie: "A", numero: "2934",
        lineas: [{ Concepto: "Inn content de Viandas hotel del Prado", Total: "8662.00" }],
      }),
      invoice({ id: "sp2", number: "ZETA:2674", date: "2026-05-08", total: 8662, category: "Zeta / saldos pendientes" }),
      invoice({
        id: "nc1", number: "ZETA:CCV1:0:36:A:391", date: "2026-05-08", total: 8662,
        cfeTipo: "112", serie: "A", numero: "391",
        lineas: [{ Concepto: "Inn content de Viandas hotel del Prado", Total: "8662.00" }],
      }),
    ],
    receipts: [
      receipt({ id: "r1", number: "ZETA:COB:2732", date: "2026-05-20", amount: 41480, reference: "A-768", paymentMethod: "Caja Principal" }),
    ],
    ledgerMode: true,
  });

  it("saldo final sigue siendo 25742", () => {
    expect(EL_PAIS_FULL.uyu.summary.finalBalance).toBe(25742);
  });

  it("A391 NC tiene detailLine con credit = 8662", () => {
    const nc = EL_PAIS_FULL.uyu.movements.find((m) => m.id === "nc1")!;
    expect(nc.kind).toBe("credit_note");
    expect(nc.detailLines).toHaveLength(1);
    expect(nc.detailLines[0].label).toBe("Inn content de Viandas hotel del Prado");
    expect(nc.detailLines[0].credit).toBe(8662);
    expect(nc.detailLines[0].debit).toBeUndefined();
  });

  it("A2877 tiene detailLine con label 'Filmación · Video Redes' y debit = 41480", () => {
    const inv = EL_PAIS_FULL.uyu.movements.find((m) => m.id === "i2")!;
    expect(inv.detailLines[0].label).toBe("Filmación · Video Redes");
    expect(inv.detailLines[0].debit).toBe(41480);
  });

  it("A768 recibo tiene detailLine 'Caja Principal' sin importe", () => {
    const rec = EL_PAIS_FULL.uyu.movements.find((m) => m.id === "r1")!;
    expect(rec.detailLines).toHaveLength(1);
    expect(rec.detailLines[0].label).toBe("Caja Principal");
    expect(rec.detailLines[0].debit).toBeUndefined();
    expect(rec.detailLines[0].credit).toBeUndefined();
  });

  it("saldos pendientes excluidos no tienen detailLines", () => {
    const ids = EL_PAIS_FULL.uyu.movements.map((m) => m.id);
    expect(ids).not.toContain("sp1");
    expect(ids).not.toContain("sp2");
  });

  it("ningún detailLine contiene categorías técnicas", () => {
    for (const mv of EL_PAIS_FULL.uyu.movements) {
      for (const dl of mv.detailLines) {
        expect(dl.label).not.toMatch(/^Zeta \//);
        expect(dl.label).not.toMatch(/ZETA:COB/);
        expect(dl.label).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
      }
    }
  });
});
