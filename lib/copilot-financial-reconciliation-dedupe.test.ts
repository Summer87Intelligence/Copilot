import { describe, expect, it } from "vitest";

import {
  generateFinancialConsistencyReport,
  type InvoiceInput,
} from "@/lib/copilot-financial-reconciliation";
import { ZETA_SALDOS_PENDIENTES_CATEGORY } from "@/lib/zeta/zeta-operational-debt-dedup";

const COMPANY = "co-dedupe-test";
const NOW = "2026-06-01T12:00:00.000Z";

function ccv1(
  id: string,
  registroId: string,
  balance: number,
  overrides?: Partial<InvoiceInput>
): InvoiceInput {
  return {
    id,
    company_id: COMPANY,
    currency_code: "UYU",
    total_amount: balance,
    balance_amount: balance,
    status: null,
    updated_at: NOW,
    issue_date: "2026-03-01",
    due_date: "2026-04-15",
    category: "Zeta / factura cliente",
    invoice_number: `ZETA:CCV1:EMP:${COMPANY}:A:${id}`,
    zeta_metadata: {
      zeta_comprobante_identity_v1: { schema_version: 1, registro_id: registroId },
      zeta_customer_voucher_v1: { zeta_registro_id: registroId },
    },
    ...overrides,
  };
}

function shadow(registroId: string, balance: number): InvoiceInput {
  return {
    id: `sp-${registroId}`,
    company_id: COMPANY,
    currency_code: "UYU",
    total_amount: balance,
    balance_amount: balance,
    status: null,
    updated_at: NOW,
    issue_date: "2026-03-01",
    category: ZETA_SALDOS_PENDIENTES_CATEGORY,
    invoice_number: `ZETA:${registroId}`,
  };
}

describe("generateFinancialConsistencyReport — dedupe operacional Zeta", () => {
  it("CCV1 + shadow mismo RegistroId → pendingAtCutoff NO doble cuenta", () => {
    const balance = 54_900;
    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices: [ccv1("real-1", "9001", balance), shadow("9001", balance)],
      companies: [{ id: COMPANY, name: "Cliente test" }],
      syncStates: [],
      mode: "all_outstanding",
      now: NOW,
    });

    const uyu = report.currencies.find((c) => c.currencyCode === "UYU");
    expect(uyu?.pendingAtCutoff).toBe(balance);
    expect(uyu?.totalPending).toBe(balance);

    const stale = report.staleClients.find((c) => c.companyId === COMPANY);
    expect(stale?.pendingByCurrency?.UYU).toBe(balance);
  });

  it("dos facturas independientes sin metadata Zeta → suma completa", () => {
    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices: [
        {
          id: "inv-a",
          company_id: COMPANY,
          currency_code: "UYU",
          total_amount: 5_000,
          balance_amount: 5_000,
          status: null,
          updated_at: NOW,
          issue_date: "2026-03-01",
        },
        {
          id: "inv-b",
          company_id: COMPANY,
          currency_code: "UYU",
          total_amount: 3_000,
          balance_amount: 3_000,
          status: null,
          updated_at: NOW,
          issue_date: "2026-04-01",
        },
      ],
      companies: [{ id: COMPANY, name: "Cliente test" }],
      syncStates: [],
      mode: "all_outstanding",
      now: NOW,
    });

    const uyu = report.currencies.find((c) => c.currencyCode === "UYU");
    expect(uyu?.pendingAtCutoff).toBe(8_000);
  });

  it("shadow solo (sin CCV1) → sigue contando una vez", () => {
    const balance = 12_000;
    const report = generateFinancialConsistencyReport({
      workspaceId: "ws-1",
      invoices: [shadow("7777", balance)],
      companies: [{ id: COMPANY, name: "Orphan shadow" }],
      syncStates: [],
      mode: "all_outstanding",      now: NOW,
    });

    const uyu = report.currencies.find((c) => c.currencyCode === "UYU");
    expect(uyu?.pendingAtCutoff).toBe(balance);
  });
});
