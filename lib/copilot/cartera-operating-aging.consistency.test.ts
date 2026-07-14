import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildClient360Aging } from "@/lib/copilot/client-360-aging";
import { buildCarteraOperatingAging } from "./cartera-operating-aging";
import {
  classifyOperatingDelay,
  type OperatingDelayBucket,
} from "./operating-aging";
import { buildDebtorsReportModel } from "@/lib/reports/debtors-report/build-debtors-report-model";
import { DEFAULT_DEBTORS_REPORT_FILTERS } from "@/lib/reports/debtors-report/debtors-report-types";
import { buildCanonicalFinancialContext } from "@/lib/financial/canonical/report-context";
import { buildCanonicalDebtUnits } from "@/lib/financial/canonical/debt-units";
import { buildCanonicalAgingMetricsFromUnits } from "@/lib/financial/canonical/metrics-from-units";
import type { ClientCompanyDetail, ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import type { OperationalDebtInvoiceInput } from "@/lib/zeta/zeta-operational-debt-dedup";
import type { CanonicalInvoiceInput } from "@/lib/financial/canonical/types";

const CUTOFF = "2026-07-31";

function inv(o: Partial<CanonicalInvoiceInput> & { id: string }): CanonicalInvoiceInput {
  return {
    company_id: "company_id" in o ? o.company_id : "c1",
    currency_code: "currency_code" in o ? o.currency_code : "UYU",
    total_amount: o.total_amount ?? 1000,
    balance_amount: o.balance_amount ?? 1000,
    status: o.status ?? "issued",
    issue_date: o.issue_date ?? "2026-05-01",
    due_date: o.due_date,
    is_active: o.is_active,
    id: o.id,
  };
}

const FIXTURE: CanonicalInvoiceInput[] = [
  inv({ id: "on_time", company_id: "c1", due_date: "2026-08-10", issue_date: "2026-01-05", balance_amount: 500 }),
  inv({ id: "late_1_7", company_id: "c1", due_date: "2026-07-27", issue_date: "2026-07-01", balance_amount: 400 }),
  inv({ id: "late_8_14", company_id: "c2", due_date: "2026-07-20", issue_date: "2026-06-01", balance_amount: 300 }),
  inv({ id: "late_15_30", company_id: "c2", due_date: "2026-07-10", issue_date: "2026-02-01", balance_amount: 200 }),
  inv({ id: "late_30_plus", company_id: "c3", due_date: "2026-06-01", issue_date: "2026-05-15", balance_amount: 100 }),
  inv({ id: "no_due", company_id: "c3", due_date: undefined, issue_date: "2026-06-01", balance_amount: 50 }),
  inv({ id: "usd_late", company_id: "c4", currency_code: "USD", due_date: "2026-07-23", issue_date: "2026-06-01", balance_amount: 75 }),
];

const BUCKET_TO_AGING: Record<OperatingDelayBucket, keyof ReturnType<typeof cartUyu>["aging"]> = {
  on_time: "current",
  late_1_7: "overdue1To7",
  late_8_14: "overdue8To14",
  late_15_30: "overdue15To30",
  late_30_plus: "overdue31Plus",
};

function cartUyu(agg: ReturnType<typeof buildCarteraOperatingAging>) {
  return agg.byCurrency.find((b) => b.currency === "UYU")!;
}

type Comparable = {
  pending: { UYU: number; USD: number };
  current: { UYU: number; USD: number };
  overdue: { UYU: number; USD: number };
  unclassified: { UYU: number; USD: number };
  buckets: Record<"UYU" | "USD", Record<OperatingDelayBucket, number>>;
};

function emptyComparable(): Comparable {
  return {
    pending: { UYU: 0, USD: 0 },
    current: { UYU: 0, USD: 0 },
    overdue: { UYU: 0, USD: 0 },
    unclassified: { UYU: 0, USD: 0 },
    buckets: {
      UYU: { on_time: 0, late_1_7: 0, late_8_14: 0, late_15_30: 0, late_30_plus: 0 },
      USD: { on_time: 0, late_1_7: 0, late_8_14: 0, late_15_30: 0, late_30_plus: 0 },
    },
  };
}

function fromCartera(): Comparable {
  const out = emptyComparable();
  const agg = buildCarteraOperatingAging({ invoices: FIXTURE, cutoffDate: CUTOFF });
  for (const c of agg.byCurrency) {
    out.pending[c.currency] = c.pendingBalance;
    out.current[c.currency] = c.currentBalance;
    out.overdue[c.currency] = c.overdueBalance;
    out.unclassified[c.currency] = c.unclassifiedDueDateBalance;
    out.buckets[c.currency].on_time = c.aging.current;
    out.buckets[c.currency].late_1_7 = c.aging.overdue1To7;
    out.buckets[c.currency].late_8_14 = c.aging.overdue8To14;
    out.buckets[c.currency].late_15_30 = c.aging.overdue15To30;
    out.buckets[c.currency].late_30_plus = c.aging.overdue31Plus;
  }
  return out;
}

function fromHoyClassifier(): Comparable {
  const out = emptyComparable();
  for (const i of FIXTURE) {
    const currency = i.currency_code === "USD" ? "USD" : "UYU";
    const balance = i.balance_amount ?? 0;
    out.pending[currency] += balance;
    if (!i.due_date) {
      out.unclassified[currency] += balance;
      continue;
    }
    const { bucket, isLate } = classifyOperatingDelay(i.due_date, CUTOFF);
    out.buckets[currency][bucket] += balance;
    if (isLate) out.overdue[currency] += balance;
    else out.current[currency] += balance;
  }
  return out;
}

function fromClient360Adapter(): Comparable {
  const out = emptyComparable();
  const opInvoices = FIXTURE.map((i) => ({
    id: i.id ?? "",
    company_id: i.company_id ?? null,
    currency_code: i.currency_code ?? null,
    total_amount: i.total_amount ?? 0,
    balance_amount: i.balance_amount ?? 0,
    status: i.status ?? "issued",
    due_date: i.due_date ?? null,
  })) satisfies OperationalDebtInvoiceInput[];
  const aging360 = buildClient360Aging(opInvoices, { todayYmd: CUTOFF });
  const ctx = buildCanonicalFinancialContext({ workspaceId: "client-360", periodEnd: CUTOFF, cutoffDate: CUTOFF });
  const { units } = buildCanonicalDebtUnits({ invoices: FIXTURE, context: ctx, includeAllIssueDates: true });
  for (const currency of ["UYU", "USD"] as const) {
    const m = buildCanonicalAgingMetricsFromUnits(units, currency, CUTOFF);
    const noDue = units
      .filter((u) => u.currency === currency && u.dueDate === null)
      .reduce((s, u) => s + u.openBalance, 0);
    out.pending[currency] = m.total;
    out.current[currency] = m.current - noDue;
    out.overdue[currency] = m.overdue1To7 + m.overdue8To14 + m.overdue15To30 + m.overdue31Plus;
    out.unclassified[currency] = noDue;
    out.buckets[currency] = aging360[currency];
    out.buckets[currency].on_time -= noDue;
  }
  return out;
}

function debtorsInputs(cartera: Comparable): {
  portfolioRows: ClientPortfolioRow[];
  details: Record<string, ClientCompanyDetail>;
} {
  const byCompany = new Map<string, CanonicalInvoiceInput[]>();
  for (const i of FIXTURE) {
    const id = i.company_id ?? "unknown";
    const list = byCompany.get(id) ?? [];
    list.push(i);
    byCompany.set(id, list);
  }
  const portfolioRows: ClientPortfolioRow[] = [];
  const details: Record<string, ClientCompanyDetail> = {};
  for (const [companyId, invoices] of byCompany) {
    const debtUyu = invoices.filter((i) => i.currency_code !== "USD").reduce((s, i) => s + (i.balance_amount ?? 0), 0);
    const debtUsd = invoices.filter((i) => i.currency_code === "USD").reduce((s, i) => s + (i.balance_amount ?? 0), 0);
    const overdueUyu = invoices
      .filter((i) => i.currency_code !== "USD" && i.due_date && classifyOperatingDelay(i.due_date, CUTOFF).isLate)
      .reduce((s, i) => s + (i.balance_amount ?? 0), 0);
    const overdueUsd = invoices
      .filter((i) => i.currency_code === "USD" && i.due_date && classifyOperatingDelay(i.due_date, CUTOFF).isLate)
      .reduce((s, i) => s + (i.balance_amount ?? 0), 0);
    portfolioRows.push({
      company_id: companyId,
      name: companyId,
      industry: "",
      total_billing: 0,
      total_debt: debtUyu + debtUsd,
      overdue_debt: overdueUyu + overdueUsd,
      invoices_count: invoices.length,
      receipts_count: 0,
      share_pct: 0,
      payment_behavior: "bueno",
      risk: "Bajo",
      source: "contact",
      has_contact_data: true,
      derived_from_debt: true,
      debt_uyu: debtUyu,
      debt_usd: debtUsd,
      overdue_uyu: overdueUyu,
      overdue_usd: overdueUsd,
      open_invoices_count: invoices.length,
    });
    details[companyId] = {
      company_id: companyId,
      company_name: companyId,
      industry: "",
      contacts: [],
      receipts: [],
      invoices: invoices.map((i) => ({
        id: i.id ?? "",
        invoice_number: i.id ?? "",
        issue_date: i.issue_date ?? "",
        due_date: i.due_date ?? "",
        total_amount: i.total_amount ?? 0,
        balance_amount: i.balance_amount ?? 0,
        status: i.status ?? "issued",
        currency_code: i.currency_code,
      })),
      overdue_debt: overdueUyu + overdueUsd,
      total_debt: debtUyu + debtUsd,
      payment_behavior: "bueno",
      risk: "Bajo",
      share_pct: 0,
      debt_uyu: debtUyu,
      debt_usd: debtUsd,
      overdue_uyu: overdueUyu,
      overdue_usd: overdueUsd,
      total_billing: 0,
    };
  }
  expect(cartera.pending.UYU).toBe(portfolioRows.reduce((s, r) => s + r.debt_uyu, 0));
  return { portfolioRows, details };
}

describe("FASE 1C — consistencia cross-module de aging operativo", () => {
  it("Cartera, Hoy y Cliente 360 coinciden por moneda en pending/current/overdue/unclassified/buckets", () => {
    const cartera = fromCartera();
    const hoy = fromHoyClassifier();
    const client360 = fromClient360Adapter();
    expect(cartera).toEqual(hoy);
    expect(cartera).toEqual(client360);
  });

  it("Deudores conserva los mismos totales de saldo pendiente y saldo atrasado por moneda", () => {
    const cartera = fromCartera();
    const { portfolioRows, details } = debtorsInputs(cartera);
    const debtors = buildDebtorsReportModel({
      portfolioRows,
      details,
      filters: DEFAULT_DEBTORS_REPORT_FILTERS,
      emittedAt: new Date(`${CUTOFF}T12:00:00.000Z`),
    });

    expect(debtors.totals.totalDebtUyu).toBe(cartera.pending.UYU);
    expect(debtors.totals.totalDebtUsd).toBe(cartera.pending.USD);
    expect(debtors.totals.totalOverdueUyu).toBe(cartera.overdue.UYU);
    expect(debtors.totals.totalOverdueUsd).toBe(cartera.overdue.USD);
  });

  it("cada documento cae en el bucket que devuelve classifyOperatingDelay (fuente de Hoy)", () => {
    for (const invoice of FIXTURE.filter((i) => i.due_date)) {
      const bucket = classifyOperatingDelay(invoice.due_date!, CUTOFF).bucket;
      const agg = cartUyu(buildCarteraOperatingAging({ invoices: [invoice], cutoffDate: CUTOFF }));
      if (invoice.currency_code === "USD") continue;
      expect(agg.aging[BUCKET_TO_AGING[bucket]]).toBe(invoice.balance_amount);
    }
  });

  it("overdueBalance de Cartera = Σ documentos con isLate (regla de Hoy)", () => {
    const expectedOverdue = FIXTURE.filter(
      (i) => i.currency_code !== "USD" && i.due_date && classifyOperatingDelay(i.due_date, CUTOFF).isLate
    ).reduce((s, i) => s + (i.balance_amount ?? 0), 0);
    const agg = cartUyu(buildCarteraOperatingAging({ invoices: FIXTURE, cutoffDate: CUTOFF }));
    expect(agg.overdueBalance).toBe(expectedOverdue);
  });
  it("buckets de Cartera coinciden con buildCanonicalAgingMetricsFromUnits (primitivo de Cliente 360)", () => {
    const context = buildCanonicalFinancialContext({
      workspaceId: "cartera",
      periodEnd: CUTOFF,
      cutoffDate: CUTOFF,
    });
    const { units } = buildCanonicalDebtUnits({ invoices: FIXTURE, context, includeAllIssueDates: true });
    const canonical = buildCanonicalAgingMetricsFromUnits(units, "UYU", CUTOFF);

    const agg = cartUyu(buildCarteraOperatingAging({ invoices: FIXTURE, cutoffDate: CUTOFF }));

    expect(agg.aging.overdue1To7).toBe(canonical.overdue1To7);
    expect(agg.aging.overdue8To14).toBe(canonical.overdue8To14);
    expect(agg.aging.overdue15To30).toBe(canonical.overdue15To30);
    expect(agg.aging.overdue31Plus).toBe(canonical.overdue31Plus);
    // "Al día" de Cartera excluye saldo sin vencimiento (§10).
    expect(agg.aging.current).toBe(canonical.current - 50);
  });
});

describe("FASE 1C — separación contable/operativa (guards estáticos)", () => {
  const explorerSrc = readFileSync(
    join(process.cwd(), "components/copilot/client-debt-explorer.tsx"),
    "utf-8"
  );
  const builderSrc = readFileSync(
    join(process.cwd(), "lib/copilot/cartera-operating-aging.ts"),
    "utf-8"
  );
  const agingAnalyticsSrc = readFileSync(
    join(process.cwd(), "components/copilot/aging-analytics.tsx"),
    "utf-8"
  );
  const shellSrc = readFileSync(
    join(process.cwd(), "components/copilot/cartera-shell.tsx"),
    "utf-8"
  );

  it("el explorer no importa el modelo de cobranza contable (collection-aging)", () => {
    expect(explorerSrc).not.toMatch(/collection-aging/);
  });

  it("el explorer no clasifica por buckets contables ni por dominantAgingRange", () => {
    expect(explorerSrc).not.toContain("dominantAgingRange");
    expect(explorerSrc).not.toMatch(/AGING_SORT_ORDER/);
  });

  it("el explorer consume el clasificador operativo canónico", () => {
    expect(explorerSrc).toMatch(/from "@\/lib\/copilot\/operating-aging"/);
    expect(explorerSrc).toMatch(/CarteraOperatingAging/);
  });

  it("el builder de Cartera no usa issue_date para clasificar atraso", () => {
    // issue_date puede aparecer en comentarios; no debe usarse como campo de clasificación.
    expect(builderSrc).not.toMatch(/\.issueDate/);
    expect(builderSrc).not.toMatch(/issue_date/);
  });

  it("Cartera no vuelve a mostrar buckets contables 0–30/31–60/61–90/90+ en superficies operativas", () => {
    const combined = `${agingAnalyticsSrc}\n${shellSrc}`;
    expect(combined).not.toMatch(/0-30|0–30|31-60|31–60|61-90|61–90|\+90/);
  });
});
