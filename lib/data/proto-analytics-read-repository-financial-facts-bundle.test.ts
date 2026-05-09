import { describe, expect, it } from "vitest";

import {
  FINANCIAL_FACTS_ORDER_INVOICES,
  FINANCIAL_FACTS_ORDER_PAYMENTS,
  FINANCIAL_FACTS_ORDER_RECEIPTS,
  loadFinancialFactsBundle,
} from "@/lib/data/proto-analytics-read-repository";
import type { OperationalSupabase } from "@/lib/data/supabase-operational-data";

/**
 * Cliente mínimo PostgREST-like: encadenamiento + `limit()` resuelve según tabla.
 */
function createOperationalMock(): OperationalSupabase {
  const from = (table: string) => {
    if (table === "invoice_financials") {
      const fin: Record<string, unknown> = {};
      fin.select = () => fin;
      fin.limit = () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
        in: () => Promise.resolve({ data: [], error: null }),
      });
      return fin;
    }

    const self: Record<string, unknown> = {};
    const chain = () => self;
    self.select = chain;
    self.eq = chain;
    self.gte = chain;
    self.order = chain;
    self.in = chain;
    self.limit = () => {
      if (table === "proto_receipts") {
        return Promise.resolve({
          data: [
            {
              amount: 100,
              invoice_id: "inv1",
              receipt_date: "2026-01-15",
              company_id: "c1",
            },
          ],
          error: null,
        });
      }
      if (table === "proto_payments") {
        return Promise.resolve({
          data: [{ amount: 40, payment_date: "2026-01-12" }],
          error: null,
        });
      }
      if (table === "proto_invoices") {
        return Promise.resolve({
          data: [
            {
              id: "inv1",
              company_id: "c1",
              issue_date: "2026-01-01",
              due_date: "2026-02-01",
              balance_amount: 500,
              collection_probability: 0.5,
            },
          ],
          error: null,
        });
      }
      if (table === "proto_tax_obligations" || table === "proto_tax_payments") {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({ data: [], error: null });
    };
    return self;
  };
  return { from } as unknown as OperationalSupabase;
}

describe("loadFinancialFactsBundle", () => {
  it("expone meta de orden, merge de saldo y columnas de factura para cashflow", async () => {
    const bundle = await loadFinancialFactsBundle(createOperationalMock(), "tenant-1");

    expect(bundle.meta.order_receipts).toBe(FINANCIAL_FACTS_ORDER_RECEIPTS);
    expect(bundle.meta.order_payments).toBe(FINANCIAL_FACTS_ORDER_PAYMENTS);
    expect(bundle.meta.order_invoices).toBe(FINANCIAL_FACTS_ORDER_INVOICES);
    expect(bundle.meta.invoice_merge_applied).toBe(true);
    expect(bundle.receipts).toHaveLength(1);
    expect(bundle.invoices[0]?.["balance_amount"]).toBe(500);
    expect(bundle.invoices[0]?.["company_id"]).toBe("c1");
    expect(bundle.invoices[0]?.["issue_date"]).toBe("2026-01-01");
    expect(bundle.meta.snapshotLoadDiagnostics.active_invoice_count).toBe(1);
    expect(bundle.meta.snapshotLoadDiagnostics.invoice_financials_coverage).toBe(
      "unavailable"
    );
  });
});
