/**
 * FASE 9E — Paridad Ventas ↔ Finanzas sobre el MISMO universo documental.
 *
 * Regresión de la divergencia UYU $97.417: comprobantes CCV1 internos con
 * `currency_code` nulo pero `MonedaCodigo` presente eran contados por Ventas y
 * descartados por Finanzas. Este test corre AMBOS motores reales sobre un
 * universo sintético y verifica neto por moneda, universo documental y NC.
 */

import { describe, it, expect } from "vitest";

import { dedupeZetaShadowInvoicesCanonical } from "@/lib/copilot-zeta-invoice-canonical-dedup";
import { buildCanonicalSaleDocuments, type RawSaleInvoiceRow } from "@/lib/sales/canonical/build-canonical-sales";
import { buildSalesPeriodSnapshot } from "@/lib/sales/canonical/sales-aggregations";
import {
  generateFinancialConsistencyReport,
  type InvoiceInput,
} from "@/lib/copilot-financial-reconciliation";
import { isCreditNoteFromMetadata } from "@/lib/copilot-zeta-credit-note";
import { findCurrencyMetrics } from "@/lib/copilot-cartera-cards-source";

const FROM = "2026-07-01";
const TO = "2026-07-16";

function ccv1(
  n: string,
  opts: {
    total: number;
    currency_code: string | null;
    monedaCodigo?: string;
    cfe?: string;
    status?: string;
    issue?: string;
    company?: string;
  }
): RawSaleInvoiceRow {
  const cfe = opts.cfe ?? "111";
  return {
    id: `id-${n}`,
    invoice_number: `ZETA:CCV1:0:1:A:${n}`,
    company_id: opts.company ?? `co-${n}`,
    issue_date: opts.issue ?? "2026-07-06",
    due_date: "2026-08-05",
    currency_code: opts.currency_code,
    total_amount: opts.total,
    balance_amount: 0,
    paid_amount: 0,
    status: opts.status ?? "paid",
    category: "Zeta / comprobantes por cliente",
    zeta_metadata: {
      zeta_customer_voucher_v1: {
        cfe_tipo: cfe,
        raw_payload: {
          MonedaCodigo: opts.monedaCodigo ?? (opts.currency_code === "USD" ? "2" : "1"),
          CFETipo: cfe,
          Serie: "A",
          Numero: n,
        },
      },
    },
  };
}

function toInvoiceInput(rows: RawSaleInvoiceRow[]): InvoiceInput[] {
  return rows.map((r) => ({
    id: String(r.id),
    company_id: r.company_id != null ? String(r.company_id) : null,
    currency_code: (r.currency_code as string | null) ?? null,
    total_amount: typeof r.total_amount === "number" ? r.total_amount : Number(r.total_amount),
    balance_amount: 0,
    status: r.status ?? null,
    updated_at: null,
    issue_date: r.issue_date ?? null,
    is_credit_note: isCreditNoteFromMetadata(r.zeta_metadata),
    is_active: true,
    category: (r.category as string) ?? null,
    invoice_number: r.invoice_number ?? null,
    zeta_metadata: r.zeta_metadata,
  }));
}

describe("Ventas ↔ Finanzas parity (real engines)", () => {
  const universe: RawSaleInvoiceRow[] = [
    ccv1("1001", { total: 666122.5, currency_code: "UYU" }),
    // FASE 9E: comprobante interno sin currency_code, MonedaCodigo=1 → UYU.
    ccv1("1002", { total: 97112, currency_code: null, monedaCodigo: "1", cfe: "0" }),
    // NC UYU (cfe 112): resta del neto en ambos motores.
    ccv1("1003", { total: 2000, currency_code: "UYU", cfe: "112" }),
    ccv1("2001", { total: 9469.28, currency_code: "USD" }),
    // Comprobante interno USD sin currency_code, MonedaCodigo=2.
    ccv1("2002", { total: 305, currency_code: null, monedaCodigo: "2", cfe: "0" }),
    // Anulado: excluido por ambos.
    ccv1("9001", { total: 500000, currency_code: "UYU", status: "anulado" }),
    // Fuera de período: excluido por ambos.
    ccv1("9002", { total: 400000, currency_code: "UYU", issue: "2026-06-15" }),
  ];

  function run() {
    const deduped = dedupeZetaShadowInvoicesCanonical(universe as never) as unknown as RawSaleInvoiceRow[];
    const docs = buildCanonicalSaleDocuments({ workspaceId: "w", rows: deduped });
    const summary = buildSalesPeriodSnapshot(docs, FROM, TO);
    const report = generateFinancialConsistencyReport({
      workspaceId: "w",
      invoices: toInvoiceInput(universe),
      companies: [],
      syncStates: [],
      mode: "period_only",
      periodStart: FROM,
      periodEnd: TO,
    });
    return { summary, report, docs };
  }

  it("neto emitido por moneda coincide (UYU y USD)", () => {
    const { summary, report } = run();
    for (const cur of ["UYU", "USD"] as const) {
      const ventas = summary.netSalesByCurrency[cur];
      const fin = findCurrencyMetrics(report, cur)?.issuedInPeriodNet ?? 0;
      expect(fin).toBeCloseTo(ventas, 2);
    }
  });

  it("identidad neta: UYU = 666122.5 + 97112 − 2000; USD = 9469.28 + 305", () => {
    const { summary } = run();
    expect(summary.netSalesByCurrency.UYU).toBeCloseTo(761234.5, 2);
    expect(summary.netSalesByCurrency.USD).toBeCloseTo(9774.28, 2);
  });

  it("universo documental de facturas coincide en cantidad por moneda", () => {
    const { report, docs } = run();
    const inWindow = (d: string) => d >= FROM && d <= TO;
    for (const cur of ["UYU", "USD"] as const) {
      const ventasCount = docs.filter(
        (d) =>
          d.currency === cur &&
          d.kind === "sale" &&
          d.status !== "cancelled" &&
          inWindow(d.issueDate)
      ).length;
      const finCount = findCurrencyMetrics(report, cur)?.invoiceCount ?? 0;
      expect(finCount).toBe(ventasCount);
    }
  });

  it("las NC no cuentan como factura positiva", () => {
    const { report } = run();
    const uyu = findCurrencyMetrics(report, "UYU");
    expect(uyu?.creditNoteCount).toBe(1);
    expect(uyu?.creditNoteAmount).toBeCloseTo(2000, 2);
  });
});
