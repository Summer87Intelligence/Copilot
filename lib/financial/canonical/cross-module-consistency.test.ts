import { describe, expect, it } from "vitest";

import { buildClient360Aging } from "@/lib/copilot/client-360-aging";
import type { OperationalDebtInvoiceInput } from "@/lib/zeta/zeta-operational-debt-dedup";

import { buildCanonicalFinancialContext } from "./report-context";
import { buildCanonicalDebtUnits } from "./debt-units";
import {
  buildCanonicalAgingMetricsFromUnits,
  buildCanonicalDebtMetricsFromUnits,
} from "./metrics-from-units";
import type { CanonicalInstallmentInput, CanonicalInvoiceInput } from "./types";

const TODAY = "2026-07-31";

/**
 * Consistencia cross-module: Cliente 360 y la API canónica de units comparten
 * la MISMA fuente. Para un fixture idéntico deben producir los mismos totales
 * por moneda y los mismos buckets. (Cartera y Hoy se sumarán a este invariante
 * al migrarse en la continuación de FASE 1.)
 */
describe("cross-module aging consistency (Cliente 360 ↔ canonical units)", () => {
  const opInvoices: (Partial<OperationalDebtInvoiceInput> & { id: string })[] = [
    { id: "i1", company_id: "c1", currency_code: "UYU", total_amount: 1000, balance_amount: 1000, status: "issued", due_date: "2026-07-26" }, // 5d
    { id: "i2", company_id: "c1", currency_code: "UYU", total_amount: 500, balance_amount: 500, status: "issued", due_date: "2026-08-15" }, // al día
    { id: "i3", company_id: "c2", currency_code: "USD", total_amount: 300, balance_amount: 300, status: "issued", due_date: "2026-06-16" }, // >30
  ];

  const canonicalInvoices: CanonicalInvoiceInput[] = opInvoices.map((r) => ({
    id: r.id,
    company_id: r.company_id ?? null,
    currency_code: r.currency_code ?? null,
    total_amount: Number(r.total_amount ?? 0),
    balance_amount: Number(r.balance_amount ?? 0),
    status: r.status ?? "issued",
    issue_date: "2026-05-01",
    due_date: r.due_date as string | undefined,
  }));

  const installments: CanonicalInstallmentInput[] = [];

  it("mismos buckets UYU/USD y mismo saldo atrasado", () => {
    const aging360 = buildClient360Aging(opInvoices as OperationalDebtInvoiceInput[], {
      todayYmd: TODAY,
      installments,
    });

    const ctx = buildCanonicalFinancialContext({
      workspaceId: "x",
      periodEnd: TODAY,
      cutoffDate: TODAY,
    });
    const { units } = buildCanonicalDebtUnits({
      invoices: canonicalInvoices,
      installments,
      context: ctx,
      includeAllIssueDates: true,
    });

    const agingUYU = buildCanonicalAgingMetricsFromUnits(units, "UYU", TODAY);
    const agingUSD = buildCanonicalAgingMetricsFromUnits(units, "USD", TODAY);
    const debtUYU = buildCanonicalDebtMetricsFromUnits(units, "UYU", TODAY);

    // Buckets coinciden entre módulos.
    expect(aging360.UYU.late_1_7).toBe(agingUYU.overdue1To7);
    expect(aging360.UYU.on_time).toBe(agingUYU.current);
    expect(aging360.USD.late_30_plus).toBe(agingUSD.overdue31Plus);

    // Saldo atrasado UYU = suma de buckets de atraso = overdueBalance.
    const lateUYU =
      aging360.UYU.late_1_7 +
      aging360.UYU.late_8_14 +
      aging360.UYU.late_15_30 +
      aging360.UYU.late_30_plus;
    expect(lateUYU).toBe(debtUYU.overdueBalance);

    // Invariante: pendiente = al día + atrasado.
    expect(debtUYU.pendingBalance).toBe(
      Math.round((debtUYU.currentBalance + debtUYU.overdueBalance) * 100) / 100
    );

    // UYU y USD nunca se suman.
    expect(agingUYU.total).toBe(1500);
    expect(agingUSD.total).toBe(300);
  });
});
