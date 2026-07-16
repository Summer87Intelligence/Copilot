import { describe, it, expect } from "vitest";

import { buildCanonicalSaleDocuments, type RawSaleInvoiceRow } from "@/lib/sales/canonical/build-canonical-sales";
import {
  buildSalesPeriodSnapshot,
  buildProductSalesSummary,
  buildCustomerSalesSummary,
  buildSalesCollectionSummary,
  buildSalesComparison,
  buildUnclassifiedSalesSummary,
} from "@/lib/sales/canonical/sales-aggregations";
import { classifyLine, matchAliasForConcept, normalizeConceptText, conceptKey } from "@/lib/sales/canonical/sales-normalization";
import type { SalesCatalogView } from "@/lib/sales/canonical/catalog-types";

const WS = "ws-1";

type LineSpec = { concepto: string; codigo?: string; cantidad?: string; precio?: string; neto: string; iva: string; total: string };

function invoice(opts: {
  id: string;
  date: string;
  moneda: "1" | "2";
  cfe?: number;
  cliente?: string;
  total: number;
  paid?: number;
  balance?: number;
  status?: string;
  lines?: LineSpec[];
  currencyCode?: string | null;
  active?: boolean;
}): RawSaleInvoiceRow {
  const lineas = (opts.lines ?? []).map((l) => ({
    Concepto: l.concepto,
    ArticuloCodigo: l.codigo ?? "",
    Cantidad: l.cantidad ?? "1.00000",
    PrecioUnitario: l.precio ?? l.neto,
    Neto: l.neto,
    IVA: l.iva,
    Total: l.total,
  }));
  return {
    id: opts.id,
    invoice_number: `ZETA:CCV1:0:${opts.cliente ?? "1"}:A:${opts.id}`,
    company_id: opts.cliente ?? "1",
    issue_date: opts.date,
    currency_code: opts.currencyCode === undefined ? (opts.moneda === "1" ? "UYU" : "USD") : opts.currencyCode,
    total_amount: opts.total,
    paid_amount: opts.paid ?? 0,
    balance_amount: opts.balance ?? opts.total,
    status: opts.status ?? "issued",
    is_active: opts.active ?? true,
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

describe("buildCanonicalSaleDocuments", () => {
  it("excludes pre-2026 documents", () => {
    const docs = buildCanonicalSaleDocuments({
      workspaceId: WS,
      rows: [
        invoice({ id: "1", date: "2025-12-31", moneda: "1", total: 100, lines: [{ concepto: "X", neto: "82", iva: "18", total: "100" }] }),
        invoice({ id: "2", date: "2026-01-15", moneda: "1", total: 100, lines: [{ concepto: "X", neto: "82", iva: "18", total: "100" }] }),
      ],
    });
    expect(docs).toHaveLength(1);
    expect(docs[0]!.documentId).toBe("2");
  });

  it("excludes inactive rows", () => {
    const docs = buildCanonicalSaleDocuments({
      workspaceId: WS,
      rows: [invoice({ id: "1", date: "2026-02-01", moneda: "1", total: 100, active: false, lines: [{ concepto: "X", neto: "82", iva: "18", total: "100" }] })],
    });
    expect(docs).toHaveLength(0);
  });

  it("detects credit notes by CFE tipo (102/112)", () => {
    const docs = buildCanonicalSaleDocuments({
      workspaceId: WS,
      rows: [
        invoice({ id: "1", date: "2026-02-01", moneda: "2", cfe: 101, total: 500, lines: [{ concepto: "Web", neto: "410", iva: "90", total: "500" }] }),
        invoice({ id: "2", date: "2026-02-05", moneda: "2", cfe: 102, total: 100, lines: [{ concepto: "Web", neto: "82", iva: "18", total: "100" }] }),
      ],
    });
    const byId = Object.fromEntries(docs.map((d) => [d.documentId, d]));
    expect(byId["1"]!.kind).toBe("sale");
    expect(byId["2"]!.kind).toBe("credit_note");
  });

  it("creates a synthetic line for invoices without Lineas", () => {
    const row = invoice({ id: "1", date: "2026-03-01", moneda: "1", total: 200 });
    const docs = buildCanonicalSaleDocuments({ workspaceId: WS, rows: [row] });
    expect(docs[0]!.lines).toHaveLength(1);
    expect(docs[0]!.lines[0]!.synthetic).toBe(true);
    expect(docs[0]!.lines[0]!.lineAmount).toBe(200);
  });

  it("parses multiple product lines in one invoice", () => {
    const docs = buildCanonicalSaleDocuments({
      workspaceId: WS,
      rows: [
        invoice({
          id: "1",
          date: "2026-03-01",
          moneda: "2",
          total: 800,
          lines: [
            { concepto: "Página web", codigo: "PW", cantidad: "1.00000", precio: "600", neto: "600", iva: "0", total: "600" },
            { concepto: "Pautas y redes", codigo: "PR", cantidad: "1.00000", precio: "200", neto: "200", iva: "0", total: "200" },
          ],
        }),
      ],
    });
    expect(docs[0]!.lines).toHaveLength(2);
    expect(docs[0]!.lines.map((l) => l.originalDescription)).toEqual(["Página web", "Pautas y redes"]);
  });

  it("resolves currency from MonedaCodigo when currency_code is null", () => {
    const docs = buildCanonicalSaleDocuments({
      workspaceId: WS,
      rows: [invoice({ id: "1", date: "2026-03-01", moneda: "2", total: 100, currencyCode: null, lines: [{ concepto: "X", neto: "100", iva: "0", total: "100" }] })],
    });
    expect(docs[0]!.currency).toBe("USD");
  });
});

describe("period snapshot", () => {
  const rows: RawSaleInvoiceRow[] = [
    invoice({ id: "1", date: "2026-02-03", moneda: "1", cfe: 111, cliente: "A", total: 1220, paid: 1220, balance: 0, lines: [{ concepto: "Gestion Mensual", codigo: "GM", cantidad: "1", neto: "1000", iva: "220", total: "1220" }] }),
    invoice({ id: "2", date: "2026-02-10", moneda: "2", cfe: 101, cliente: "B", total: 600, paid: 0, balance: 600, lines: [{ concepto: "Página web", codigo: "PW", cantidad: "1", neto: "600", iva: "0", total: "600" }] }),
    invoice({ id: "3", date: "2026-02-15", moneda: "2", cfe: 102, cliente: "B", total: 100, lines: [{ concepto: "Página web", codigo: "PW", neto: "100", iva: "0", total: "100" }] }),
  ];
  const docs = buildCanonicalSaleDocuments({ workspaceId: WS, rows });

  it("separates UYU and USD and never mixes", () => {
    const snap = buildSalesPeriodSnapshot(docs, "2026-02-01", "2026-02-28");
    expect(snap.salesEmitted.UYU).toBe(1220);
    expect(snap.salesEmitted.USD).toBe(600);
    expect(snap.creditNotes.USD).toBe(100);
    expect(snap.creditNotes.UYU).toBe(0);
  });

  it("computes salesAdjusted = emitted - NC per currency", () => {
    const snap = buildSalesPeriodSnapshot(docs, "2026-02-01", "2026-02-28");
    expect(snap.salesAdjusted.USD).toBe(500);
    expect(snap.salesAdjusted.UYU).toBe(1220);
  });

  it("counts invoices and credit notes distinctly", () => {
    const snap = buildSalesPeriodSnapshot(docs, "2026-02-01", "2026-02-28");
    expect(snap.invoiceCount).toBe(2);
    expect(snap.creditNoteCount).toBe(1);
  });

  it("computes average ticket per currency without mixing", () => {
    const snap = buildSalesPeriodSnapshot(docs, "2026-02-01", "2026-02-28");
    expect(snap.averageTicket.UYU).toBe(1220);
    expect(snap.averageTicket.USD).toBe(600);
  });

  it("does not double-count NC into emitted", () => {
    const snap = buildSalesPeriodSnapshot(docs, "2026-02-01", "2026-02-28");
    expect(snap.salesEmitted.USD).toBe(600); // NC excluded from emitted
  });
});

describe("classification + product summary", () => {
  const catalog: SalesCatalogView = {
    categories: [{ id: "cat1", workspaceId: WS, name: "Desarrollo web", active: true, createdAt: "", updatedAt: "" }],
    items: [
      { id: "prod-web", workspaceId: WS, name: "Página web", categoryId: "cat1", type: "service", active: true, defaultCurrency: "USD", description: null, createdAt: "", updatedAt: "" },
    ],
    aliases: [
      { id: "a1", workspaceId: WS, catalogItemId: "prod-web", originalValue: "Página web", normalizedValue: normalizeConceptText("Página web"), matchType: "normalized_exact", priority: 10, active: true, createdByUserId: null, createdAt: "" },
      { id: "a2", workspaceId: WS, catalogItemId: "prod-web", originalValue: "PW", normalizedValue: "pw", matchType: "code", priority: 20, active: true, createdByUserId: null, createdAt: "" },
    ],
    classifications: [],
  };

  it("matches normalized alias ignoring accents/case/spaces", () => {
    const r = classifyLine("  PAGINA   WEB ", null, catalog);
    expect(r.status).toBe("classified");
    expect(r.productId).toBe("prod-web");
    expect(r.source).toBe("normalized_alias");
  });

  it("matches by Zeta code", () => {
    const r = classifyLine("cualquier texto", "PW", catalog);
    expect(r.productId).toBe("prod-web");
    expect(r.source).toBe("zeta_code");
  });

  it("leaves unknown concepts unclassified", () => {
    const r = classifyLine("Servicio raro", "XX", catalog);
    expect(r.status).toBe("unclassified");
    expect(r.productId).toBeNull();
  });

  it("flags alias conflict (two products, same priority)", () => {
    const conflicting = matchAliasForConcept("web", null, [
      { id: "x", workspaceId: WS, catalogItemId: "p1", originalValue: "web", normalizedValue: "web", matchType: "contains", priority: 5, active: true, createdByUserId: null, createdAt: "" },
      { id: "y", workspaceId: WS, catalogItemId: "p2", originalValue: "web", normalizedValue: "web", matchType: "contains", priority: 5, active: true, createdByUserId: null, createdAt: "" },
    ]);
    expect(conflicting).toEqual({ conflict: true });
  });

  it("manual classification overrides and is never replaced by alias", () => {
    const withManual: SalesCatalogView = {
      ...catalog,
      classifications: [{ id: "c1", workspaceId: WS, conceptKey: conceptKey("Página web", null), catalogItemId: "prod-web", status: "classified", createdByUserId: null, createdAt: "", updatedAt: "" }],
    };
    const r = classifyLine("Página web", null, withManual);
    expect(r.source).toBe("manual_rule");
  });

  it("does not classify to an inactive product", () => {
    const inactive: SalesCatalogView = { ...catalog, items: [{ ...catalog.items[0]!, active: false }] };
    const r = classifyLine("Página web", null, inactive);
    expect(r.status).toBe("unclassified");
  });

  it("groups product summary and separates currencies + avg price", () => {
    const rows: RawSaleInvoiceRow[] = [
      invoice({ id: "1", date: "2026-02-01", moneda: "2", cliente: "A", total: 600, lines: [{ concepto: "Página web", codigo: "PW", cantidad: "1", neto: "600", iva: "0", total: "600" }] }),
      invoice({ id: "2", date: "2026-02-02", moneda: "2", cliente: "B", total: 1200, lines: [{ concepto: "Página web", codigo: "PW", cantidad: "2", neto: "1200", iva: "0", total: "1200" }] }),
    ];
    const docs = buildCanonicalSaleDocuments({ workspaceId: WS, rows, catalog });
    const summary = buildProductSalesSummary(docs, "2026-02-01", "2026-02-28");
    const web = summary.find((r) => r.productId === "prod-web")!;
    expect(web.quantity).toBe(3);
    expect(web.totalByCurrency.USD).toBe(1800);
    expect(web.totalByCurrency.UYU).toBe(0);
    expect(web.avgPriceByCurrency.USD).toBe(600);
    expect(web.customerCount).toBe(2);
    expect(web.invoiceCount).toBe(2);
  });

  it("shows the raw Zeta concept as its own product (never 'Sin clasificar')", () => {
    const rows: RawSaleInvoiceRow[] = [
      invoice({ id: "1", date: "2026-02-01", moneda: "2", total: 600, lines: [{ concepto: "Página web", codigo: "PW", neto: "600", iva: "0", total: "600" }] }),
      invoice({ id: "2", date: "2026-02-02", moneda: "2", total: 200, lines: [{ concepto: "Cosa rara", codigo: "ZZ", neto: "200", iva: "0", total: "200" }] }),
    ];
    const docs = buildCanonicalSaleDocuments({ workspaceId: WS, rows, catalog });
    const summary = buildProductSalesSummary(docs, "2026-02-01", "2026-02-28");
    // El concepto Zeta aparece con su nombre real, no como "Sin clasificar".
    expect(summary.some((r) => r.productName === "Sin clasificar")).toBe(false);
    const concept = summary.find((r) => r.productName === "Cosa rara")!;
    expect(concept).toBeDefined();
    expect(concept.productId).toBeNull();
    expect(concept.normalizationStatus).toBe("original");
    expect(concept.totalByCurrency.USD).toBe(200);
    const totalUSD = summary.reduce((s, r) => s + r.totalByCurrency.USD, 0);
    expect(totalUSD).toBe(800); // reconciles with emitted
  });

  it("only truly empty lines (no Zeta concept) group as 'Sin detalle'", () => {
    const rows: RawSaleInvoiceRow[] = [
      invoice({ id: "1", date: "2026-02-01", moneda: "2", total: 500 }), // no lines → synthetic
      invoice({ id: "2", date: "2026-02-02", moneda: "2", total: 300, lines: [{ concepto: "Gestión de Pauta", neto: "300", iva: "0", total: "300" }] }),
    ];
    const docs = buildCanonicalSaleDocuments({ workspaceId: WS, rows });
    const summary = buildProductSalesSummary(docs, "2026-02-01", "2026-02-28");
    expect(summary.find((r) => r.productName === "Gestión de Pauta")!.normalizationStatus).toBe("original");
    const sinDetalle = summary.find((r) => r.normalizationStatus === "missing_detail")!;
    expect(sinDetalle.productName).toBe("Sin detalle");
    // "Sin detalle" siempre al final del orden.
    expect(summary[summary.length - 1]!.normalizationStatus).toBe("missing_detail");
  });
});

describe("customers new vs recurring", () => {
  const rows: RawSaleInvoiceRow[] = [
    invoice({ id: "1", date: "2026-01-10", moneda: "2", cliente: "A", total: 100, lines: [{ concepto: "X", neto: "100", iva: "0", total: "100" }] }),
    invoice({ id: "2", date: "2026-02-10", moneda: "2", cliente: "A", total: 200, lines: [{ concepto: "X", neto: "200", iva: "0", total: "200" }] }),
    invoice({ id: "3", date: "2026-02-12", moneda: "2", cliente: "B", total: 300, lines: [{ concepto: "X", neto: "300", iva: "0", total: "300" }] }),
  ];
  const docs = buildCanonicalSaleDocuments({ workspaceId: WS, rows });

  it("marks first-purchase-in-period as new, prior as recurring", () => {
    const snap = buildSalesPeriodSnapshot(docs, "2026-02-01", "2026-02-28");
    expect(snap.newCustomers).toBe(1); // B
    expect(snap.recurringCustomers).toBe(1); // A (bought in Jan)
    const custs = buildCustomerSalesSummary(docs, "2026-02-01", "2026-02-28");
    expect(custs.find((c) => c.customerId === "A")!.type).toBe("recurring");
    expect(custs.find((c) => c.customerId === "B")!.type).toBe("new");
  });
});

describe("collection summary + comparison", () => {
  const rows: RawSaleInvoiceRow[] = [
    invoice({ id: "1", date: "2026-02-01", moneda: "2", cliente: "A", total: 1000, paid: 700, balance: 300, lines: [{ concepto: "X", neto: "1000", iva: "0", total: "1000" }] }),
  ];
  const jan: RawSaleInvoiceRow[] = [
    invoice({ id: "9", date: "2026-01-05", moneda: "2", cliente: "A", total: 500, paid: 500, balance: 0, lines: [{ concepto: "X", neto: "500", iva: "0", total: "500" }] }),
  ];
  const docs = buildCanonicalSaleDocuments({ workspaceId: WS, rows: [...rows, ...jan] });

  it("separates sold/applied/pending and computes applied rate", () => {
    const col = buildSalesCollectionSummary(docs, "2026-02-01", "2026-02-28");
    expect(col.sold.USD).toBe(1000);
    expect(col.applied.USD).toBe(700);
    expect(col.pending.USD).toBe(300);
    expect(col.appliedRateByCurrency.USD).toBe(70);
  });

  it("comparison returns null pct when previous base is zero", () => {
    const cmp = buildSalesComparison(docs, "2026-02-01", "2026-02-28", "2026-01-01", "2026-01-31");
    expect(cmp.current.salesEmitted.USD).toBe(1000);
    expect(cmp.previous.salesEmitted.USD).toBe(500);
    expect(cmp.salesPctByCurrency.USD).toBe(100);
    expect(cmp.salesPctByCurrency.UYU).toBeNull(); // no UYU base
  });
});

describe("unclassified bandeja", () => {
  it("aggregates unclassified concepts by normalized key", () => {
    const rows: RawSaleInvoiceRow[] = [
      invoice({ id: "1", date: "2026-02-01", moneda: "2", cliente: "A", total: 100, lines: [{ concepto: "Pauta y redes", neto: "100", iva: "0", total: "100" }] }),
      invoice({ id: "2", date: "2026-02-05", moneda: "2", cliente: "B", total: 83, lines: [{ concepto: "pauta y redes", neto: "83", iva: "0", total: "83" }] }),
    ];
    const docs = buildCanonicalSaleDocuments({ workspaceId: WS, rows });
    const bandeja = buildUnclassifiedSalesSummary(docs, "2026-02-01", "2026-02-28");
    expect(bandeja).toHaveLength(1);
    expect(bandeja[0]!.occurrences).toBe(2);
    expect(bandeja[0]!.totalByCurrency.USD).toBe(183);
    expect(bandeja[0]!.customerCount).toBe(2);
  });
});
