import { describe, expect, it } from "vitest";

import {
  aggregateOperationalDebtForCompany,
  buildOperationalDebtEquivalenceKey,
  isZetaSaldosPendientesShadowRow,
  operationalDebtInvoicesAreEquivalent,
  selectOperationalDebtInvoicesForSummation,
  ZETA_SALDOS_PENDIENTES_CATEGORY,
} from "@/lib/zeta/zeta-operational-debt-dedup";

const COMPANY = "co-bloommy";

function ccv1(
  id: string,
  registroId: string,
  balance: number,
  opts?: { currency?: "UYU" | "USD"; issue?: string; total?: number; due?: string }
) {
  return {
    id,
    company_id: COMPANY,
    invoice_number: `ZETA:CCV1:EMP:${COMPANY}:A:${id}`,
    category: "Zeta / factura cliente",
    total_amount: opts?.total ?? balance,
    balance_amount: balance,
    currency_code: opts?.currency ?? "UYU",
    issue_date: opts?.issue ?? "2026-03-01",
    due_date: opts?.due ?? "2026-01-31",
    zeta_metadata: {
      zeta_comprobante_identity_v1: { schema_version: 1, registro_id: registroId },
      zeta_customer_voucher_v1: { zeta_registro_id: registroId },
    },
  };
}

function shadow(registroId: string, balance: number, opts?: { currency?: "UYU" | "USD" }) {
  return {
    id: `sp-${registroId}`,
    company_id: COMPANY,
    invoice_number: `ZETA:${registroId}`,
    category: ZETA_SALDOS_PENDIENTES_CATEGORY,
    total_amount: balance,
    balance_amount: balance,
    currency_code: opts?.currency ?? "UYU",
    issue_date: "2026-03-01",
  };
}

describe("isZetaSaldosPendientesShadowRow", () => {
  it("detecta category shadow", () => {
    expect(isZetaSaldosPendientesShadowRow({ category: ZETA_SALDOS_PENDIENTES_CATEGORY })).toBe(true);
    expect(isZetaSaldosPendientesShadowRow({ category: "Zeta / factura cliente" })).toBe(false);
  });
});

describe("buildOperationalDebtEquivalenceKey", () => {
  it("shadow usa RegistroId de invoice_number ZETA:{id}", () => {
    expect(buildOperationalDebtEquivalenceKey(shadow("2574", 1000))).toBe("reg:2574");
  });

  it("CCV1 usa registro_id de metadata", () => {
    expect(buildOperationalDebtEquivalenceKey(ccv1("i1", "2574", 1000))).toBe("reg:2574");
  });
});

describe("selectOperationalDebtInvoicesForSummation", () => {
  it("1) CCV1 + shadow mismo RegistroId → cuenta una sola vez (prefiere real)", () => {
    const selections = selectOperationalDebtInvoicesForSummation([
      ccv1("real-1", "9001", 54_900),
      shadow("9001", 54_900),
    ]);
    expect(selections).toHaveLength(1);
    expect(selections[0]?.invoice.id).toBe("real-1");
    expect(selections[0]?.skippedShadowIds).toEqual(["sp-9001"]);
  });

  it("2) shadow sin factura real equivalente → se cuenta", () => {
    const selections = selectOperationalDebtInvoicesForSummation([shadow("7777", 12_000)]);
    expect(selections).toHaveLength(1);
    expect(selections[0]?.isShadow).toBe(true);
    expect(selections[0]?.invoice.id).toBe("sp-7777");
  });

  it("3) Bloommy's UYU no queda 2x", () => {
    const totals = aggregateOperationalDebtForCompany(
      [ccv1("b-real", "9001", 54_900), shadow("9001", 54_900)],
      { todayYmd: "2026-06-01" }
    );
    expect(totals.debtUYU).toBe(54_900);
    expect(totals.shadowSkippedCount).toBe(1);
  });

  it("4) DOBSURA USD no queda 2x por duplicado RegistroId", () => {
    const company = "co-dobsura";
    const totals = aggregateOperationalDebtForCompany(
      [
        {
          ...ccv1("d1", "4401", 530.7, { currency: "USD", issue: "2026-02-01" }),
          company_id: company,
        },
        {
          ...shadow("4401", 530.7, { currency: "USD" }),
          company_id: company,
        },
        {
          id: "d2",
          company_id: company,
          invoice_number: "ZETA:CCV1:EMP:co:USD:1:99",
          category: "Zeta / factura cliente",
          total_amount: 530.7,
          balance_amount: 530.7,
          currency_code: "USD",
          issue_date: "2026-04-01",
          zeta_metadata: {
            zeta_comprobante_identity_v1: { schema_version: 1, registro_id: "4402" },
          },
        },
      ],
      { todayYmd: "2026-06-01" }
    );
    expect(totals.debtUSD).toBe(1_061.4);
    expect(totals.shadowSkippedCount).toBe(1);
  });

  it("5) Fletcher UYU: shadow con mismo RegistroId que CCV1 se descarta", () => {
    const company = "co-fletcher";
    const totals = aggregateOperationalDebtForCompany(
      [
        {
          ...ccv1("f1", "3801", 29_280, { issue: "2026-01-15" }),
          company_id: company,
        },
        {
          ...shadow("3801", 14_640),
          company_id: company,
        },
      ],
      { todayYmd: "2026-06-01" }
    );
    expect(totals.debtUYU).toBe(29_280);
    expect(totals.shadowSkippedCount).toBe(1);
  });

  it("6) Fletcher UYU: A2891 + A2948 + shadow ZETA:2752 → 29.280 (no 43.920)", () => {
    const company = "co-fletcher";
    const fletcherCcv1 = (
      id: string,
      invoiceSuffix: string,
      balance: number,
      issue: string
    ) => ({
      id,
      company_id: company,
      invoice_number: `ZETA:CCV1:0:38:A:${invoiceSuffix}`,
      category: "Zeta / factura cliente",
      total_amount: balance,
      balance_amount: balance,
      currency_code: "UYU" as const,
      issue_date: issue,
      due_date: issue,
    });

    const totals = aggregateOperationalDebtForCompany(
      [
        fletcherCcv1("a2891", "2891", 14_640, "2026-05-04"),
        fletcherCcv1("a2948", "2948", 14_640, "2026-06-04"),
        {
          ...shadow("2752", 14_640),
          company_id: company,
          issue_date: "2026-06-04",
        },
      ],
      { todayYmd: "2026-06-05" }
    );
    expect(totals.debtUYU).toBe(29_280);
    expect(totals.shadowSkippedCount).toBe(1);
    expect(totals.invoiceCount).toBe(2);
  });

  it("excluye void y NC", () => {
    const selections = selectOperationalDebtInvoicesForSummation([
      {
        id: "void",
        company_id: COMPANY,
        invoice_number: "ZETA:999",
        category: ZETA_SALDOS_PENDIENTES_CATEGORY,
        total_amount: 100,
        balance_amount: 100,
        currency_code: "UYU",
        status: "void",
      },
      {
        id: "nc",
        company_id: COMPANY,
        invoice_number: "ZETA:NC:1",
        total_amount: 100,
        balance_amount: 0,
        currency_code: "UYU",
        zeta_metadata: { zeta_customer_voucher_v1: { cfe_tipo: "112" } },
      },
    ]);
    expect(selections).toHaveLength(0);
  });
});

describe("operationalDebtInvoicesAreEquivalent", () => {
  it("empareja CCV1 y shadow por RegistroId", () => {
    expect(
      operationalDebtInvoicesAreEquivalent(ccv1("a", "123", 100), shadow("123", 100))
    ).toBe(true);
  });
});

describe("aggregateOperationalDebtForCompany — overdue", () => {
  it("overdue usa fila ganadora dedupeada", () => {
    const totals = aggregateOperationalDebtForCompany(
      [
        ccv1("r1", "500", 10_000, { issue: "2026-01-01", due: "2026-01-31" }),
        { ...shadow("500", 10_000), due_date: "2026-01-31" },
      ],
      { todayYmd: "2026-06-01" }
    );
    expect(totals.debtUYU).toBe(10_000);
    expect(totals.overdueUYU).toBe(10_000);
  });

  it("empareja N shadows con N reals mismo saldo (bucket 1:1)", () => {
    const totals = aggregateOperationalDebtForCompany([
      {
        id: "r1",
        company_id: COMPANY,
        invoice_number: "ZETA:CCV1:1",
        category: "Zeta / factura cliente",
        total_amount: 54_900,
        balance_amount: 54_900,
        currency_code: "UYU",
      },
      {
        id: "r2",
        company_id: COMPANY,
        invoice_number: "ZETA:CCV1:2",
        category: "Zeta / factura cliente",
        total_amount: 54_900,
        balance_amount: 54_900,
        currency_code: "UYU",
      },
      { ...shadow("9001", 54_900), id: "s1" },
      { ...shadow("9002", 54_900), id: "s2" },
    ]);
    expect(totals.debtUYU).toBe(109_800);
    expect(totals.shadowSkippedCount).toBe(2);
  });
});
