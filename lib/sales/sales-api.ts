/**
 * FASE 9 — Contrato de filtros + builders de respuesta del módulo Ventas.
 *
 * Fuente única de filtros (reutilizada por API, UI y URL). Los builders son
 * puros: reciben el dataset canónico ya cargado y devuelven payloads JSON.
 */

import {
  buildSalesPeriodSnapshot,
  buildProductSalesSummary,
  buildCustomerSalesSummary,
  buildSalespersonSummary,
  buildSalesCollectionSummary,
  buildSalesComparison,
  buildUnclassifiedSalesSummary,
} from "@/lib/sales/canonical/sales-aggregations";
import {
  buildCommercialHighlights,
  buildServicePeriodComparison,
  buildYearlyMonthlyRows,
  enrichProductsWithVariation,
} from "@/lib/sales/canonical/sales-analytics";
import { buildSalesExecutiveInsights } from "@/lib/sales/canonical/sales-insights";
import { suggestForConcept } from "@/lib/sales/canonical/sales-normalization";
import {
  resolvePeriodRange,
  resolveComparisonRange,
  isValidPeriodPreset,
  isValidComparisonMode,
  type SalesPeriodPreset,
  type SalesComparisonMode,
} from "@/lib/sales/sales-period";
import type { CanonicalSaleDocument, SalesCurrency } from "@/lib/sales/canonical/types";
import type { SalesCatalogView } from "@/lib/sales/canonical/catalog-types";

export type SalesFilters = {
  preset: SalesPeriodPreset;
  dateFrom: string;
  dateTo: string;
  comparisonMode: SalesComparisonMode;
  comparisonDateFrom: string;
  comparisonDateTo: string;
  currencies: SalesCurrency[] | null;
  productIds: string[] | null;
  categoryIds: string[] | null;
  customerIds: string[] | null;
  classificationStatus: string[] | null;
  /** Filtro por comercial. "unassigned" = documentos sin comercial asignado. */
  salespersonIds: string[] | null;
  paymentStatus: "paid" | "pending" | null;
  search: string | null;
  amountMin: number | null;
  amountMax: number | null;
  page: number;
  pageSize: number;
  sortBy: string;
  sortDirection: "asc" | "desc";
};

function csv(v: string | null): string[] | null {
  if (!v) return null;
  const arr = v.split(",").map((s) => s.trim()).filter(Boolean);
  return arr.length ? arr : null;
}

/**
 * Parsea filtros desde query params. `today` se inyecta (Montevideo) para
 * resolver presets de período de forma determinística.
 *
 * URL compatible:
 *   ?preset=this_month
 *   ?year=2026&month=7
 *   ?from=2026-07-01&to=2026-07-31
 */
export function parseSalesFilters(params: URLSearchParams, today: string): SalesFilters {
  const yearRaw = params.get("year");
  const monthRaw = params.get("month");
  const yearNum = yearRaw ? parseInt(yearRaw, 10) : NaN;
  const monthNum = monthRaw ? parseInt(monthRaw, 10) : NaN;
  const hasYearMonth =
    Number.isFinite(yearNum) &&
    yearNum >= 2020 &&
    yearNum <= 2100 &&
    Number.isFinite(monthNum) &&
    monthNum >= 1 &&
    monthNum <= 12;

  let preset: SalesPeriodPreset;
  let period: { from: string; to: string };

  if (hasYearMonth) {
    const mm = String(monthNum).padStart(2, "0");
    const from = `${yearNum}-${mm}-01`;
    const last = lastDayOfMonth(yearNum, monthNum);
    const monthEnd = `${yearNum}-${mm}-${String(last).padStart(2, "0")}`;
    const isCurrentMonth = partsYmd(today).y === yearNum && partsYmd(today).m === monthNum;
    preset = "custom";
    period = { from, to: isCurrentMonth && today < monthEnd ? today : monthEnd };
  } else {
    const presetRaw = params.get("preset");
    preset = isValidPeriodPreset(presetRaw) ? presetRaw : "this_month";
    // Si vienen from/to sin preset custom, forzar custom.
    const fromParam = params.get("from");
    const toParam = params.get("to");
    if (fromParam && toParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) && /^\d{4}-\d{2}-\d{2}$/.test(toParam)) {
      preset = "custom";
    }
    period = resolvePeriodRange(preset, today, {
      from: fromParam ?? undefined,
      to: toParam ?? undefined,
    });
  }

  const cmpRaw = params.get("comparison");
  // Mes completo histórico → previous_month; mes en curso → same_elapsed_days.
  const defaultCmp: SalesComparisonMode =
    period.to === today && period.from === `${partsYmd(today).y}-${String(partsYmd(today).m).padStart(2, "0")}-01`
      ? "same_elapsed_days"
      : hasYearMonth
        ? "previous_month"
        : "same_elapsed_days";
  const comparisonMode: SalesComparisonMode = isValidComparisonMode(cmpRaw) ? cmpRaw : defaultCmp;
  const cmp = resolveComparisonRange(comparisonMode, period, {
    from: params.get("cmpFrom") ?? undefined,
    to: params.get("cmpTo") ?? undefined,
  });

  const curRaw = csv(params.get("currencies"));
  const currencies = curRaw
    ? (curRaw.filter((c) => c === "UYU" || c === "USD") as SalesCurrency[])
    : null;

  const payment = params.get("payment");
  const paymentStatus = payment === "paid" || payment === "pending" ? payment : null;

  const pageRaw = parseInt(params.get("page") ?? "1", 10);
  const pageSizeRaw = parseInt(params.get("pageSize") ?? "50", 10);
  const amountMin = params.get("amountMin");
  const amountMax = params.get("amountMax");

  return {
    preset,
    dateFrom: period.from,
    dateTo: period.to,
    comparisonMode,
    comparisonDateFrom: cmp.from,
    comparisonDateTo: cmp.to,
    currencies: currencies && currencies.length ? currencies : null,
    productIds: csv(params.get("productIds")),
    categoryIds: csv(params.get("categoryIds")),
    customerIds: csv(params.get("customerIds")),
    classificationStatus: csv(params.get("classificationStatus")),
    salespersonIds: csv(params.get("salespersonIds")),
    paymentStatus,
    search: (params.get("search") ?? "").trim() || null,
    amountMin: amountMin != null && amountMin !== "" && Number.isFinite(Number(amountMin)) ? Number(amountMin) : null,
    amountMax: amountMax != null && amountMax !== "" && Number.isFinite(Number(amountMax)) ? Number(amountMax) : null,
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
    pageSize: Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.min(pageSizeRaw, 200) : 50,
    sortBy: params.get("sortBy") || "date",
    sortDirection: params.get("sortDirection") === "asc" ? "asc" : "desc",
  };
}

function partsYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  return { y: y!, m: m!, d: d! };
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// ---------------------------------------------------------------------------
// Overview (Resumen / Productos / Clientes / Comparativo / Clasificación)
// ---------------------------------------------------------------------------

export function buildSalesOverview(
  documents: readonly CanonicalSaleDocument[],
  catalog: SalesCatalogView,
  filters: SalesFilters,
  options?: {
    firstSaleByCustomerId?: Map<string, string>;
    assignedCustomerCountBySalesperson?: Map<string | null, number>;
  }
) {
  const { dateFrom, dateTo, comparisonDateFrom, comparisonDateTo } = filters;
  const aggOpts = {
    firstSaleByCustomerId: options?.firstSaleByCustomerId,
    assignedCustomerCountBySalesperson: options?.assignedCustomerCountBySalesperson,
  };

  const snapshot = buildSalesPeriodSnapshot(documents, dateFrom, dateTo, aggOpts);
  const productsRaw = buildProductSalesSummary(documents, dateFrom, dateTo);
  const productsPrev = buildProductSalesSummary(documents, comparisonDateFrom, comparisonDateTo);
  const products = enrichProductsWithVariation(productsRaw, productsPrev);
  const customers = buildCustomerSalesSummary(documents, dateFrom, dateTo, aggOpts);
  const salespersons = buildSalespersonSummary(documents, dateFrom, dateTo, aggOpts);
  const collection = buildSalesCollectionSummary(documents, dateFrom, dateTo);
  const comparison = buildSalesComparison(
    documents,
    dateFrom,
    dateTo,
    comparisonDateFrom,
    comparisonDateTo,
    aggOpts
  );
  const serviceComparison = buildServicePeriodComparison(
    documents,
    dateFrom,
    dateTo,
    comparisonDateFrom,
    comparisonDateTo
  );
  const unclassified = buildUnclassifiedSalesSummary(documents, dateFrom, dateTo, (d, c) =>
    suggestForConcept(d, c, catalog)
  );
  const highlights = buildCommercialHighlights(documents, dateFrom, dateTo);
  const insights = buildSalesExecutiveInsights({
    snapshot,
    comparison,
    products: productsRaw,
    customers,
    salespersons,
    comparisonLabel: COMPARISON_LABELS[filters.comparisonMode],
  });

  /**
   * Case C a nivel servicios: las NC no se imputan a un servicio sin vínculo
   * confiable. La tabla de servicios muestra ventas emitidas; este bloque
   * permite reconciliar: Σ servicios − ajustes no vinculados ≈ ventas netas.
   */
  const serviceEmitted = productsRaw.reduce(
    (acc, p) => {
      acc.UYU += p.totalByCurrency.UYU;
      acc.USD += p.totalByCurrency.USD;
      return acc;
    },
    { UYU: 0, USD: 0 }
  );

  return {
    period: { from: dateFrom, to: dateTo, preset: filters.preset },
    comparisonWindow: {
      from: comparisonDateFrom,
      to: comparisonDateTo,
      mode: filters.comparisonMode,
    },
    snapshot,
    products,
    customers,
    salespersons,
    collection,
    comparison,
    serviceComparison,
    highlights,
    unclassified,
    insights,
    /** Ajustes (NC) no vinculados a servicios — Case C. */
    unlinkedServiceAdjustments: {
      creditNoteCount: snapshot.creditNoteCount,
      creditNotesByCurrency: snapshot.creditNotes,
      serviceEmittedByCurrency: {
        UYU: Math.round(serviceEmitted.UYU * 100) / 100,
        USD: Math.round(serviceEmitted.USD * 100) / 100,
      },
      netSalesByCurrency: snapshot.netSalesByCurrency,
      note:
        "Las notas de crédito no se distribuyen entre servicios sin vínculo confiable a factura/línea. Se restan del total general (ventas netas).",
    },
  };
}

/** Vista anual mes a mes (Comparativo). */
export function buildSalesYearlyView(
  documents: readonly CanonicalSaleDocument[],
  year: number,
  today: string
) {
  return {
    year,
    months: buildYearlyMonthlyRows(documents, year, today),
  };
}

const COMPARISON_LABELS: Record<SalesComparisonMode, string> = {
  previous_period: "el período anterior",
  previous_month: "el mes anterior",
  same_elapsed_days: "el mismo tramo del mes anterior",
  custom: "el período de comparación",
};

export type SalesOverview = ReturnType<typeof buildSalesOverview>;

// ---------------------------------------------------------------------------
// Details (línea de venta, paginado)
// ---------------------------------------------------------------------------

export type SalesDetailRow = {
  documentId: string;
  lineId: string;
  date: string;
  dueDate: string | null;
  customerId: string | null;
  customerName: string;
  documentNumber: string | null;
  documentType: string;
  kind: "sale" | "credit_note";
  productId: string | null;
  productGroupKey: string;
  /** Nombre visible del servicio (concepto Zeta o catálogo). Nunca "Sin clasificar". */
  productName: string;
  /** Solo se muestra debajo si aporta info distinta al servicio. */
  originalDescription: string;
  originalConcept: string | null;
  originalCode: string | null;
  normalizationStatus: "canonical" | "original" | "missing_detail";
  classificationStatus: string;
  quantity: number;
  unitPrice: number | null;
  netAmount: number | null;
  taxAmount: number | null;
  currency: string;
  lineAmount: number;
  /** Comercial asignado al documento (desde 2026-07-01). null = Sin asignar. */
  salespersonId: string | null;
  salespersonName: string | null;
  /** Valores de documento (no de línea): se muestran a nivel comprobante. */
  docTotal: number;
  docApplied: number;
  docRegistered: number;
  docPending: number;
  isFirstLineOfDoc: boolean;
};

function inWindow(date: string, from: string, to: string): boolean {
  const d = date.slice(0, 10);
  return d >= from && d <= to;
}

export function buildSalesDetails(
  documents: readonly CanonicalSaleDocument[],
  filters: SalesFilters
): { rows: SalesDetailRow[]; total: number; page: number; pageSize: number } {
  const all: SalesDetailRow[] = [];
  const search = filters.search?.toLowerCase() ?? null;

  for (const doc of documents) {
    if (!inWindow(doc.issueDate, filters.dateFrom, filters.dateTo)) continue;
    if (filters.customerIds && (!doc.customerId || !filters.customerIds.includes(doc.customerId))) continue;
    if (filters.currencies && (doc.currency === "UNKNOWN" || !filters.currencies.includes(doc.currency))) continue;
    if (filters.paymentStatus === "paid" && doc.pendingAmount > 0.005) continue;
    if (filters.paymentStatus === "pending" && doc.pendingAmount <= 0.005) continue;

    doc.lines.forEach((line, idx) => {
      if (filters.productIds) {
        if (!filters.productIds.includes(line.productGroupKey)) return;
      }
      if (filters.categoryIds && (!line.canonicalCategoryId || !filters.categoryIds.includes(line.canonicalCategoryId))) return;
      if (filters.classificationStatus && !filters.classificationStatus.includes(line.classificationStatus)) return;
      if (filters.amountMin != null && line.lineAmount < filters.amountMin) return;
      if (filters.amountMax != null && line.lineAmount > filters.amountMax) return;
      if (filters.salespersonIds && !filters.salespersonIds.includes(doc.salespersonId ?? "unassigned")) return;
      if (search) {
        const hay = `${doc.customerName} ${line.displayProductName} ${line.originalDescription} ${doc.documentNumber ?? ""}`.toLowerCase();
        if (!hay.includes(search)) return;
      }
      all.push({
        documentId: doc.documentId,
        lineId: line.lineId,
        date: doc.issueDate,
        dueDate: doc.dueDate,
        customerId: doc.customerId,
        customerName: doc.customerName,
        documentNumber: doc.documentNumber,
        documentType: doc.documentType,
        kind: doc.kind,
        productId: line.canonicalProductId,
        productGroupKey: line.productGroupKey,
        productName: line.displayProductName,
        originalDescription: line.originalDescription,
        originalConcept: line.originalConcept,
        originalCode: line.originalCode,
        normalizationStatus: line.normalizationStatus,
        classificationStatus: line.classificationStatus,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        netAmount: line.netAmount,
        taxAmount: line.taxAmount,
        currency: line.currency,
        lineAmount: line.lineAmount,
        salespersonId: doc.salespersonId,
        salespersonName: doc.salespersonName,
        docTotal: doc.grossAmount,
        docApplied: doc.appliedAmount,
        docRegistered: doc.registeredAmount,
        docPending: doc.pendingAmount,
        isFirstLineOfDoc: idx === 0,
      });
    });
  }

  // Sort
  const dir = filters.sortDirection === "asc" ? 1 : -1;
  all.sort((a, b) => {
    switch (filters.sortBy) {
      case "amount":
        return (a.lineAmount - b.lineAmount) * dir;
      case "customer":
        return a.customerName.localeCompare(b.customerName) * dir;
      case "product":
        return (a.productName ?? a.originalDescription).localeCompare(b.productName ?? b.originalDescription) * dir;
      case "date":
      default:
        return (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) * dir;
    }
  });

  const total = all.length;
  const start = (filters.page - 1) * filters.pageSize;
  const rows = all.slice(start, start + filters.pageSize);
  return { rows, total, page: filters.page, pageSize: filters.pageSize };
}
