import { describe, expect, it } from "vitest";

import { buildCarteraOperatingAging } from "./cartera-operating-aging";
import type {
  CanonicalInstallmentInput,
  CanonicalInvoiceInput,
} from "@/lib/financial/canonical/types";

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
    is_credit_note: o.is_credit_note,
    id: o.id,
  };
}

function build(invoices: CanonicalInvoiceInput[], installments?: CanonicalInstallmentInput[]) {
  return buildCarteraOperatingAging({ invoices, installments, cutoffDate: CUTOFF });
}

function uyu(agg: ReturnType<typeof build>) {
  return agg.byCurrency.find((b) => b.currency === "UYU")!;
}

describe("buildCarteraOperatingAging — bordes de bucket (due_date)", () => {
  const cases: Array<[string, string, keyof ReturnType<typeof uyu>["aging"]]> = [
    ["vence en cutoff → al día", CUTOFF, "current"],
    ["1 día de atraso", "2026-07-30", "overdue1To7"],
    ["7 días de atraso", "2026-07-24", "overdue1To7"],
    ["8 días de atraso", "2026-07-23", "overdue8To14"],
    ["14 días de atraso", "2026-07-17", "overdue8To14"],
    ["15 días de atraso", "2026-07-16", "overdue15To30"],
    ["30 días de atraso", "2026-07-01", "overdue15To30"],
    ["31 días de atraso", "2026-06-30", "overdue31Plus"],
  ];
  for (const [name, due, bucket] of cases) {
    it(name, () => {
      const agg = uyu(build([inv({ id: "1", due_date: due, balance_amount: 1000 })]));
      expect(agg.aging[bucket]).toBe(1000);
    });
  }
});

describe("buildCarteraOperatingAging — invariantes", () => {
  it("pending = current + overdue + unclassified; overdue = Σ buckets de atraso", () => {
    const agg = uyu(
      build([
        inv({ id: "a", balance_amount: 400, due_date: "2026-07-24" }), // 1-7
        inv({ id: "b", balance_amount: 600, due_date: "2026-08-15" }), // al día
        inv({ id: "c", balance_amount: 300, due_date: undefined }), // sin due
        inv({ id: "d", balance_amount: 100, due_date: "2026-06-30" }), // +30
      ])
    );
    expect(agg.pendingBalance).toBe(1400);
    expect(agg.currentBalance + agg.overdueBalance + agg.unclassifiedDueDateBalance).toBe(
      agg.pendingBalance
    );
    expect(
      agg.aging.overdue1To7 +
        agg.aging.overdue8To14 +
        agg.aging.overdue15To30 +
        agg.aging.overdue31Plus
    ).toBe(agg.overdueBalance);
    expect(agg.unclassifiedDueDateBalance).toBe(300);
  });

  it("saldo sin fecha de vencimiento no aparece como al día y conserva la invariante por moneda", () => {
    const agg = build([
      inv({ id: "uyu-missing", currency_code: "UYU", balance_amount: 120, due_date: undefined }),
      inv({ id: "uyu-current", currency_code: "UYU", balance_amount: 80, due_date: "2026-08-15" }),
      inv({ id: "usd-missing", currency_code: "USD", balance_amount: 50, due_date: undefined }),
      inv({ id: "usd-late", currency_code: "USD", balance_amount: 30, due_date: "2026-06-30" }),
    ]);
    const uyuAgg = agg.byCurrency.find((b) => b.currency === "UYU")!;
    const usdAgg = agg.byCurrency.find((b) => b.currency === "USD")!;

    expect(uyuAgg.pendingBalance).toBe(200);
    expect(uyuAgg.currentBalance).toBe(80);
    expect(uyuAgg.aging.current).toBe(80);
    expect(uyuAgg.unclassifiedDueDateBalance).toBe(120);
    expect(uyuAgg.currentBalance + uyuAgg.overdueBalance + uyuAgg.unclassifiedDueDateBalance).toBe(
      uyuAgg.pendingBalance
    );

    expect(usdAgg.pendingBalance).toBe(80);
    expect(usdAgg.currentBalance).toBe(0);
    expect(usdAgg.aging.current).toBe(0);
    expect(usdAgg.overdueBalance).toBe(30);
    expect(usdAgg.unclassifiedDueDateBalance).toBe(50);
    expect(usdAgg.currentBalance + usdAgg.overdueBalance + usdAgg.unclassifiedDueDateBalance).toBe(
      usdAgg.pendingBalance
    );
  });

  it("suma byCompany = global (pending y overdue)", () => {
    const agg = build([
      inv({ id: "a", company_id: "c1", balance_amount: 500, due_date: "2026-06-30" }),
      inv({ id: "b", company_id: "c2", balance_amount: 700, due_date: "2026-08-15" }),
    ]);
    const g = uyu(agg);
    const sumPending = agg.byCompany.reduce(
      (s, co) => s + (co.byCurrency.find((b) => b.currency === "UYU")?.pendingBalance ?? 0),
      0
    );
    const sumOverdue = agg.byCompany.reduce(
      (s, co) => s + (co.byCurrency.find((b) => b.currency === "UYU")?.overdueBalance ?? 0),
      0
    );
    expect(sumPending).toBe(g.pendingBalance);
    expect(sumOverdue).toBe(g.overdueBalance);
  });

  it("clientes con atraso deduplicados; multi-moneda separado + unión", () => {
    const agg = build([
      inv({ id: "a", company_id: "c1", currency_code: "UYU", balance_amount: 100, due_date: "2026-06-30" }),
      inv({ id: "b", company_id: "c1", currency_code: "UYU", balance_amount: 200, due_date: "2026-06-10" }),
      inv({ id: "c", company_id: "c1", currency_code: "USD", balance_amount: 50, due_date: "2026-06-30" }),
      inv({ id: "d", company_id: "c2", currency_code: "UYU", balance_amount: 300, due_date: "2026-08-15" }),
    ]);
    expect(uyu(agg).overdueClients).toBe(1); // c1 (no duplica por 2 facturas)
    expect(agg.byCurrency.find((b) => b.currency === "USD")!.overdueClients).toBe(1);
    expect(agg.overdueClientsAnyCurrency).toBe(1); // unión c1
  });
});

describe("buildCarteraOperatingAging — cuotas y exclusiones", () => {
  it("cuotas: sin doble conteo, aging por cuota y facturas visibles únicas por bucket", () => {
    const installments: CanonicalInstallmentInput[] = [
      { id: "q1", invoice_id: "i1", currency_code: "UYU", cuota_saldo: 1000, cuota_vencimiento: "2026-06-30" },
      { id: "q2", invoice_id: "i1", currency_code: "UYU", cuota_saldo: 1000, cuota_vencimiento: "2026-08-15" },
    ];
    const agg = uyu(build([inv({ id: "i1", balance_amount: 2000, due_date: "2026-06-01" })], installments));
    expect(agg.pendingBalance).toBe(2000);
    expect(agg.aging.overdue31Plus).toBe(1000);
    expect(agg.aging.current).toBe(1000);
    expect(agg.buckets.find((b) => b.bucket === "late_30_plus")?.invoiceCount).toBe(1);
    expect(agg.buckets.find((b) => b.bucket === "late_30_plus")?.debtUnitCount).toBe(1);
    expect(agg.buckets.find((b) => b.bucket === "on_time")?.invoiceCount).toBe(1);
    expect(agg.buckets.find((b) => b.bucket === "on_time")?.debtUnitCount).toBe(1);
  });

  it("varias cuotas abiertas de la misma factura en el mismo bucket cuentan una factura visible", () => {
    const installments: CanonicalInstallmentInput[] = [
      { id: "q1", invoice_id: "i1", currency_code: "UYU", cuota_saldo: 100, cuota_vencimiento: "2026-07-30" },
      { id: "q2", invoice_id: "i1", currency_code: "UYU", cuota_saldo: 200, cuota_vencimiento: "2026-07-29" },
      { id: "q3", invoice_id: "i1", currency_code: "UYU", cuota_saldo: 300, cuota_vencimiento: "2026-07-28" },
    ];
    const agg = uyu(build([inv({ id: "i1", balance_amount: 600, due_date: "2026-06-01" })], installments));
    const row = agg.buckets.find((b) => b.bucket === "late_1_7")!;
    expect(row.amount).toBe(600);
    expect(row.invoiceCount).toBe(1);
    expect(row.debtUnitCount).toBe(3);
  });

  it("cuota parcial: solo saldo abierto", () => {
    const installments: CanonicalInstallmentInput[] = [
      { id: "q1", invoice_id: "i1", currency_code: "UYU", cuota_saldo: 300, cuota_vencimiento: "2026-06-30" },
    ];
    const agg = uyu(build([inv({ id: "i1", total_amount: 1000, balance_amount: 300, due_date: "2026-06-01" })], installments));
    expect(agg.pendingBalance).toBe(300);
    expect(agg.aging.overdue31Plus).toBe(300);
  });

  it("mismatch de cuotas: diagnóstico, sin duplicar dinero", () => {
    const installments: CanonicalInstallmentInput[] = [
      { id: "q1", invoice_id: "i1", currency_code: "UYU", cuota_saldo: 500, cuota_vencimiento: "2026-06-30" },
    ];
    const agg = build([inv({ id: "i1", balance_amount: 2000, due_date: "2026-06-01" })], installments);
    expect(agg.diagnosticCounts.installment_balance_mismatch).toBe(1);
    expect(uyu(agg).pendingBalance).toBe(500);
    expect(uyu(agg).buckets.find((b) => b.bucket === "late_30_plus")?.invoiceCount).toBe(1);
  });

  it("void y pre-2026 excluidas; balance 0 excluido", () => {
    const agg = uyu(
      build([
        inv({ id: "void", status: "cancelled", balance_amount: 1000, due_date: "2026-06-30" }),
        inv({ id: "old", issue_date: "2025-12-01", balance_amount: 999, due_date: "2025-12-30" }),
        inv({ id: "paid", balance_amount: 0, due_date: "2026-06-30" }),
        inv({ id: "ok", balance_amount: 100, due_date: "2026-08-15" }),
      ])
    );
    expect(agg.pendingBalance).toBe(100);
  });
});
