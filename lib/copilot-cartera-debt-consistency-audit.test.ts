import { describe, expect, it } from "vitest";

import { auditCarteraDebtConsistency } from "@/lib/copilot-cartera-debt-consistency-audit";
import { generateFinancialConsistencyReport } from "@/lib/copilot-financial-reconciliation";
import type { InvoiceInput } from "@/lib/copilot-financial-reconciliation";

function inv(partial: Partial<InvoiceInput> & Pick<InvoiceInput, "id">): InvoiceInput {
  return {
    company_id: "elpais",
    currency_code: "UYU",
    issue_date: "2026-05-05",
    total_amount: 1000,
    balance_amount: 1000,
    status: "open",
    updated_at: "2026-05-05T12:00:00Z",
    ...partial,
  };
}

describe("auditCarteraDebtConsistency", () => {
  it("sum of client pending matches pendingAtCutoff for single-debtor El País", () => {
    const invoices: InvoiceInput[] = [
      inv({
        id: "pre",
        issue_date: "2026-03-01",
        total_amount: 58560,
        balance_amount: 58560,
      }),
      inv({
        id: "a1",
        issue_date: "2026-05-05",
        total_amount: 8662,
        balance_amount: 8662,
      }),
      inv({
        id: "a2",
        issue_date: "2026-05-07",
        total_amount: 8662,
        balance_amount: 8662,
      }),
    ];

    const report = generateFinancialConsistencyReport({
      workspaceId: "ws",
      invoices,
      receipts: [],
      companies: [{ id: "elpais", name: "El País" }],
      syncStates: [],
      now: "2026-05-11T12:00:00Z",
      mode: "period_only",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-11",
    });

    const uyu = report.currencies.find((c) => c.currencyCode === "UYU")!;
    const elPais = report.staleClients.find((c) => c.companyId === "elpais")!;
    const expected = 58560 + 8662 + 8662;

    expect(elPais.pendingByCurrency.UYU).toBe(expected);
    expect(uyu.pendingAtCutoff).toBe(expected);

    const audit = auditCarteraDebtConsistency(report);
    const row = audit.currencies.find((c) => c.currency === "UYU")!;
    expect(row.clientSumMatchesCutoff).toBe(true);
    expect(row.sumClientPending).toBe(uyu.pendingAtCutoff);
    expect(audit.findClient("elpais")?.pendingByCurrency.UYU).toBe(expected);
  });

  it("documents that card openingBalance is portfolio-wide, not per client", () => {
    const report = generateFinancialConsistencyReport({
      workspaceId: "ws",
      invoices: [
        inv({ id: "a", company_id: "elpais", balance_amount: 5000, total_amount: 5000 }),
        inv({
          id: "b",
          company_id: "other",
          issue_date: "2026-03-01",
          balance_amount: 10000,
          total_amount: 10000,
        }),
      ],
      receipts: [],
      companies: [
        { id: "elpais", name: "El País" },
        { id: "other", name: "Otro" },
      ],
      syncStates: [],
      now: "2026-05-11T12:00:00Z",
      mode: "period_only",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-11",
    });

    const audit = auditCarteraDebtConsistency(report);
    const uyu = audit.currencies.find((c) => c.currency === "UYU")!;
    const elPais = report.staleClients.find((c) => c.companyId === "elpais")!;

    expect(elPais.pendingByCurrency.UYU).toBe(5000);
    expect(uyu.openingBalance).toBe(10000);
    expect(elPais.pendingByCurrency.UYU).not.toBe(uyu.openingBalance);
  });
});
