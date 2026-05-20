import { describe, expect, it } from "vitest";

import { generateFinancialConsistencyReport } from "@/lib/copilot-financial-reconciliation";
import { buildFinancialReconciliationDatasetCaps } from "@/lib/copilot-financial-reconciliation-dataset-caps";
import { fetchAllRows } from "@/lib/supabase-pagination";

describe("financial-reconciliation pagination (FIX-8)", () => {
  it("carga 5001 facturas simuladas sin reachedMaxRows", async () => {
    const total = 5001;
    const pageSize = 1000;
    const fetched = await fetchAllRows<{ id: string }>({
      pageSize,
      maxRows: 50_000,
      queryPage: async (from, to) => {
        const page: { id: string }[] = [];
        for (let i = from; i <= to && i < total; i++) {
          page.push({ id: `inv-${i}` });
        }
        return { data: page, error: null };
      },
    });

    expect(fetched.totalFetched).toBe(5001);
    expect(fetched.reachedMaxRows).toBe(false);

    const diagnostics = buildFinancialReconciliationDatasetCaps({
      maxRows: 50_000,
      invoices: fetched,
      receipts: { pagesFetched: 1, totalFetched: 0, reachedMaxRows: false },
      companies: { pagesFetched: 1, totalFetched: 0, reachedMaxRows: false },
    });

    const invoices = fetched.rows.map((r, idx) => ({
      id: r.id,
      company_id: "c1",
      currency_code: "UYU",
      total_amount: 1000,
      balance_amount: idx < 5001 ? 100 : 0,
      status: "issued",
      updated_at: "2026-05-19T12:00:00Z",
      issue_date: "2026-05-10",
    }));

    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices,
      companies: [{ id: "c1", name: "Cliente" }],
      receipts: [],
      syncStates: [],
      diagnostics,
      now: "2026-05-19T12:00:00Z",
      mode: "period_only",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-19",
    });

    expect(report.totalInvoices).toBe(5001);
    expect(report.diagnostics?.dataset_caps.isTruncated).toBe(false);
    expect(report.diagnostics?.dataset_caps.severity).toBeNull();
  });
});
