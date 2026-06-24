import { describe, expect, it } from "vitest";

import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import type { CollectionAction } from "@/lib/copilot-collection-types";
import {
  buildCobranzaClientRows,
  groupActionsByCompany,
  type OwnershipEntry,
} from "./copilot-cobranza-summary";

function makePortfolioRow(overrides: Partial<ClientPortfolioRow> = {}): ClientPortfolioRow {
  return {
    company_id: "c1",
    name: "Cliente A",
    industry: "retail",
    total_billing: 1000,
    total_debt: 500,
    overdue_debt: 200,
    invoices_count: 3,
    receipts_count: 1,
    share_pct: 10,
    payment_behavior: "medio",
    risk: "Medio",
    source: "zeta_invoice",
    has_contact_data: true,
    derived_from_debt: false,
    debt_uyu: 500,
    debt_usd: 0,
    ...overrides,
  };
}

const NO_ACTIONS = new Map<string, CollectionAction[]>();

// ── tests 12 & 13: ownership fields ─────────────────────────────────────────

describe("buildCobranzaClientRows — ownership", () => {
  it("rows include assignedUserId/name/email when ownership map is provided", () => {
    const portfolio = [makePortfolioRow({ company_id: "c1" })];
    const ownership = new Map<string, OwnershipEntry>([
      ["c1", { userId: "u-1", name: "Cecilia López", email: "ceci@empresa.com" }],
    ]);

    const rows = buildCobranzaClientRows(portfolio, NO_ACTIONS, ownership);

    expect(rows).toHaveLength(1);
    expect(rows[0].assignedUserId).toBe("u-1");
    expect(rows[0].assignedUserName).toBe("Cecilia López");
    expect(rows[0].assignedUserEmail).toBe("ceci@empresa.com");
  });

  it("rows default to null when no ownership map is provided", () => {
    const portfolio = [makePortfolioRow({ company_id: "c1" })];

    const rows = buildCobranzaClientRows(portfolio, NO_ACTIONS);

    expect(rows[0].assignedUserId).toBeNull();
    expect(rows[0].assignedUserName).toBeNull();
    expect(rows[0].assignedUserEmail).toBeNull();
  });

  it("rows default to null for companies missing from ownership map", () => {
    const portfolio = [
      makePortfolioRow({ company_id: "c1" }),
      makePortfolioRow({ company_id: "c2", name: "Cliente B" }),
    ];
    const ownership = new Map<string, OwnershipEntry>([
      ["c1", { userId: "u-1", name: "Cecilia López", email: "ceci@empresa.com" }],
    ]);

    const rows = buildCobranzaClientRows(portfolio, NO_ACTIONS, ownership);

    const c1 = rows.find((r) => r.companyId === "c1")!;
    const c2 = rows.find((r) => r.companyId === "c2")!;

    expect(c1.assignedUserId).toBe("u-1");
    expect(c2.assignedUserId).toBeNull();
    expect(c2.assignedUserName).toBeNull();
    expect(c2.assignedUserEmail).toBeNull();
  });

  it("rows include contact email/phone from portfolio", () => {
    const portfolio = [
      makePortfolioRow({
        company_id: "c1",
        contact_email: "cliente@empresa.com",
        contact_phone: "+59899111222",
      }),
    ];
    const rows = buildCobranzaClientRows(portfolio, NO_ACTIONS);
    expect(rows[0].contactEmail).toBe("cliente@empresa.com");
    expect(rows[0].contactPhone).toBe("+59899111222");
  });

  it("groupActionsByCompany + buildCobranzaClientRows preserves all existing fields", () => {
    const portfolio = [makePortfolioRow({ company_id: "c1", debt_uyu: 800, debt_usd: 100 })];
    const rows = buildCobranzaClientRows(portfolio, groupActionsByCompany([]));

    expect(rows[0].debtUyu).toBe(800);
    expect(rows[0].debtUsd).toBe(100);
    expect(rows[0].hasDebt).toBe(true);
    expect(rows[0].assignedUserId).toBeNull();
  });
});
