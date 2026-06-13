import { describe, expect, it } from "vitest";

import {
  deriveDebtSaludFromTotals,
  derivePortfolioSalud,
} from "@/lib/copilot-client-salud";
import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";

function row(partial: Partial<ClientPortfolioRow>): ClientPortfolioRow {
  return {
    company_id: "c1",
    name: "Test",
    industry: "—",
    total_billing: 0,
    total_debt: 0,
    overdue_debt: 0,
    invoices_count: 0,
    receipts_count: 0,
    share_pct: 0,
    payment_behavior: "medio",
    risk: "Bajo",
    source: "zeta_invoice",
    has_contact_data: false,
    derived_from_debt: false,
    debt_uyu: 0,
    debt_usd: 0,
    ...partial,
  };
}

describe("copilot-client-salud", () => {
  it("sin deuda → Al día", () => {
    expect(derivePortfolioSalud(row({}))).toBe("al_dia");
  });

  it("deuda sin atraso → Pendiente", () => {
    expect(
      derivePortfolioSalud(row({ debt_uyu: 1000, overdue_uyu: 0 }))
    ).toBe("pendiente");
  });

  it("deuda con atraso → Atrasado", () => {
    expect(
      derivePortfolioSalud(row({ debt_uyu: 1000, overdue_uyu: 500, overdue_days_uyu: 15 }))
    ).toBe("atrasado");
  });

  it("atraso +90 días → Crítico", () => {
    expect(
      derivePortfolioSalud(row({ debt_uyu: 1000, overdue_uyu: 500, overdue_days_uyu: 95 }))
    ).toBe("critico");
  });

  it("nunca Crítico sin deuda", () => {
    expect(
      deriveDebtSaludFromTotals({
        debtUyu: 0,
        debtUsd: 0,
        overdueUyu: 0,
        overdueUsd: 0,
        maxOverdueDays: 120,
      })
    ).toBe("al_dia");
  });
});
