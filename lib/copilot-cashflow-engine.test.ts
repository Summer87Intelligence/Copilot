import { describe, expect, it } from "vitest";

import {
  availableCashFromDataset,
  computeProjectedCoverageForAgenda,
  type CashflowEngineDataset,
} from "@/lib/copilot-cashflow-engine";

describe("computeProjectedCoverageForAgenda (smoke)", () => {
  const emptyDs: CashflowEngineDataset = {
    receipts: [],
    payments: [],
    invoices: [],
  };

  it("obligación futura con dataset vacío: caja 0 y cobertura crítica", () => {
    const m = computeProjectedCoverageForAgenda(
      [{ id: "obl-1", due_date: "2099-06-01", estimated_amount: 500 }],
      emptyDs,
      "2025-06-15"
    );
    const r = m.get("obl-1");
    expect(r).toBeDefined();
    expect(r!.available_cash).toBe(0);
    expect(r!.expected_inflows).toBe(0);
    expect(r!.expected_outflows).toBe(0);
    expect(r!.projected_balance).toBe(-500);
    expect(r!.coverage_status).toBe("critical");
  });

  it("availableCashFromDataset delega en primitivas de flujo positivo", () => {
    const ds: CashflowEngineDataset = {
      receipts: [{ amount: 100, invoice_id: null, receipt_date: "", company_id: "" }],
      payments: [{ amount: 40, payment_date: "" }],
      invoices: [],
    };
    expect(availableCashFromDataset(ds)).toBe(60);
  });
});
