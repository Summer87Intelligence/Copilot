import { describe, expect, it } from "vitest";

import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import type { ClientCompanyDetail } from "@/lib/copilot-clients-portfolio";

import { buildDebtorsReportModel } from "./build-debtors-report-model";
import { describeActiveDebtorsReportFilters } from "./debtors-report-filters";
import { DEFAULT_DEBTORS_REPORT_FILTERS } from "./debtors-report-types";

function baseRow(overrides: Partial<ClientPortfolioRow> = {}): ClientPortfolioRow {
  return {
    company_id: "c1",
    name: "Cliente Test",
    industry: "",
    total_billing: 0,
    total_debt: 0,
    overdue_debt: 0,
    invoices_count: 0,
    receipts_count: 0,
    share_pct: 0,
    payment_behavior: "medio",
    risk: "Medio",
    source: "contact",
    has_contact_data: true,
    contact_email: "a@test.com",
    contact_phone: "099123456",
    derived_from_debt: false,
    debt_uyu: 0,
    debt_usd: 0,
    ...overrides,
  };
}

const EMITTED = new Date("2026-05-28T12:00:00.000Z");

describe("buildDebtorsReportModel", () => {
  it("excluye clientes sin deuda", () => {
    const model = buildDebtorsReportModel({
      portfolioRows: [baseRow({ debt_uyu: 0, debt_usd: 0 })],
      filters: DEFAULT_DEBTORS_REPORT_FILTERS,
      emittedAt: EMITTED,
    });
    expect(model.rows).toHaveLength(0);
  });

  it("separa UYU y USD en dos filas", () => {
    const model = buildDebtorsReportModel({
      portfolioRows: [
        baseRow({ debt_uyu: 1000, debt_usd: 500, overdue_uyu: 0, overdue_usd: 0 }),
      ],
      filters: DEFAULT_DEBTORS_REPORT_FILTERS,
      emittedAt: EMITTED,
    });
    expect(model.rows).toHaveLength(2);
    expect(model.rows.map((r) => r.currency).sort()).toEqual(["USD", "UYU"]);
  });

  it("filtra solo UYU", () => {
    const model = buildDebtorsReportModel({
      portfolioRows: [baseRow({ debt_uyu: 25000, debt_usd: 1000 })],
      filters: { ...DEFAULT_DEBTORS_REPORT_FILTERS, currency: "UYU" },
      emittedAt: EMITTED,
    });
    expect(model.rows).toHaveLength(1);
    expect(model.rows[0]?.currency).toBe("UYU");
  });

  it("filtra solo USD", () => {
    const model = buildDebtorsReportModel({
      portfolioRows: [baseRow({ debt_uyu: 25000, debt_usd: 1000 })],
      filters: { ...DEFAULT_DEBTORS_REPORT_FILTERS, currency: "USD" },
      emittedAt: EMITTED,
    });
    expect(model.rows).toHaveLength(1);
    expect(model.rows[0]?.currency).toBe("USD");
  });

  it("minUyu 20000 filtra correctamente", () => {
    const model = buildDebtorsReportModel({
      portfolioRows: [
        baseRow({ company_id: "a", name: "A", debt_uyu: 15000 }),
        baseRow({ company_id: "b", name: "B", debt_uyu: 25742 }),
      ],
      filters: { ...DEFAULT_DEBTORS_REPORT_FILTERS, minUyu: 20000 },
      emittedAt: EMITTED,
    });
    expect(model.rows).toHaveLength(1);
    expect(model.rows[0]?.clientName).toBe("B");
  });

  it("minUsd 1000 filtra correctamente", () => {
    const model = buildDebtorsReportModel({
      portfolioRows: [
        baseRow({ company_id: "a", debt_usd: 500 }),
        baseRow({ company_id: "b", debt_usd: 1200 }),
      ],
      filters: { ...DEFAULT_DEBTORS_REPORT_FILTERS, minUsd: 1000 },
      emittedAt: EMITTED,
    });
    expect(model.rows).toHaveLength(1);
    expect(model.rows[0]?.debtAmount).toBe(1200);
  });

  it("overdueDays exacto contra emittedAt", () => {
    const details: Record<string, ClientCompanyDetail> = {
      c1: {
        company_id: "c1",
        company_name: "El País",
        industry: "",
        contacts: [],
        invoices: [
          {
            id: "inv1",
            invoice_number: "1",
            issue_date: "2026-01-01",
            due_date: "2026-03-13",
            total_amount: 17080,
            balance_amount: 17080,
            status: "open",
            currency_code: "UYU",
          },
        ],
        receipts: [],
        overdue_debt: 17080,
        total_debt: 25742,
        payment_behavior: "lento",
        risk: "Alto",
        share_pct: 0,
        total_billing: 0,
        debt_uyu: 25742,
        overdue_uyu: 17080,
      },
    };

    const model = buildDebtorsReportModel({
      portfolioRows: [
        baseRow({
          company_id: "c1",
          name: "El País S.A.",
          debt_uyu: 25742,
          overdue_uyu: 17080,
          risk: "Alto",
        }),
      ],
      details,
      filters: DEFAULT_DEBTORS_REPORT_FILTERS,
      emittedAt: EMITTED,
    });

    expect(model.rows[0]?.overdueDays).toBe(76);
    expect(model.rows[0]?.overdueDaysLabel).toBe("76 días");
    expect(model.rows[0]?.statusLabel).toBe("Crítico");
  });

  it("no incluye filtros default en filtersLabel", () => {
    const model = buildDebtorsReportModel({
      portfolioRows: [baseRow({ debt_uyu: 100 })],
      filters: DEFAULT_DEBTORS_REPORT_FILTERS,
      emittedAt: EMITTED,
    });
    expect(model.filtersLabel).toEqual([]);
  });

  it("sin vencimiento usa — en antigüedad", () => {
    const model = buildDebtorsReportModel({
      portfolioRows: [baseRow({ debt_uyu: 100, overdue_uyu: 0 })],
      filters: DEFAULT_DEBTORS_REPORT_FILTERS,
      emittedAt: EMITTED,
    });
    expect(model.rows[0]?.overdueDaysLabel).toBe("—");
    expect(model.rows[0]?.statusLabel).toBe("Pendiente");
  });

  it("orden all: UYU desc primero, USD desc después", () => {
    const model = buildDebtorsReportModel({
      portfolioRows: [
        baseRow({ company_id: "u1", name: "B UYU", debt_uyu: 1000, debt_usd: 0 }),
        baseRow({ company_id: "u2", name: "A UYU", debt_uyu: 5000, debt_usd: 0 }),
        baseRow({ company_id: "d1", name: "Z USD", debt_uyu: 0, debt_usd: 800 }),
        baseRow({ company_id: "d2", name: "Y USD", debt_uyu: 0, debt_usd: 3000 }),
      ],
      filters: DEFAULT_DEBTORS_REPORT_FILTERS,
      emittedAt: EMITTED,
    });
    expect(model.rows.map((r) => `${r.currency}:${r.clientName}`)).toEqual([
      "UYU:A UYU",
      "UYU:B UYU",
      "USD:Y USD",
      "USD:Z USD",
    ]);
  });

  it("orden UYU desc", () => {
    const model = buildDebtorsReportModel({
      portfolioRows: [
        baseRow({ company_id: "a", name: "A", debt_uyu: 100 }),
        baseRow({ company_id: "b", name: "B", debt_uyu: 500 }),
      ],
      filters: { ...DEFAULT_DEBTORS_REPORT_FILTERS, currency: "UYU" },
      emittedAt: EMITTED,
    });
    expect(model.rows[0]?.debtAmount).toBe(500);
    expect(model.rows[1]?.debtAmount).toBe(100);
  });

  it("orden USD desc", () => {
    const model = buildDebtorsReportModel({
      portfolioRows: [
        baseRow({ company_id: "a", debt_usd: 200 }),
        baseRow({ company_id: "b", debt_usd: 900 }),
      ],
      filters: { ...DEFAULT_DEBTORS_REPORT_FILTERS, currency: "USD" },
      emittedAt: EMITTED,
    });
    expect(model.rows[0]?.debtAmount).toBe(900);
  });

  it("empate ordena por vencido desc y nombre asc", () => {
    const model = buildDebtorsReportModel({
      portfolioRows: [
        baseRow({
          company_id: "b",
          name: "Beta",
          debt_uyu: 1000,
          overdue_uyu: 50,
        }),
        baseRow({
          company_id: "a",
          name: "Alfa",
          debt_uyu: 1000,
          overdue_uyu: 200,
        }),
        baseRow({
          company_id: "c",
          name: "Gamma",
          debt_uyu: 1000,
          overdue_uyu: 200,
        }),
      ],
      filters: DEFAULT_DEBTORS_REPORT_FILTERS,
      emittedAt: EMITTED,
    });
    expect(model.rows.map((r) => r.clientName)).toEqual(["Alfa", "Gamma", "Beta"]);
  });

  it("contacto inválido muestra Sin contacto", () => {
    const model = buildDebtorsReportModel({
      portfolioRows: [
        baseRow({
          debt_uyu: 100,
          contact_phone: "22",
          contact_email: "bad",
          has_contact_data: true,
        }),
      ],
      filters: DEFAULT_DEBTORS_REPORT_FILTERS,
      emittedAt: EMITTED,
    });
    expect(model.rows[0]?.contactLabel).toBe("Sin contacto");
  });

  it("describeActiveDebtorsReportFilters vacío con defaults", () => {
    expect(describeActiveDebtorsReportFilters(DEFAULT_DEBTORS_REPORT_FILTERS)).toEqual([]);
  });

  it("filtra vencidos más de 30 días", () => {
    const details: Record<string, ClientCompanyDetail> = {
      c1: {
        company_id: "c1",
        company_name: "A",
        industry: "",
        contacts: [],
        invoices: [
          {
            id: "i1",
            invoice_number: "1",
            issue_date: "2026-01-01",
            due_date: "2026-03-13",
            total_amount: 100,
            balance_amount: 100,
            status: "open",
            currency_code: "UYU",
          },
        ],
        receipts: [],
        overdue_debt: 100,
        total_debt: 100,
        payment_behavior: "medio",
        risk: "Medio",
        share_pct: 0,
        total_billing: 0,
      },
      c2: {
        company_id: "c2",
        company_name: "B",
        industry: "",
        contacts: [],
        invoices: [
          {
            id: "i2",
            invoice_number: "2",
            issue_date: "2026-04-20",
            due_date: "2026-05-10",
            total_amount: 100,
            balance_amount: 100,
            status: "open",
            currency_code: "UYU",
          },
        ],
        receipts: [],
        overdue_debt: 100,
        total_debt: 100,
        payment_behavior: "medio",
        risk: "Medio",
        share_pct: 0,
        total_billing: 0,
      },
    };

    const model = buildDebtorsReportModel({
      portfolioRows: [
        baseRow({ company_id: "c1", debt_uyu: 100, overdue_uyu: 100 }),
        baseRow({ company_id: "c2", debt_uyu: 100, overdue_uyu: 100 }),
      ],
      details,
      filters: { ...DEFAULT_DEBTORS_REPORT_FILTERS, overdueDays: "30" },
      emittedAt: EMITTED,
    });

    expect(model.rows).toHaveLength(1);
    expect(model.rows[0]?.clientId).toBe("c1");
  });

  it("filtra sin contacto", () => {
    const model = buildDebtorsReportModel({
      portfolioRows: [
        baseRow({ company_id: "a", debt_uyu: 100, has_contact_data: true }),
        baseRow({
          company_id: "b",
          debt_uyu: 200,
          has_contact_data: false,
          contact_email: null,
          contact_phone: null,
        }),
      ],
      filters: { ...DEFAULT_DEBTORS_REPORT_FILTERS, contact: "without_contact" },
      emittedAt: EMITTED,
    });
    expect(model.rows).toHaveLength(1);
    expect(model.rows[0]?.contactLabel).toBe("Sin contacto");
  });

  it("totales UYU/USD separados", () => {
    const model = buildDebtorsReportModel({
      portfolioRows: [
        baseRow({
          debt_uyu: 10000,
          debt_usd: 500,
          overdue_uyu: 3000,
          overdue_usd: 100,
        }),
      ],
      filters: DEFAULT_DEBTORS_REPORT_FILTERS,
      emittedAt: EMITTED,
    });
    expect(model.totals.totalDebtUyu).toBe(10000);
    expect(model.totals.totalDebtUsd).toBe(500);
    expect(model.totals.totalOverdueUyu).toBe(3000);
    expect(model.totals.totalOverdueUsd).toBe(100);
  });

  it("cliente con deuda en ambas monedas genera dos filas", () => {
    const model = buildDebtorsReportModel({
      portfolioRows: [baseRow({ debt_uyu: 1, debt_usd: 2 })],
      filters: DEFAULT_DEBTORS_REPORT_FILTERS,
      emittedAt: EMITTED,
    });
    expect(model.totals.clientsCount).toBe(2);
  });

  it("empty state cuando ningún cliente califica", () => {
    const model = buildDebtorsReportModel({
      portfolioRows: [baseRow({ debt_uyu: 5000 })],
      filters: { ...DEFAULT_DEBTORS_REPORT_FILTERS, minUyu: 20000 },
      emittedAt: EMITTED,
    });
    expect(model.rows).toHaveLength(0);
    expect(model.totals.clientsCount).toBe(0);
  });

  it("filtra solo vencidos", () => {
    const model = buildDebtorsReportModel({
      portfolioRows: [
        baseRow({ company_id: "a", debt_uyu: 100, overdue_uyu: 50 }),
        baseRow({ company_id: "b", debt_uyu: 100, overdue_uyu: 0 }),
      ],
      filters: { ...DEFAULT_DEBTORS_REPORT_FILTERS, status: "overdue" },
      emittedAt: EMITTED,
    });
    expect(model.rows).toHaveLength(1);
    expect(model.rows[0]?.clientId).toBe("a");
  });
});
