import { describe, expect, it } from "vitest";

import {
  buildAnnualSalesYtd,
  buildCeoIndicators,
  buildMonthlySalesYear,
  topDebtorByCurrency,
  topDebtorsByCurrency,
  type CeoInvoiceInput,
  type CeoPortfolioRow,
} from "@/lib/copilot-finanzas-ceo-derivations";

const ASOF = new Date(Date.UTC(2026, 5, 15)); // jun 2026

function inv(p: Partial<CeoInvoiceInput>): CeoInvoiceInput {
  return {
    company_id: "c1",
    issue_date: "2026-03-10",
    currency_code: "UYU",
    total_amount: 1000,
    is_active: true,
    status: "issued",
    zeta_metadata: null,
    ...p,
  };
}

describe("buildMonthlySalesYear", () => {
  it("12 buckets siempre", () => {
    const rows = buildMonthlySalesYear([], 2026, ASOF);
    expect(rows).toHaveLength(12);
    expect(rows[0]!.monthShortEs).toBe("ENE");
    expect(rows[11]!.monthShortEs).toBe("DIC");
  });

  it("acumula por mes y moneda, NC restan", () => {
    const rows = buildMonthlySalesYear(
      [
        inv({ issue_date: "2026-01-05", total_amount: 5000, currency_code: "UYU" }),
        inv({ issue_date: "2026-01-15", total_amount: 200, currency_code: "USD" }),
        inv({
          issue_date: "2026-01-20",
          total_amount: 1000,
          currency_code: "UYU",
          zeta_metadata: { zeta_customer_voucher_v1: { cfe_tipo: "102" } },
        }),
      ],
      2026,
      ASOF
    );
    expect(rows[0]!.sales.UYU).toBe(4000);
    expect(rows[0]!.sales.USD).toBe(200);
  });

  it("ignora void y is_active=false", () => {
    const rows = buildMonthlySalesYear(
      [
        inv({ status: "void", total_amount: 9999 }),
        inv({ is_active: false, total_amount: 8888 }),
        inv({ total_amount: 100 }),
      ],
      2026,
      ASOF
    );
    expect(rows[2]!.sales.UYU).toBe(100);
  });

  it("marca closed correctamente", () => {
    const rows = buildMonthlySalesYear([], 2026, ASOF);
    expect(rows[0]!.closed).toBe(true);
    expect(rows[5]!.closed).toBe(false);
    expect(rows[6]!.closed).toBe(false);
  });

  it("ignora facturas de otro año", () => {
    const rows = buildMonthlySalesYear(
      [inv({ issue_date: "2025-12-30", total_amount: 7777 })],
      2026,
      ASOF
    );
    expect(rows[0]!.sales.UYU).toBe(0);
  });
});

describe("topDebtorsByCurrency", () => {
  const portfolio: CeoPortfolioRow[] = [
    { company_id: "c1", name: "ACME", debt_uyu: 500, debt_usd: 0 },
    { company_id: "c2", name: "BETA", debt_uyu: 100, debt_usd: 20 },
    { company_id: "c3", name: "GAMMA", debt_uyu: 0, debt_usd: 50 },
  ];

  it("ordena UYU solo por debt_uyu (sin conversión USD)", () => {
    const rows = topDebtorsByCurrency(portfolio, "UYU", 10);
    expect(rows.map((r) => r.companyId)).toEqual(["c1", "c2"]);
    expect(rows[0]!.amount).toBe(500);
  });

  it("ordena USD solo por debt_usd (sin conversión UYU)", () => {
    const rows = topDebtorsByCurrency(portfolio, "USD", 10);
    expect(rows.map((r) => r.companyId)).toEqual(["c3", "c2"]);
    expect(rows[0]!.amount).toBe(50);
  });

  it("topDebtorByCurrency devuelve el mayor por moneda", () => {
    expect(topDebtorByCurrency(portfolio, "UYU")?.companyId).toBe("c1");
    expect(topDebtorByCurrency(portfolio, "USD")?.companyId).toBe("c3");
  });

  it("USD alto no desplaza ranking UYU", () => {
    const mixed: CeoPortfolioRow[] = [
      { company_id: "uyu", name: "UYU Co", debt_uyu: 200, debt_usd: 0 },
      { company_id: "usd", name: "USD Co", debt_uyu: 0, debt_usd: 999 },
    ];
    expect(topDebtorByCurrency(mixed, "UYU")?.companyId).toBe("uyu");
    expect(topDebtorByCurrency(mixed, "USD")?.companyId).toBe("usd");
  });
});

describe("buildCeoIndicators", () => {
  it("cuenta clientes con vencido y >30 días", () => {
    const portfolio: CeoPortfolioRow[] = [
      { company_id: "c1", name: "A", debt_uyu: 100, overdue_uyu: 50, overdue_days: 45 },
      { company_id: "c2", name: "B", debt_uyu: 80, overdue_uyu: 10, overdue_days: 10 },
      { company_id: "c3", name: "C", debt_uyu: 50, overdue_uyu: 0 },
    ];
    const r = buildCeoIndicators(portfolio, ASOF);
    expect(r.totalClients).toBe(3);
    expect(r.totalClientsWithOverdue).toBe(2);
    expect(r.clientsOver30).toBe(1);
    expect(r.overdueAmount.UYU).toBe(60);
  });

  it("no expone rankings consolidados cross-moneda", () => {
    const r = buildCeoIndicators([], ASOF);
    expect(r).not.toHaveProperty("topDebtor");
    expect(r).not.toHaveProperty("topGrowthClient");
    expect(r).not.toHaveProperty("topDropClient");
  });
});

describe("buildAnnualSalesYtd", () => {
  it("acumula año correcto, ignora otros años", () => {
    const result = buildAnnualSalesYtd(
      [
        inv({ issue_date: "2026-01-01", total_amount: 100, currency_code: "UYU" }),
        inv({ issue_date: "2026-06-01", total_amount: 200, currency_code: "USD" }),
        inv({ issue_date: "2025-12-31", total_amount: 9999, currency_code: "UYU" }),
      ],
      2026
    );
    expect(result.UYU).toBe(100);
    expect(result.USD).toBe(200);
  });

  it("NC restan al neto y nunca cae bajo 0", () => {
    const result = buildAnnualSalesYtd(
      [
        inv({ issue_date: "2026-01-01", total_amount: 100, currency_code: "UYU" }),
        inv({
          issue_date: "2026-02-01",
          total_amount: 1000,
          currency_code: "UYU",
          zeta_metadata: { zeta_customer_voucher_v1: { cfe_tipo: "102" } },
        }),
      ],
      2026
    );
    expect(result.UYU).toBe(0);
  });
});

describe("buildMonthlySalesYear — shadow dedup", () => {
  it("CCV1 + shadow mismo cliente/fecha/importe: solo cuenta CCV1", () => {
    const ccv1 = inv({
      id: "ccv1-1",
      invoice_number: "ZETA:CCV1:100",
      company_id: "c1",
      issue_date: "2026-06-10",
      currency_code: "UYU",
      total_amount: 5000,
    });
    const shadow = inv({
      id: "shadow-1",
      invoice_number: "ZETA:2850",
      company_id: "c1",
      issue_date: "2026-06-10",
      currency_code: "UYU",
      total_amount: 5000,
    });
    const rows = buildMonthlySalesYear([ccv1, shadow], 2026, ASOF);
    expect(rows[5]!.sales.UYU).toBe(5000); // June = index 5
  });

  it("shadow sin par CCV1 (orphan): sigue contando", () => {
    const orphan = inv({
      id: "orphan-1",
      invoice_number: "ZETA:9999",
      company_id: "c1",
      issue_date: "2026-06-10",
      currency_code: "UYU",
      total_amount: 3000,
    });
    const rows = buildMonthlySalesYear([orphan], 2026, ASOF);
    expect(rows[5]!.sales.UYU).toBe(3000);
  });

  it("NC sigue restando después del dedup", () => {
    const ccv1 = inv({
      id: "ccv1-2",
      invoice_number: "ZETA:CCV1:200",
      company_id: "c1",
      issue_date: "2026-03-10",
      currency_code: "UYU",
      total_amount: 2000,
    });
    const nc = inv({
      id: "nc-1",
      issue_date: "2026-03-15",
      currency_code: "UYU",
      total_amount: 500,
      zeta_metadata: { zeta_customer_voucher_v1: { cfe_tipo: "102" } },
    });
    const rows = buildMonthlySalesYear([ccv1, nc], 2026, ASOF);
    expect(rows[2]!.sales.UYU).toBe(1500); // March = index 2
  });

  it("void excluido después del dedup", () => {
    const ccv1 = inv({
      id: "ccv1-3",
      invoice_number: "ZETA:CCV1:300",
      company_id: "c1",
      issue_date: "2026-04-01",
      currency_code: "UYU",
      total_amount: 1000,
      status: "void",
    });
    const rows = buildMonthlySalesYear([ccv1], 2026, ASOF);
    expect(rows[3]!.sales.UYU).toBe(0); // April = index 3
  });
});

describe("buildAnnualSalesYtd — shadow dedup", () => {
  it("CCV1 + shadow: solo cuenta CCV1 en YTD", () => {
    const ccv1 = inv({
      id: "ytd-ccv1",
      invoice_number: "ZETA:CCV1:400",
      company_id: "c1",
      issue_date: "2026-06-01",
      currency_code: "USD",
      total_amount: 1000,
    });
    const shadow = inv({
      id: "ytd-shadow",
      invoice_number: "ZETA:4000",
      company_id: "c1",
      issue_date: "2026-06-01",
      currency_code: "USD",
      total_amount: 1000,
    });
    const result = buildAnnualSalesYtd([ccv1, shadow], 2026);
    expect(result.USD).toBe(1000);
  });
});

describe("sin heurística USD × 40", () => {
  it("el módulo de derivaciones CEO no contiene consolidación ×40", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(
      path.join(process.cwd(), "lib/copilot-finanzas-ceo-derivations.ts"),
      "utf8"
    );
    expect(source).not.toMatch(/\*\s*40/);
    expect(source).not.toMatch(/×\s*40/);
    expect(source).not.toMatch(/consolidat/i);
  });
});
