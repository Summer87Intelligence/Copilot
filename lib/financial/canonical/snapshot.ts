/**
 * FINANCIAL CANONICAL LAYER — Debt snapshot.
 *
 * `buildCanonicalDebtSnapshot` construye las debt units UNA sola vez y expone la
 * vista agregada por moneda + por cliente + diagnósticos + clientes con atraso.
 * Es la fuente única que consumen Cliente 360, Cartera, Hoy y Reportes: ningún
 * módulo debe reagregar unidades por su cuenta.
 */

import { buildCanonicalDebtUnits } from "./debt-units";
import {
  buildCanonicalAgingMetricsFromUnits,
  buildCanonicalDebtMetricsFromUnits,
} from "./metrics-from-units";
import { SUPPORTED_CURRENCIES } from "./currency";
import type {
  CanonicalCompanyDebtSnapshot,
  CanonicalDebtCurrencyBlock,
  CanonicalDebtSnapshot,
  CanonicalDebtUnit,
  CanonicalFinancialContext,
  CanonicalInstallmentInput,
  CanonicalInvoiceInput,
  FinancialCurrency,
} from "./types";

export interface BuildCanonicalDebtSnapshotInput {
  invoices: readonly CanonicalInvoiceInput[];
  installments?: readonly CanonicalInstallmentInput[];
  context: CanonicalFinancialContext;
  /** Ver `buildCanonicalDebtUnits`. Default `false`. */
  includeAllIssueDates?: boolean;
}

function blockFromUnits(
  units: readonly CanonicalDebtUnit[],
  currency: FinancialCurrency,
  cutoffDate: string
): CanonicalDebtCurrencyBlock {
  return {
    currency,
    metrics: buildCanonicalDebtMetricsFromUnits(units, currency, cutoffDate),
    aging: buildCanonicalAgingMetricsFromUnits(units, currency, cutoffDate),
    units: units.filter((u) => u.currency === currency),
  };
}

export function buildCanonicalDebtSnapshot(
  input: BuildCanonicalDebtSnapshotInput
): CanonicalDebtSnapshot {
  const { context } = input;
  const cutoffDate = context.cutoffDate;
  const currencies =
    context.currencies.length > 0 ? context.currencies : [...SUPPORTED_CURRENCIES];

  const { units, diagnostics, diagnosticCounts } = buildCanonicalDebtUnits({
    invoices: input.invoices,
    installments: input.installments,
    context,
    includeAllIssueDates: input.includeAllIssueDates,
  });

  const byCurrency: CanonicalDebtCurrencyBlock[] = currencies.map((c) =>
    blockFromUnits(units, c, cutoffDate)
  );

  // Agrupar unidades por cliente para el detalle por compañía.
  const unitsByCompany = new Map<string, CanonicalDebtUnit[]>();
  for (const u of units) {
    const key = u.companyId ?? "";
    if (!key) continue;
    const list = unitsByCompany.get(key) ?? [];
    list.push(u);
    unitsByCompany.set(key, list);
  }

  const byCompany: CanonicalCompanyDebtSnapshot[] = [];
  const overdueClientsByCurrency = {
    UYU: new Set<string>(),
    USD: new Set<string>(),
  } as Record<FinancialCurrency, Set<string>>;

  for (const [companyId, companyUnits] of unitsByCompany) {
    const blocks: CanonicalDebtCurrencyBlock[] = currencies.map((c) =>
      blockFromUnits(companyUnits, c, cutoffDate)
    );
    for (const b of blocks) {
      if (b.metrics.overdueBalance > 0) overdueClientsByCurrency[b.currency].add(companyId);
    }
    byCompany.push({ companyId, byCurrency: blocks });
  }

  const anyCurrency = new Set<string>();
  for (const c of currencies) {
    for (const id of overdueClientsByCurrency[c]) anyCurrency.add(id);
  }

  return {
    cutoffDate,
    byCurrency,
    byCompany,
    diagnostics,
    diagnosticCounts,
    overdueClientsByCurrency: {
      UYU: [...overdueClientsByCurrency.UYU],
      USD: [...overdueClientsByCurrency.USD],
    },
    overdueClientsAnyCurrency: [...anyCurrency],
  };
}
