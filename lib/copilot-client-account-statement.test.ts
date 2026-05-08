import { describe, expect, it } from "vitest";

import {
  buildClientAccountStatement,
  describeMovementKind,
  formatStatementAmount,
  type AccountStatementCurrency,
} from "./copilot-client-account-statement";
import type { DataRow } from "./copilot-data";

function invoice(opts: {
  id: string;
  number?: string;
  date: string;
  total: number;
  currency?: "USD" | "UYU" | null;
  active?: boolean;
}): DataRow {
  return {
    id: opts.id,
    invoice_number: opts.number ?? `INV-${opts.id}`,
    issue_date: opts.date,
    total_amount: opts.total,
    currency_code: opts.currency === undefined ? "UYU" : opts.currency,
    is_active: opts.active ?? true,
  };
}

function receipt(opts: {
  id: string;
  number?: string;
  date: string;
  amount: number;
  currency?: "USD" | "UYU" | null;
  active?: boolean;
}): DataRow {
  return {
    id: opts.id,
    receipt_number: opts.number ?? `REC-${opts.id}`,
    receipt_date: opts.date,
    amount: opts.amount,
    currency_code: opts.currency === undefined ? "UYU" : opts.currency,
    is_active: opts.active ?? true,
  };
}

describe("buildClientAccountStatement", () => {
  it("cliente con factura UYU + recibo UYU: saldo correcto, USD vacío", () => {
    const stmt = buildClientAccountStatement({
      invoices: [invoice({ id: "i1", date: "2026-01-15", total: 12300, currency: "UYU" })],
      receipts: [receipt({ id: "r1", date: "2026-02-05", amount: 5000, currency: "UYU" })],
    });

    expect(stmt.uyu.summary.totalInvoiced).toBe(12300);
    expect(stmt.uyu.summary.totalCollected).toBe(5000);
    expect(stmt.uyu.summary.totalCreditNotes).toBe(0);
    expect(stmt.uyu.summary.pendingBalance).toBe(7300);
    expect(stmt.uyu.summary.movementCount).toBe(2);
    expect(stmt.uyu.summary.hasCreditNoteSupport).toBe(false);

    expect(stmt.uyu.movements).toHaveLength(2);
    expect(stmt.uyu.movements[0]).toMatchObject({
      kind: "invoice",
      currency: "UYU",
      debit: 12300,
      credit: 0,
      runningBalance: 12300,
    });
    expect(stmt.uyu.movements[1]).toMatchObject({
      kind: "receipt",
      currency: "UYU",
      debit: 0,
      credit: 5000,
      runningBalance: 7300,
    });

    expect(stmt.usd.summary.movementCount).toBe(0);
    expect(stmt.usd.movements).toHaveLength(0);
    expect(stmt.unknownCurrencyCount).toBe(0);
  });

  it("cliente con factura USD + recibo USD", () => {
    const stmt = buildClientAccountStatement({
      invoices: [invoice({ id: "i1", date: "2026-03-01", total: 1000, currency: "USD" })],
      receipts: [receipt({ id: "r1", date: "2026-03-15", amount: 305, currency: "USD" })],
    });

    expect(stmt.usd.summary.totalInvoiced).toBe(1000);
    expect(stmt.usd.summary.totalCollected).toBe(305);
    expect(stmt.usd.summary.pendingBalance).toBe(695);
    expect(stmt.usd.movements[0].currency).toBe("USD");
    expect(stmt.uyu.summary.movementCount).toBe(0);
  });

  it("cliente multi-moneda: no mezcla, cada moneda con su saldo", () => {
    const stmt = buildClientAccountStatement({
      invoices: [
        invoice({ id: "i-uyu", date: "2026-04-01", total: 24400, currency: "UYU" }),
        invoice({ id: "i-usd", date: "2026-04-02", total: 318.36, currency: "USD" }),
      ],
      receipts: [
        receipt({ id: "r-uyu", date: "2026-04-10", amount: 10000, currency: "UYU" }),
        receipt({ id: "r-usd", date: "2026-04-12", amount: 305, currency: "USD" }),
      ],
    });

    expect(stmt.uyu.summary.totalInvoiced).toBe(24400);
    expect(stmt.uyu.summary.totalCollected).toBe(10000);
    expect(stmt.uyu.summary.pendingBalance).toBe(14400);

    expect(stmt.usd.summary.totalInvoiced).toBe(318.36);
    expect(stmt.usd.summary.totalCollected).toBe(305);
    expect(stmt.usd.summary.pendingBalance).toBe(13.36);

    // Ningún movimiento UYU está en la lista USD ni viceversa.
    for (const m of stmt.uyu.movements) expect(m.currency).toBe("UYU");
    for (const m of stmt.usd.movements) expect(m.currency).toBe("USD");
  });

  it("cliente sin movimientos: ambas tabs vacías y saldo 0", () => {
    const stmt = buildClientAccountStatement({ invoices: [], receipts: [] });
    expect(stmt.uyu.summary).toEqual({
      totalDebit: 0,
      totalCredit: 0,
      finalBalance: 0,
      totalInvoiced: 0,
      totalCollected: 0,
      totalCreditNotes: 0,
      pendingBalance: 0,
      movementCount: 0,
      hasCreditNoteSupport: false,
      hasNegativeBalance: false,
    });
    expect(stmt.usd.summary.movementCount).toBe(0);
  });

  it("filas inactivas se omiten en facturas y recibos", () => {
    const stmt = buildClientAccountStatement({
      invoices: [
        invoice({ id: "i1", date: "2026-01-15", total: 100, currency: "UYU" }),
        invoice({ id: "i2", date: "2026-01-16", total: 999, currency: "UYU", active: false }),
      ],
      receipts: [
        receipt({ id: "r1", date: "2026-02-05", amount: 50, currency: "UYU" }),
        receipt({ id: "r2", date: "2026-02-06", amount: 999, currency: "UYU", active: false }),
      ],
    });
    expect(stmt.uyu.summary.totalInvoiced).toBe(100);
    expect(stmt.uyu.summary.totalCollected).toBe(50);
    expect(stmt.uyu.summary.movementCount).toBe(2);
  });

  it("moneda no determinable se cuenta en unknownCurrencyCount y NO asume UYU", () => {
    const stmt = buildClientAccountStatement({
      invoices: [
        invoice({ id: "i1", date: "2026-01-01", total: 100, currency: null }),
      ],
      receipts: [
        receipt({ id: "r1", date: "2026-02-01", amount: 50, currency: null }),
      ],
    });
    expect(stmt.unknownCurrencyCount).toBe(2);
    expect(stmt.uyu.summary.movementCount).toBe(0);
    expect(stmt.usd.summary.movementCount).toBe(0);
  });

  it("ordena ASC por fecha y deja factura antes que recibo el mismo día (saldo crece y luego baja)", () => {
    const stmt = buildClientAccountStatement({
      invoices: [
        invoice({ id: "i1", date: "2026-05-04", total: 100, currency: "UYU", number: "F-001" }),
      ],
      receipts: [
        receipt({ id: "r1", date: "2026-05-04", amount: 60, currency: "UYU", number: "R-001" }),
      ],
    });
    expect(stmt.uyu.movements.map((m) => m.kind)).toEqual(["invoice", "receipt"]);
    expect(stmt.uyu.movements.map((m) => m.runningBalance)).toEqual([100, 40]);
  });

  it("saldo acumulado consistente con varios movimientos cronológicos", () => {
    const stmt = buildClientAccountStatement({
      invoices: [
        invoice({ id: "i1", date: "2026-01-15", total: 1000, currency: "UYU" }),
        invoice({ id: "i2", date: "2026-02-10", total: 500, currency: "UYU" }),
      ],
      receipts: [
        receipt({ id: "r1", date: "2026-01-20", amount: 200, currency: "UYU" }),
        receipt({ id: "r2", date: "2026-02-25", amount: 800, currency: "UYU" }),
      ],
    });
    expect(stmt.uyu.movements.map((m) => m.runningBalance)).toEqual([1000, 800, 1300, 500]);
    expect(stmt.uyu.summary.pendingBalance).toBe(500);
  });

  it("ignora facturas y recibos con total/amount <= 0 (no contamina saldo)", () => {
    const stmt = buildClientAccountStatement({
      invoices: [
        invoice({ id: "i0", date: "2026-01-01", total: 0, currency: "UYU" }),
        invoice({ id: "i1", date: "2026-01-02", total: -50, currency: "UYU" }),
        invoice({ id: "i2", date: "2026-01-03", total: 100, currency: "UYU" }),
      ],
      receipts: [
        receipt({ id: "r0", date: "2026-02-01", amount: 0, currency: "UYU" }),
        receipt({ id: "r1", date: "2026-02-02", amount: -10, currency: "UYU" }),
        receipt({ id: "r2", date: "2026-02-03", amount: 30, currency: "UYU" }),
      ],
    });
    expect(stmt.uyu.summary.totalInvoiced).toBe(100);
    expect(stmt.uyu.summary.totalCollected).toBe(30);
    expect(stmt.uyu.summary.movementCount).toBe(2);
  });
});

describe("buildClientAccountStatement — columnas contables Debe/Haber/Saldo", () => {
  it("factura → Debe = total, Haber = 0, Saldo = saldo anterior + Debe", () => {
    const stmt = buildClientAccountStatement({
      invoices: [
        invoice({ id: "i1", date: "2026-01-15", total: 1000, currency: "UYU" }),
        invoice({ id: "i2", date: "2026-02-15", total: 500, currency: "UYU" }),
      ],
      receipts: [],
    });
    expect(stmt.uyu.movements.map((m) => m.debit)).toEqual([1000, 500]);
    expect(stmt.uyu.movements.every((m) => m.credit === 0)).toBe(true);
    expect(stmt.uyu.movements.map((m) => m.runningBalance)).toEqual([1000, 1500]);
    expect(stmt.uyu.summary).toMatchObject({
      totalDebit: 1500,
      totalCredit: 0,
      finalBalance: 1500,
    });
  });

  it("recibo → Debe = 0, Haber = importe, Saldo = saldo anterior - Haber", () => {
    const stmt = buildClientAccountStatement({
      invoices: [
        invoice({ id: "i1", date: "2026-01-01", total: 1000, currency: "UYU" }),
      ],
      receipts: [
        receipt({ id: "r1", date: "2026-01-10", amount: 400, currency: "UYU" }),
      ],
    });
    const recibo = stmt.uyu.movements.find((m) => m.kind === "receipt")!;
    expect(recibo.debit).toBe(0);
    expect(recibo.credit).toBe(400);
    expect(recibo.runningBalance).toBe(600);
    expect(stmt.uyu.summary).toMatchObject({
      totalDebit: 1000,
      totalCredit: 400,
      finalBalance: 600,
    });
  });

  it("hasNegativeBalance = true cuando Haber > Debe (saldo a favor del cliente)", () => {
    const stmt = buildClientAccountStatement({
      invoices: [invoice({ id: "i1", date: "2026-01-15", total: 1000, currency: "UYU" })],
      receipts: [
        receipt({ id: "r1", date: "2026-02-10", amount: 1500, currency: "UYU" }),
      ],
    });
    expect(stmt.uyu.summary.totalDebit).toBe(1000);
    expect(stmt.uyu.summary.totalCredit).toBe(1500);
    expect(stmt.uyu.summary.finalBalance).toBe(-500);
    expect(stmt.uyu.summary.hasNegativeBalance).toBe(true);
  });

  it("hasNegativeBalance = false cuando Debe >= Haber", () => {
    const stmt = buildClientAccountStatement({
      invoices: [invoice({ id: "i1", date: "2026-01-15", total: 1000, currency: "UYU" })],
      receipts: [receipt({ id: "r1", date: "2026-02-10", amount: 1000, currency: "UYU" })],
    });
    expect(stmt.uyu.summary.finalBalance).toBe(0);
    expect(stmt.uyu.summary.hasNegativeBalance).toBe(false);

    const stmt2 = buildClientAccountStatement({
      invoices: [invoice({ id: "i1", date: "2026-01-15", total: 1000, currency: "UYU" })],
      receipts: [receipt({ id: "r1", date: "2026-02-10", amount: 400, currency: "UYU" })],
    });
    expect(stmt2.uyu.summary.finalBalance).toBe(600);
    expect(stmt2.uyu.summary.hasNegativeBalance).toBe(false);
  });

  it("hasNegativeBalance se calcula independiente por moneda", () => {
    const stmt = buildClientAccountStatement({
      invoices: [
        invoice({ id: "i1", date: "2026-01-15", total: 1000, currency: "UYU" }),
        invoice({ id: "i2", date: "2026-01-15", total: 500, currency: "USD" }),
      ],
      receipts: [
        receipt({ id: "r-uyu", date: "2026-02-10", amount: 1500, currency: "UYU" }),
        receipt({ id: "r-usd", date: "2026-02-10", amount: 100, currency: "USD" }),
      ],
    });
    expect(stmt.uyu.summary.hasNegativeBalance).toBe(true);
    expect(stmt.usd.summary.hasNegativeBalance).toBe(false);
  });

  it("aliases legacy se mantienen alineados con totales contables", () => {
    const stmt = buildClientAccountStatement({
      invoices: [invoice({ id: "i1", date: "2026-01-15", total: 12300, currency: "UYU" })],
      receipts: [receipt({ id: "r1", date: "2026-02-05", amount: 5000, currency: "UYU" })],
    });
    expect(stmt.uyu.summary.totalInvoiced).toBe(stmt.uyu.summary.totalDebit);
    expect(stmt.uyu.summary.totalCollected).toBe(stmt.uyu.summary.totalCredit);
    expect(stmt.uyu.summary.pendingBalance).toBe(stmt.uyu.summary.finalBalance);
  });

  // -------------------------------------------------------------------------
  // Capa financiera (`ledgerMode: true`)
  //
  // La regla de negocio "una factura cobrada debe seguir apareciendo en el
  // estado de cuenta histórico aunque esté inactiva operacionalmente" se
  // cumple aquí: el helper deja pasar `is_active=false` cuando el caller
  // explícitamente lo solicita, sin tocar DB ni sync.
  // -------------------------------------------------------------------------
  describe("ledgerMode", () => {
    it("default operacional: descarta facturas con is_active=false", () => {
      const stmt = buildClientAccountStatement({
        invoices: [
          invoice({ id: "i1", date: "2026-02-18", total: 1037, currency: "USD" }),
          invoice({
            id: "i2",
            date: "2026-04-06",
            total: 366,
            currency: "USD",
            active: false,
          }),
        ],
        receipts: [],
      });
      expect(stmt.usd.summary.movementCount).toBe(1);
      expect(stmt.usd.summary.totalDebit).toBe(1037);
    });

    it("ledgerMode=true: incluye facturas inactivas (caso A-2863)", () => {
      const stmt = buildClientAccountStatement({
        invoices: [
          invoice({ id: "i1", number: "A-2773", date: "2026-02-18", total: 1037, currency: "USD" }),
          invoice({ id: "i2", number: "A-2809", date: "2026-03-09", total: 366, currency: "USD" }),
          invoice({
            id: "i3",
            number: "A-2863",
            date: "2026-04-06",
            total: 366,
            currency: "USD",
            active: false,
          }),
        ],
        receipts: [
          receipt({ id: "r1", number: "A-587", date: "2026-02-24", amount: 1037, currency: "USD" }),
        ],
        ledgerMode: true,
      });
      expect(stmt.usd.summary.movementCount).toBe(4);
      expect(stmt.usd.summary.totalDebit).toBe(1037 + 366 + 366);
      expect(stmt.usd.summary.totalCredit).toBe(1037);
      expect(stmt.usd.summary.finalBalance).toBe(732);
    });

    it("ledgerMode=true: incluye recibos inactivos en el saldo histórico", () => {
      const stmt = buildClientAccountStatement({
        invoices: [
          invoice({ id: "i1", date: "2026-02-18", total: 1037, currency: "USD" }),
        ],
        receipts: [
          receipt({
            id: "r1",
            date: "2026-02-24",
            amount: 1037,
            currency: "USD",
            active: false,
          }),
        ],
        ledgerMode: true,
      });
      expect(stmt.usd.summary.totalCredit).toBe(1037);
      expect(stmt.usd.summary.finalBalance).toBe(0);
    });

    it("ledgerMode no afecta el filtrado por moneda ni totales <= 0", () => {
      const stmt = buildClientAccountStatement({
        invoices: [
          invoice({ id: "i1", date: "2026-02-18", total: 0, currency: "USD", active: false }),
          invoice({ id: "i2", date: "2026-02-18", total: 1000, currency: null, active: false }),
        ],
        receipts: [],
        ledgerMode: true,
      });
      expect(stmt.usd.summary.movementCount).toBe(0);
      expect(stmt.uyu.summary.movementCount).toBe(0);
      expect(stmt.unknownCurrencyCount).toBe(1);
    });
  });

  it("rellena `detail` desde payment_method/reference (recibo) y category (factura)", () => {
    const stmt = buildClientAccountStatement({
      invoices: [
        {
          id: "i1",
          invoice_number: "F-1",
          issue_date: "2026-01-15",
          total_amount: 1000,
          currency_code: "UYU",
          is_active: true,
          category: "Zeta / comprobantes por cliente",
        },
      ],
      receipts: [
        {
          id: "r1",
          receipt_number: "R-1",
          receipt_date: "2026-01-20",
          amount: 200,
          currency_code: "UYU",
          is_active: true,
          payment_method: "Transferencia",
          reference: "TRF-001",
        },
      ],
    });
    const factura = stmt.uyu.movements.find((m) => m.kind === "invoice")!;
    const recibo = stmt.uyu.movements.find((m) => m.kind === "receipt")!;
    expect(factura.detail).toBe("Zeta / comprobantes por cliente");
    expect(recibo.detail).toBe("Transferencia · TRF-001");
  });
});

describe("formatStatementAmount", () => {
  const cases: Array<[number, AccountStatementCurrency, string]> = [
    [12300, "UYU", "$ 12.300"],
    [305, "USD", "U$S 305"],
    [318.36, "USD", "U$S 318,36"],
    [0, "UYU", "$ 0"],
  ];
  for (const [value, cur, expected] of cases) {
    it(`formatea ${value} ${cur} → ${expected}`, () => {
      expect(formatStatementAmount(value, cur)).toBe(expected);
    });
  }

  it("respeta showZero=false para casillas vacías", () => {
    expect(formatStatementAmount(0, "UYU", { showZero: false })).toBe("");
    expect(formatStatementAmount(0, "USD", { showZero: false })).toBe("");
  });

  it("valor no finito → '—'", () => {
    expect(formatStatementAmount(NaN, "UYU")).toBe("—");
    expect(formatStatementAmount(Infinity, "USD")).toBe("—");
  });
});

describe("describeMovementKind", () => {
  it("etiquetas en español", () => {
    expect(describeMovementKind("invoice")).toBe("Factura");
    expect(describeMovementKind("receipt")).toBe("Recibo");
    expect(describeMovementKind("credit_note")).toBe("Nota de crédito");
  });
});
