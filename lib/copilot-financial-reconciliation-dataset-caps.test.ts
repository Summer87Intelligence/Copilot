import { describe, expect, it } from "vitest";

import { buildFinancialReconciliationDatasetCaps } from "@/lib/copilot-financial-reconciliation-dataset-caps";

describe("buildFinancialReconciliationDatasetCaps", () => {
  const base = {
    maxRows: 50_000,
    invoices: { pagesFetched: 1, totalFetched: 100, reachedMaxRows: false },
    receipts: { pagesFetched: 1, totalFetched: 10, reachedMaxRows: false },
    companies: { pagesFetched: 1, totalFetched: 5, reachedMaxRows: false },
  };

  it("sin caps → severity null, isTruncated false", () => {
    const d = buildFinancialReconciliationDatasetCaps(base);
    expect(d.dataset_caps.isTruncated).toBe(false);
    expect(d.dataset_caps.severity).toBeNull();
    expect(d.dataset_caps.tables_at_cap).toEqual([]);
  });

  it("proto_invoices al cap → critical", () => {
    const d = buildFinancialReconciliationDatasetCaps({
      ...base,
      invoices: { ...base.invoices, reachedMaxRows: true, pagesFetched: 50 },
    });
    expect(d.dataset_caps.isTruncated).toBe(true);
    expect(d.dataset_caps.severity).toBe("critical");
    expect(d.dataset_caps.tables_at_cap).toEqual(["proto_invoices"]);
  });

  it("solo receipts al cap → warning", () => {
    const d = buildFinancialReconciliationDatasetCaps({
      ...base,
      receipts: { ...base.receipts, reachedMaxRows: true },
    });
    expect(d.dataset_caps.severity).toBe("warning");
    expect(d.dataset_caps.tables_at_cap).toEqual(["proto_receipts"]);
  });
});
