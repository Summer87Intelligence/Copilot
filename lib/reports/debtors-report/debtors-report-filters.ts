import type { NextRequest } from "next/server";

import type {
  DebtorsReportContactFilter,
  DebtorsReportCurrencyFilter,
  DebtorsReportFilters,
  DebtorsReportOverdueDaysFilter,
  DebtorsReportStatusFilter,
} from "./debtors-report-types";
import { DEFAULT_DEBTORS_REPORT_FILTERS } from "./debtors-report-types";

function parseEnum<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T {
  const v = raw?.trim() as T | undefined;
  return v && allowed.includes(v) ? v : fallback;
}

function parseNonNegativeNumber(raw: string | null): number {
  if (!raw?.trim()) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function parseDebtorsReportFiltersFromSearchParams(
  sp: URLSearchParams | NextRequest["nextUrl"]["searchParams"]
): DebtorsReportFilters {
  return {
    currency: parseEnum<DebtorsReportCurrencyFilter>(
      sp.get("currency"),
      ["all", "UYU", "USD"],
      DEFAULT_DEBTORS_REPORT_FILTERS.currency
    ),
    status: parseEnum<DebtorsReportStatusFilter>(
      sp.get("status"),
      ["all", "overdue", "critical", "without_contact"],
      DEFAULT_DEBTORS_REPORT_FILTERS.status
    ),
    minUyu: parseNonNegativeNumber(sp.get("minUyu")),
    minUsd: parseNonNegativeNumber(sp.get("minUsd")),
    overdueDays: parseEnum<DebtorsReportOverdueDaysFilter>(
      sp.get("overdueDays"),
      ["all", "30", "60", "90"],
      DEFAULT_DEBTORS_REPORT_FILTERS.overdueDays
    ),
    contact: parseEnum<DebtorsReportContactFilter>(
      sp.get("contact"),
      ["all", "with_contact", "without_contact"],
      DEFAULT_DEBTORS_REPORT_FILTERS.contact
    ),
  };
}

export function debtorsReportFiltersToSearchParams(
  filters: DebtorsReportFilters
): URLSearchParams {
  const sp = new URLSearchParams();
  if (filters.currency !== "all") sp.set("currency", filters.currency);
  if (filters.status !== "all") sp.set("status", filters.status);
  if (filters.minUyu > 0) sp.set("minUyu", String(filters.minUyu));
  if (filters.minUsd > 0) sp.set("minUsd", String(filters.minUsd));
  if (filters.overdueDays !== "all") sp.set("overdueDays", filters.overdueDays);
  if (filters.contact !== "all") sp.set("contact", filters.contact);
  return sp;
}

/** Etiquetas de filtros que restringen el reporte (omite valores por defecto). */
export function describeActiveDebtorsReportFilters(filters: DebtorsReportFilters): string[] {
  const labels: string[] = [];

  if (filters.currency === "UYU") labels.push("Moneda: solo pesos");
  else if (filters.currency === "USD") labels.push("Moneda: solo dólares");

  switch (filters.status) {
    case "overdue":
      labels.push("Estado: solo vencidos");
      break;
    case "critical":
      labels.push("Estado: solo críticos");
      break;
    case "without_contact":
      labels.push("Estado: sin contacto");
      break;
  }

  if (filters.minUyu > 0) {
    labels.push(`Mínimo UYU: $ ${filters.minUyu.toLocaleString("es-UY")}`);
  }
  if (filters.minUsd > 0) {
    labels.push(`Mínimo USD: U$S ${filters.minUsd.toLocaleString("es-UY")}`);
  }

  if (filters.overdueDays !== "all") {
    labels.push(`Antigüedad: vencidos más de ${filters.overdueDays} días`);
  }

  switch (filters.contact) {
    case "with_contact":
      labels.push("Contacto: con WhatsApp o email");
      break;
    case "without_contact":
      labels.push("Contacto: sin contacto");
      break;
  }

  return labels;
}

/** @deprecated Usar describeActiveDebtorsReportFilters */
export function describeDebtorsReportFilters(filters: DebtorsReportFilters): string[] {
  return describeActiveDebtorsReportFilters(filters);
}
