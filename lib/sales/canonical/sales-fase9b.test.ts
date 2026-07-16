import { describe, it, expect } from "vitest";

import { buildCanonicalSaleDocuments, type RawSaleInvoiceRow } from "@/lib/sales/canonical/build-canonical-sales";
import {
  buildSalesPeriodSnapshot,
  buildProductSalesSummary,
  buildCustomerSalesSummary,
  buildSalespersonSummary,
  buildSalesComparison,
} from "@/lib/sales/canonical/sales-aggregations";
import { buildSalesExecutiveInsights } from "@/lib/sales/canonical/sales-insights";
import type { CanonicalSaleDocument } from "@/lib/sales/canonical/types";

const WS = "ws-1";
const FROM = "2026-07-01";
const TO = "2026-07-31";

type LineSpec = { concepto: string; codigo?: string; cantidad?: string; neto: string; iva: string; total: string };

function invoice(opts: {
  id: string;
  date: string;
  moneda: "1" | "2";
  cfe?: number;
  cliente?: string;
  total: number;
  paid?: number;
  balance?: number;
  lines?: LineSpec[];
}): RawSaleInvoiceRow {
  const lineas = (opts.lines ?? []).map((l) => ({
    Concepto: l.concepto,
    ArticuloCodigo: l.codigo ?? "",
    Cantidad: l.cantidad ?? "1.00000",
    PrecioUnitario: l.neto,
    Neto: l.neto,
    IVA: l.iva,
    Total: l.total,
  }));
  return {
    id: opts.id,
    invoice_number: `ZETA:CCV1:0:${opts.cliente ?? "1"}:A:${opts.id}`,
    company_id: opts.cliente ?? "1",
    issue_date: opts.date,
    currency_code: opts.moneda === "1" ? "UYU" : "USD",
    total_amount: opts.total,
    paid_amount: opts.paid ?? 0,
    balance_amount: opts.balance ?? opts.total,
    status: "issued",
    is_active: true,
    zeta_metadata: {
      zeta_customer_voucher_v1: {
        cfe_tipo: String(opts.cfe ?? 111),
        raw_payload: {
          Serie: "A",
          Numero: opts.id,
          CFETipo: opts.cfe ?? 111,
          MonedaCodigo: opts.moneda,
          ClienteCodigo: opts.cliente ?? "1",
          VendedorCodigo: "",
          Lineas: lineas,
        },
      },
    },
  };
}

/** Adjunta comercial a un documento (como lo hace la data-source desde 2026-07-01). */
function assign(docs: CanonicalSaleDocument[], id: string, spId: string, spName: string): void {
  const doc = docs.find((d) => d.documentId === id);
  if (doc) {
    doc.salespersonId = spId;
    doc.salespersonName = spName;
  }
}

function scenario(): CanonicalSaleDocument[] {
  return buildCanonicalSaleDocuments({
    workspaceId: WS,
    rows: [
      // USD, cliente A (nuevo), Gestión de Pauta
      invoice({ id: "1", date: "2026-07-03", moneda: "2", cliente: "A", total: 500, paid: 500, balance: 0, lines: [{ concepto: "Gestión de Pauta", cantidad: "5.00000", neto: "410", iva: "90", total: "500" }] }),
      // USD, cliente B, Diseño
      invoice({ id: "2", date: "2026-07-10", moneda: "2", cliente: "B", total: 300, lines: [{ concepto: "Diseño", cantidad: "2.00000", neto: "246", iva: "54", total: "300" }] }),
      // UYU, cliente C, Consultoría
      invoice({ id: "3", date: "2026-07-15", moneda: "1", cliente: "C", total: 12200, lines: [{ concepto: "Consultoría", cantidad: "1.00000", neto: "10000", iva: "2200", total: "12200" }] }),
    ],
  });
}

describe("FASE 9B · paridad de agregaciones", () => {
  it("la suma de productos reconcilia con ventas emitidas por moneda", () => {
    const docs = scenario();
    const snap = buildSalesPeriodSnapshot(docs, FROM, TO);
    const products = buildProductSalesSummary(docs, FROM, TO);

    const sumUyu = products.reduce((s, p) => s + p.totalByCurrency.UYU, 0);
    const sumUsd = products.reduce((s, p) => s + p.totalByCurrency.USD, 0);

    expect(Math.round(sumUyu * 100) / 100).toBe(snap.salesEmitted.UYU);
    expect(Math.round(sumUsd * 100) / 100).toBe(snap.salesEmitted.USD);
    expect(snap.salesEmitted.USD).toBe(800);
    expect(snap.salesEmitted.UYU).toBe(12200);
  });

  it("la suma de comerciales reconcilia con ventas emitidas por moneda", () => {
    const docs = scenario();
    assign(docs, "1", "sp-daniel", "Daniel");
    assign(docs, "2", "sp-juanma", "Juanma");
    // doc 3 queda sin asignar

    const snap = buildSalesPeriodSnapshot(docs, FROM, TO);
    const people = buildSalespersonSummary(docs, FROM, TO);

    const sumUyu = people.reduce((s, p) => s + p.salesByCurrency.UYU, 0);
    const sumUsd = people.reduce((s, p) => s + p.salesByCurrency.USD, 0);
    expect(Math.round(sumUyu * 100) / 100).toBe(snap.salesEmitted.UYU);
    expect(Math.round(sumUsd * 100) / 100).toBe(snap.salesEmitted.USD);
  });
});

describe("FASE 9B · comerciales", () => {
  it("agrupa por comercial y deja 'Sin asignar' al final", () => {
    const docs = scenario();
    assign(docs, "1", "sp-daniel", "Daniel");
    assign(docs, "2", "sp-daniel", "Daniel");
    // doc 3 sin asignar

    const people = buildSalespersonSummary(docs, FROM, TO);
    const daniel = people.find((p) => p.salespersonId === "sp-daniel")!;
    const unassigned = people.find((p) => p.salespersonId === null)!;

    expect(daniel.invoiceCount).toBe(2);
    expect(daniel.salesByCurrency.USD).toBe(800);
    expect(unassigned.salespersonName).toBe("Sin asignar");
    expect(people[people.length - 1]!.salespersonId).toBeNull();
    // participación USD de Daniel = 100% (único con ventas USD)
    expect(daniel.shareByCurrency.USD).toBe(100);
  });

  it("cuenta clientes nuevos por comercial", () => {
    const docs = scenario();
    assign(docs, "1", "sp-daniel", "Daniel"); // cliente A, primera compra en el período → nuevo
    const people = buildSalespersonSummary(docs, FROM, TO);
    const daniel = people.find((p) => p.salespersonId === "sp-daniel")!;
    expect(daniel.newCustomerCount).toBe(1);
    expect(daniel.topProductName).toBe("Gestión de Pauta");
  });
});

describe("FASE 9B · insights", () => {
  it("produce insights determinísticos, como máximo 5, sin porcentajes de base cero", () => {
    const docs = scenario();
    assign(docs, "1", "sp-daniel", "Daniel");
    const snapshot = buildSalesPeriodSnapshot(docs, FROM, TO);
    const comparison = buildSalesComparison(docs, FROM, TO, "2026-06-01", "2026-06-30");
    const products = buildProductSalesSummary(docs, FROM, TO);
    const customers = buildCustomerSalesSummary(docs, FROM, TO);
    const salespersons = buildSalespersonSummary(docs, FROM, TO);

    const insights = buildSalesExecutiveInsights({
      snapshot,
      comparison,
      products,
      customers,
      salespersons,
      comparisonLabel: "el mes anterior",
    });

    expect(insights.length).toBeGreaterThan(0);
    expect(insights.length).toBeLessThanOrEqual(5);
    // Sin base comparable (junio = 0) → no debe emitir variación porcentual.
    expect(insights.some((i) => /crecieron|bajaron/.test(i.text))).toBe(false);
    // El servicio más vendido por unidades es "Gestión de Pauta" (5 u).
    expect(insights.some((i) => i.text.includes("Gestión de Pauta"))).toBe(true);
    // Ningún texto con NaN o undefined.
    expect(insights.every((i) => !/NaN|undefined/.test(i.text))).toBe(true);
  });

  it("es estable: misma entrada, mismos ids en el mismo orden", () => {
    const docs = scenario();
    const args = () => ({
      snapshot: buildSalesPeriodSnapshot(docs, FROM, TO),
      comparison: buildSalesComparison(docs, FROM, TO, "2026-06-01", "2026-06-30"),
      products: buildProductSalesSummary(docs, FROM, TO),
      customers: buildCustomerSalesSummary(docs, FROM, TO),
      salespersons: buildSalespersonSummary(docs, FROM, TO),
      comparisonLabel: "el mes anterior",
    });
    const a = buildSalesExecutiveInsights(args()).map((i) => i.id);
    const b = buildSalesExecutiveInsights(args()).map((i) => i.id);
    expect(a).toEqual(b);
  });
});
