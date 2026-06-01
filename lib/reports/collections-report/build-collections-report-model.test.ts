import { describe, expect, it } from "vitest";

import type { DataRow } from "@/lib/data/proto-operational-read-repository";

import { buildCollectionsReportModel } from "./build-collections-report-model";

function rec(overrides: Partial<DataRow> = {}): DataRow {
  return {
    id: "r1",
    receipt_date: "2026-05-15",
    amount: 1000,
    currency_code: "UYU",
    receipt_number: "ZETA:COB:100",
    company_id: "c1",
    is_active: true,
    status: "paid",
    invoice_id: null,
    ...overrides,
  };
}

const NAMES = { c1: "Cliente Uno", c2: "Cliente Dos" };

const BASE = {
  companyNames: NAMES,
  year: 2026,
  month: 5,
  currency: "UYU" as const,
  generatedAt: new Date("2026-06-01T10:00:00.000Z"),
};

describe("buildCollectionsReportModel", () => {
  it("filtra por mes correcto", () => {
    const result = buildCollectionsReportModel({
      ...BASE,
      receipts: [
        rec({ receipt_date: "2026-04-30" }),
        rec({ receipt_date: "2026-05-01" }),
        rec({ receipt_date: "2026-05-31" }),
        rec({ receipt_date: "2026-06-01" }),
      ],
    });
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.date).toBe("2026-05-31");
    expect(result.rows[1]?.date).toBe("2026-05-01");
  });

  it("filtra por año correcto", () => {
    const result = buildCollectionsReportModel({
      ...BASE,
      year: 2026,
      receipts: [
        rec({ receipt_date: "2025-05-15" }),
        rec({ receipt_date: "2026-05-15" }),
        rec({ receipt_date: "2027-05-15" }),
      ],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.date).toBe("2026-05-15");
  });

  it("filtra solo UYU", () => {
    const result = buildCollectionsReportModel({
      ...BASE,
      currency: "UYU",
      receipts: [
        rec({ currency_code: "UYU", amount: 500 }),
        rec({ id: "r2", currency_code: "USD", amount: 200 }),
      ],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.amount).toBe(500);
  });

  it("filtra solo USD", () => {
    const result = buildCollectionsReportModel({
      ...BASE,
      currency: "USD",
      receipts: [
        rec({ currency_code: "UYU", amount: 500 }),
        rec({ id: "r2", currency_code: "USD", amount: 200 }),
      ],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.amount).toBe(200);
  });

  it("excluye recibos inactivos", () => {
    const result = buildCollectionsReportModel({
      ...BASE,
      receipts: [
        rec({ is_active: true, amount: 100 }),
        rec({ id: "r2", is_active: false, amount: 999 }),
      ],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.amount).toBe(100);
  });

  it("excluye recibos no pagados", () => {
    const result = buildCollectionsReportModel({
      ...BASE,
      receipts: [
        rec({ status: "paid", amount: 300 }),
        rec({ id: "r2", status: "pending", amount: 999 }),
      ],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.amount).toBe(300);
  });

  it("ordena por fecha DESC, luego cliente ASC, luego documento ASC", () => {
    const result = buildCollectionsReportModel({
      ...BASE,
      receipts: [
        rec({ id: "r1", receipt_date: "2026-05-10", company_id: "c1", receipt_number: "ZETA:COB:100", amount: 1 }),
        rec({ id: "r2", receipt_date: "2026-05-20", company_id: "c2", receipt_number: "ZETA:COB:200", amount: 2 }),
        rec({ id: "r3", receipt_date: "2026-05-10", company_id: "c2", receipt_number: "ZETA:COB:101", amount: 3 }),
      ],
    });
    // 20/05 primero (DESC)
    expect(result.rows[0]?.date).toBe("2026-05-20");
    expect(result.rows[0]?.clientName).toBe("Cliente Dos");
    // misma fecha 10/05: Cliente Dos antes que Cliente Uno (ASC)
    expect(result.rows[1]?.date).toBe("2026-05-10");
    expect(result.rows[1]?.clientName).toBe("Cliente Dos");
    expect(result.rows[2]?.date).toBe("2026-05-10");
    expect(result.rows[2]?.clientName).toBe("Cliente Uno");
  });

  it("mismo cliente misma fecha: documentLabel ASC", () => {
    const result = buildCollectionsReportModel({
      ...BASE,
      receipts: [
        rec({ id: "r1", receipt_date: "2026-05-15", company_id: "c1", receipt_number: "ZETA:COB:300", amount: 10 }),
        rec({ id: "r2", receipt_date: "2026-05-15", company_id: "c1", receipt_number: "ZETA:COB:100", amount: 20 }),
      ],
    });
    expect(result.rows[0]?.documentLabel).toBe("COB-100");
    expect(result.rows[1]?.documentLabel).toBe("COB-300");
  });

  it("calcula total y count correctamente", () => {
    const result = buildCollectionsReportModel({
      ...BASE,
      receipts: [
        rec({ id: "r1", amount: 1000 }),
        rec({ id: "r2", amount: 2500 }),
        rec({ id: "r3", amount: 500 }),
      ],
    });
    expect(result.totals.count).toBe(3);
    expect(result.totals.amount).toBe(4000);
  });

  it("no mezcla monedas en una misma llamada", () => {
    const result = buildCollectionsReportModel({
      ...BASE,
      currency: "UYU",
      receipts: [
        rec({ currency_code: "UYU", amount: 100 }),
        rec({ id: "r2", currency_code: "USD", amount: 9999 }),
      ],
    });
    for (const row of result.rows) {
      expect(row.currency).toBe("UYU");
    }
    expect(result.totals.amount).toBe(100);
  });

  it("empty state con rows vacías y total 0", () => {
    const result = buildCollectionsReportModel({
      ...BASE,
      receipts: [],
    });
    expect(result.rows).toHaveLength(0);
    expect(result.totals.count).toBe(0);
    expect(result.totals.amount).toBe(0);
    expect(result.period.label).toBe("Mayo 2026");
  });

  it("documentLabel usa prefijo COB con número limpio", () => {
    const result = buildCollectionsReportModel({
      ...BASE,
      receipts: [rec({ receipt_number: "ZETA:COB:2741" })],
    });
    expect(result.rows[0]?.documentLabel).toBe("COB-2741");
  });

  it("documentLabel es guión cuando no hay número de recibo", () => {
    const result = buildCollectionsReportModel({
      ...BASE,
      receipts: [rec({ receipt_number: null })],
    });
    expect(result.rows[0]?.documentLabel).toBe("—");
  });

  it("period.from y period.to cubren el mes exacto", () => {
    const result = buildCollectionsReportModel({
      ...BASE,
      year: 2026,
      month: 2,
      receipts: [],
    });
    expect(result.period.from).toBe("2026-02-01");
    expect(result.period.to).toBe("2026-02-28");

    const dec = buildCollectionsReportModel({
      ...BASE,
      year: 2026,
      month: 12,
      receipts: [],
    });
    expect(dec.period.from).toBe("2026-12-01");
    expect(dec.period.to).toBe("2026-12-31");
  });
});
