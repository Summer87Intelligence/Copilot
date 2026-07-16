import { describe, it, expect } from "vitest";

import { parseSalesFilters, buildSalesOverview, buildSalesDetails } from "@/lib/sales/sales-api";
import { buildCanonicalSaleDocuments, type RawSaleInvoiceRow } from "@/lib/sales/canonical/build-canonical-sales";
import type { SalesCatalogView } from "@/lib/sales/canonical/catalog-types";

const emptyCatalog: SalesCatalogView = { categories: [], items: [], aliases: [], classifications: [] };

function inv(id: string, date: string, moneda: "1" | "2", total: number, cliente: string, concepto: string): RawSaleInvoiceRow {
  return {
    id,
    invoice_number: `ZETA:CCV1:0:${cliente}:A:${id}`,
    company_id: cliente,
    issue_date: date,
    currency_code: moneda === "1" ? "UYU" : "USD",
    total_amount: total,
    paid_amount: 0,
    balance_amount: total,
    status: "issued",
    is_active: true,
    zeta_metadata: {
      zeta_customer_voucher_v1: {
        cfe_tipo: "111",
        raw_payload: { Serie: "A", Numero: id, CFETipo: 111, MonedaCodigo: moneda, ClienteCodigo: cliente, Lineas: [{ Concepto: concepto, Cantidad: "1", Neto: String(total), IVA: "0", Total: String(total) }] },
      },
    },
  };
}

describe("parseSalesFilters", () => {
  it("defaults to this_month + same_elapsed_days", () => {
    const f = parseSalesFilters(new URLSearchParams(""), "2026-07-16");
    expect(f.preset).toBe("this_month");
    expect(f.dateFrom).toBe("2026-07-01");
    expect(f.dateTo).toBe("2026-07-16");
    expect(f.comparisonMode).toBe("same_elapsed_days");
    expect(f.comparisonDateFrom).toBe("2026-06-01");
  });

  it("parses csv filters and clamps pageSize", () => {
    const f = parseSalesFilters(new URLSearchParams("currencies=USD,UYU&productIds=a,b&pageSize=9999"), "2026-07-16");
    expect(f.currencies).toEqual(["USD", "UYU"]);
    expect(f.productIds).toEqual(["a", "b"]);
    expect(f.pageSize).toBe(200);
  });
});

describe("buildSalesOverview reconciliation", () => {
  const rows = [
    inv("1", "2026-07-02", "2", 600, "A", "Página web"),
    inv("2", "2026-07-03", "1", 1220, "B", "Gestión"),
    inv("9", "2026-06-02", "2", 400, "A", "Página web"),
  ];
  const docs = buildCanonicalSaleDocuments({ workspaceId: "ws", rows });
  const f = parseSalesFilters(new URLSearchParams("preset=this_month&comparison=previous_month"), "2026-07-16");
  const overview = buildSalesOverview(docs, emptyCatalog, f);

  it("product totals reconcile with snapshot emitted per currency", () => {
    const prodUSD = overview.products.reduce((s, p) => s + p.totalByCurrency.USD, 0);
    expect(prodUSD).toBe(overview.snapshot.salesEmitted.USD);
    expect(overview.snapshot.salesEmitted.USD).toBe(600);
    expect(overview.snapshot.salesEmitted.UYU).toBe(1220);
  });

  it("comparison uses previous month window", () => {
    expect(overview.comparisonWindow.from).toBe("2026-06-01");
    expect(overview.comparison.previous.salesEmitted.USD).toBe(400);
    expect(overview.comparison.salesPctByCurrency.USD).toBe(50);
  });
});

describe("buildSalesDetails", () => {
  const rows = [
    inv("1", "2026-07-02", "2", 600, "A", "Página web"),
    inv("2", "2026-07-03", "1", 1220, "B", "Gestión"),
  ];
  const docs = buildCanonicalSaleDocuments({ workspaceId: "ws", rows });

  it("filters by currency and paginates", () => {
    const f = parseSalesFilters(new URLSearchParams("preset=this_month&currencies=USD"), "2026-07-16");
    const res = buildSalesDetails(docs, f);
    expect(res.total).toBe(1);
    expect(res.rows[0]!.currency).toBe("USD");
  });

  it("search matches original description", () => {
    const f = parseSalesFilters(new URLSearchParams("preset=this_month&search=gesti"), "2026-07-16");
    const res = buildSalesDetails(docs, f);
    expect(res.total).toBe(1);
    expect(res.rows[0]!.originalDescription).toBe("Gestión");
  });
});
