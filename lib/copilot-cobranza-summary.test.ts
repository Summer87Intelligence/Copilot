import { describe, expect, it } from "vitest";

import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import type { CollectionAction } from "@/lib/copilot-collection-types";
import {
  applyCobranzaAgingFilter,
  buildCobranzaClientRows,
  computeCobranzaKpis,
  groupActionsByCompany,
  portfolioRowOperatingDelayBucket,
  sumCobranzaSubtotals,
  type CobranzaClientRow,
  type OwnershipEntry,
} from "./copilot-cobranza-summary";

/** YYYY-MM-DD a N días antes de hoy (robusto ante la fecha de corrida). */
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

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

// ── OPERATING AGING: clasificación por due_date ─────────────────────────────

describe("portfolioRowOperatingDelayBucket", () => {
  it("sin días de atraso ⇒ on_time", () => {
    expect(portfolioRowOperatingDelayBucket({ overdue_days_uyu: null, overdue_days_usd: null })).toBe(
      "on_time"
    );
  });

  it("vence exacto en cutoff = al día; un día antes = 1–7 días de atraso", () => {
    expect(portfolioRowOperatingDelayBucket({ overdue_days_uyu: 0, overdue_days_usd: null })).toBe(
      "on_time"
    );
    expect(portfolioRowOperatingDelayBucket({ overdue_days_uyu: 1, overdue_days_usd: null })).toBe(
      "late_1_7"
    );
  });

  it("clasifica 8–14, 15–30 y +30 por el mayor atraso entre monedas", () => {
    expect(portfolioRowOperatingDelayBucket({ overdue_days_uyu: 9, overdue_days_usd: 3 })).toBe(
      "late_8_14"
    );
    expect(portfolioRowOperatingDelayBucket({ overdue_days_uyu: 20, overdue_days_usd: null })).toBe(
      "late_15_30"
    );
    expect(portfolioRowOperatingDelayBucket({ overdue_days_uyu: 12, overdue_days_usd: 45 })).toBe(
      "late_30_plus"
    );
  });
});

describe("buildCobranzaClientRows — campos de cobranza", () => {
  it("propaga bucket y atrasado desde due_date", () => {
    const portfolio = [
      makePortfolioRow({
        company_id: "c1",
        debt_uyu: 1000,
        debt_usd: 0,
        overdue_uyu: 1000,
        overdue_usd: 0,
        overdue_days_uyu: 45,
        overdue_days_usd: null,
        oldest_open_invoice_issue_date: daysAgo(45),
      }),
    ];
    const rows = buildCobranzaClientRows(portfolio, NO_ACTIONS);
    expect(rows[0].collectionBucket).toBe("late_30_plus");
    expect(rows[0].isCollectionOverdue).toBe(true);
    expect(rows[0].collectionOverdueUyu).toBe(1000);
    expect(rows[0].oldestOpenInvoiceIssueDate).toBe(daysAgo(45));
  });

  it("cliente con deuda no vencida ⇒ on_time aunque tenga issue_date vieja", () => {
    const portfolio = [
      makePortfolioRow({
        company_id: "c2",
        debt_uyu: 500,
        overdue_uyu: 0,
        overdue_days_uyu: null,
        oldest_open_invoice_issue_date: daysAgo(90),
      }),
    ];
    const rows = buildCobranzaClientRows(portfolio, NO_ACTIONS);
    expect(rows[0].collectionBucket).toBe("on_time");
    expect(rows[0].isCollectionOverdue).toBe(false);
  });
});

// ── OPERATING AGING: filtros y subtotales ───────────────────────────────────

function makeClientRow(overrides: Partial<CobranzaClientRow> = {}): CobranzaClientRow {
  return {
    companyId: "c1",
    name: "Cliente",
    debtUyu: 0,
    debtUsd: 0,
    overdueUyu: 0,
    overdueUsd: 0,
    overdueDaysUyu: null,
    overdueDaysUsd: null,
    collectionOverdueUyu: 0,
    collectionOverdueUsd: 0,
    collectionBucket: "on_time",
    oldestOpenInvoiceIssueDate: null,
    hasDebt: false,
    isOverdue: false,
    isCollectionOverdue: false,
    hasActiveAction: false,
    latestActionStatus: null,
    latestActionType: null,
    nextActionDate: null,
    activePromise: null,
    assignedUserId: null,
    assignedUserName: null,
    assignedUserEmail: null,
    contactEmail: null,
    contactPhone: null,
    ...overrides,
  };
}

describe("applyCobranzaAgingFilter", () => {
  const rows = [
    makeClientRow({ companyId: "a", hasDebt: false }), // sin deuda
    makeClientRow({ companyId: "b", hasDebt: true, debtUyu: 100, collectionBucket: "on_time" }),
    makeClientRow({ companyId: "c", hasDebt: true, debtUyu: 100, collectionBucket: "late_1_7", isCollectionOverdue: true }),
    makeClientRow({ companyId: "d", hasDebt: true, debtUyu: 100, collectionBucket: "late_15_30", isCollectionOverdue: true }),
    makeClientRow({ companyId: "e", hasDebt: true, debtUyu: 100, collectionBucket: "late_30_plus", isCollectionOverdue: true, hasActiveAction: false }),
    makeClientRow({ companyId: "f", hasDebt: true, debtUyu: 100, collectionBucket: "late_8_14", isCollectionOverdue: true, hasActiveAction: true }),
  ];

  it("'all' excluye clientes sin deuda", () => {
    const ids = applyCobranzaAgingFilter(rows, "all").map((r) => r.companyId);
    expect(ids).not.toContain("a");
    expect(ids).toHaveLength(5);
  });

  it("'on_time' = con deuda y al día", () => {
    expect(applyCobranzaAgingFilter(rows, "on_time").map((r) => r.companyId)).toEqual(["b"]);
  });

  it("filtra por bucket exacto", () => {
    expect(applyCobranzaAgingFilter(rows, "late_1_7").map((r) => r.companyId)).toEqual(["c"]);
    expect(applyCobranzaAgingFilter(rows, "late_15_30").map((r) => r.companyId)).toEqual(["d"]);
    expect(applyCobranzaAgingFilter(rows, "late_30_plus").map((r) => r.companyId)).toEqual(["e"]);
  });

  it("'noAction' = con deuda y sin gestión activa", () => {
    const ids = applyCobranzaAgingFilter(rows, "noAction").map((r) => r.companyId);
    expect(ids).toContain("e");
    expect(ids).not.toContain("f"); // f tiene gestión activa
  });
});

describe("sumCobranzaSubtotals", () => {
  it("suma pendiente y atrasado por moneda sin mezclar", () => {
    const rows = [
      makeClientRow({ debtUyu: 1000, debtUsd: 50, collectionOverdueUyu: 600, collectionOverdueUsd: 0 }),
      makeClientRow({ debtUyu: 200, debtUsd: 100, collectionOverdueUyu: 200, collectionOverdueUsd: 100 }),
    ];
    const s = sumCobranzaSubtotals(rows);
    expect(s.pendingUyu).toBe(1200);
    expect(s.pendingUsd).toBe(150);
    expect(s.overdueUyu).toBe(800);
    expect(s.overdueUsd).toBe(100);
  });

  it("lista vacía ⇒ ceros", () => {
    expect(sumCobranzaSubtotals([])).toEqual({
      pendingUyu: 0,
      pendingUsd: 0,
      overdueUyu: 0,
      overdueUsd: 0,
    });
  });
});

describe("computeCobranzaKpis — subtotales del modelo de cobranza", () => {
  it("agrega saldo atrasado por due_date y cuenta clientes atrasados", () => {
    const portfolio = [
      makePortfolioRow({
        company_id: "c1",
        debt_uyu: 1000,
        debt_usd: 0,
        overdue_uyu: 1000,
        overdue_usd: 0,
        overdue_days_uyu: 45,
        overdue_days_usd: null,
        oldest_open_invoice_issue_date: daysAgo(45),
      }),
      makePortfolioRow({
        company_id: "c2",
        debt_uyu: 500,
        debt_usd: 0,
        overdue_uyu: 0,
        overdue_usd: 0,
        overdue_days_uyu: null,
        oldest_open_invoice_issue_date: daysAgo(90),
      }),
    ];
    const kpis = computeCobranzaKpis(portfolio, []);
    expect(kpis.collectionOverdueUyu).toBe(1000);
    expect(kpis.collectionOverdueUsd).toBe(0);
    expect(kpis.clientsCollectionOverdueCount).toBe(1);
    expect(kpis.clientsWithDebtCount).toBe(2);
  });
});
