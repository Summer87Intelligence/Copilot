/**
 * FASE 9C — Analytics comerciales: yearly, drill-downs y comparación por servicio.
 * Funciones puras sobre el dataset canónico (sin I/O).
 */

import {
  emptyCurrencyPair,
  type CanonicalSaleDocument,
  type CurrencyPair,
  type ProductSalesSummaryRow,
  type SalesCurrency,
} from "@/lib/sales/canonical/types";
import {
  buildCustomerSalesSummary,
  buildProductSalesSummary,
  buildSalesPeriodSnapshot,
  buildSalespersonSummary,
} from "@/lib/sales/canonical/sales-aggregations";

function isKnownCurrency(c: string): c is SalesCurrency {
  return c === "UYU" || c === "USD";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round2Pair(pair: CurrencyPair): CurrencyPair {
  return { UYU: round2(pair.UYU), USD: round2(pair.USD) };
}

function addToPair(pair: CurrencyPair, currency: string, amount: number): void {
  if (currency === "UYU") pair.UYU += amount;
  else if (currency === "USD") pair.USD += amount;
}

function inWindow(dateYmd: string, from: string, to: string): boolean {
  const d = dateYmd.slice(0, 10);
  return d >= from && d <= to;
}

function isValidSale(doc: CanonicalSaleDocument): boolean {
  return doc.kind === "sale" && doc.status === "valid";
}

function customerKey(doc: CanonicalSaleDocument): string {
  return doc.customerId ?? `code:${doc.customerCode ?? ""}`;
}

function pct(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

function ticketPair(sales: CurrencyPair, invoiceCountByCurrency: CurrencyPair): CurrencyPair {
  return {
    UYU: invoiceCountByCurrency.UYU > 0 ? round2(sales.UYU / invoiceCountByCurrency.UYU) : 0,
    USD: invoiceCountByCurrency.USD > 0 ? round2(sales.USD / invoiceCountByCurrency.USD) : 0,
  };
}

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

export function monthLabel(yyyyMm: string): string {
  const m = parseInt(yyyyMm.slice(5, 7), 10);
  return MONTH_NAMES[m - 1] ?? yyyyMm;
}

export type MonthlyCommercialRow = {
  month: string; // YYYY-MM
  label: string;
  salesByCurrency: CurrencyPair;
  invoiceCount: number;
  customerCount: number;
  avgTicketByCurrency: CurrencyPair;
  topServiceName: string | null;
  topSalespersonName: string | null;
  vsPrevious: {
    salesDeltaByCurrency: CurrencyPair;
    salesPctByCurrency: { UYU: number | null; USD: number | null };
    invoiceDelta: number;
    customerDelta: number;
    insights: string[];
  } | null;
};

export type ServiceComparisonStatus = "grew" | "dropped" | "new" | "stable" | "no_sales";

export type ServiceComparisonRow = {
  key: string;
  serviceName: string;
  invoiceCountCurrent: number;
  invoiceCountPrevious: number;
  customerCountCurrent: number;
  customerCountPrevious: number;
  salesCurrent: CurrencyPair;
  salesPrevious: CurrencyPair;
  status: ServiceComparisonStatus;
  insights: string[];
};

export type DrillInvoiceRow = {
  documentId: string;
  lineId: string;
  date: string;
  customerId: string | null;
  customerName: string;
  documentNumber: string | null;
  documentType: string;
  serviceName: string;
  originalConcept: string | null;
  originalCode: string | null;
  currency: string;
  lineAmount: number;
  quantity: number;
  unitPrice: number | null;
  netAmount: number | null;
  taxAmount: number | null;
  dueDate: string | null;
  salespersonId: string | null;
  salespersonName: string | null;
  docTotal: number;
  docApplied: number;
  docPending: number;
};

export type DrillCustomerRow = {
  customerId: string | null;
  customerName: string;
  invoiceCount: number;
  salesByCurrency: CurrencyPair;
  firstSale: string | null;
  lastSale: string | null;
};

export type DrillServiceRow = {
  key: string;
  serviceName: string;
  invoiceCount: number;
  customerCount: number;
  salesByCurrency: CurrencyPair;
  firstSale: string | null;
  lastSale: string | null;
};

export type DrillMonthRow = {
  month: string;
  label: string;
  invoiceCount: number;
  customerCount: number;
  serviceCount?: number;
  salesByCurrency: CurrencyPair;
};

function topNameFromMap(map: Map<string, { name: string; total: number }>): string | null {
  let best: string | null = null;
  let bestTotal = -1;
  for (const v of map.values()) {
    if (v.total > bestTotal) {
      bestTotal = v.total;
      best = v.name;
    }
  }
  return best;
}

function buildMonthInsights(
  cur: { sales: CurrencyPair; invoices: number; customers: number; topService: string | null },
  prev: { sales: CurrencyPair; invoices: number; customers: number; topService: string | null },
  curLabel: string,
  prevLabel: string
): string[] {
  const out: string[] = [];
  if (cur.sales.USD !== prev.sales.USD) {
    out.push(
      cur.sales.USD > prev.sales.USD
        ? `En ${curLabel.toLowerCase()} las ventas USD crecieron frente a ${prevLabel.toLowerCase()}.`
        : `En ${curLabel.toLowerCase()} las ventas USD bajaron frente a ${prevLabel.toLowerCase()}.`
    );
  }
  if (cur.sales.UYU !== prev.sales.UYU) {
    out.push(
      cur.sales.UYU > prev.sales.UYU
        ? `${curLabel} tuvo mayor facturación UYU que ${prevLabel.toLowerCase()}.`
        : `${curLabel} tuvo menor facturación UYU que ${prevLabel.toLowerCase()}.`
    );
  }
  const invDelta = cur.invoices - prev.invoices;
  if (invDelta !== 0) {
    out.push(
      invDelta > 0
        ? `En ${curLabel.toLowerCase()} se emitieron ${invDelta} factura${invDelta === 1 ? "" : "s"} más.`
        : `En ${curLabel.toLowerCase()} se emitieron ${Math.abs(invDelta)} factura${Math.abs(invDelta) === 1 ? "" : "s"} menos.`
    );
  }
  const custDelta = cur.customers - prev.customers;
  if (custDelta !== 0) {
    out.push(
      custDelta > 0
        ? `En ${curLabel.toLowerCase()} se atendieron ${custDelta} cliente${custDelta === 1 ? "" : "s"} más.`
        : `En ${curLabel.toLowerCase()} se atendieron ${Math.abs(custDelta)} cliente${Math.abs(custDelta) === 1 ? "" : "s"} menos.`
    );
  }
  if (cur.topService && cur.topService !== prev.topService) {
    out.push(`${cur.topService} fue el servicio principal de ${curLabel.toLowerCase()}.`);
  } else if (cur.topService) {
    out.push(`${cur.topService} fue el servicio principal de ${curLabel.toLowerCase()}.`);
  }
  return out.slice(0, 4);
}

/** Filas mensuales del año (ene→dic o hasta el mes corriente). */
export function buildYearlyMonthlyRows(
  documents: readonly CanonicalSaleDocument[],
  year: number,
  todayYmd: string
): MonthlyCommercialRow[] {
  const yearEnd = `${year}-12-31`;
  const capTo = todayYmd < yearEnd && todayYmd.startsWith(String(year)) ? todayYmd : yearEnd;
  const lastMonth = parseInt(capTo.slice(5, 7), 10);
  const rows: MonthlyCommercialRow[] = [];

  for (let m = 1; m <= lastMonth; m++) {
    const mm = String(m).padStart(2, "0");
    const from = `${year}-${mm}-01`;
    const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
    const monthEnd = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;
    const to = monthEnd > capTo ? capTo : monthEnd;

    const docs = new Set<string>();
    const customers = new Set<string>();
    const sales = emptyCurrencyPair();
    const invByCur = emptyCurrencyPair();
    const serviceTotals = new Map<string, { name: string; total: number }>();
    const spTotals = new Map<string, { name: string; total: number }>();

    for (const doc of documents) {
      if (!isValidSale(doc)) continue;
      if (!inWindow(doc.issueDate, from, to)) continue;
      docs.add(doc.documentId);
      customers.add(customerKey(doc));
      if (isKnownCurrency(doc.currency)) {
        addToPair(sales, doc.currency, doc.grossAmount);
        addToPair(invByCur, doc.currency, 1);
      }
      for (const line of doc.lines) {
        if (line.classificationStatus === "ignored") continue;
        if (line.normalizationStatus === "missing_detail") continue;
        const st = serviceTotals.get(line.productGroupKey) ?? { name: line.displayProductName, total: 0 };
        if (isKnownCurrency(line.currency)) st.total += line.lineAmount;
        serviceTotals.set(line.productGroupKey, st);
      }
      if (doc.salespersonId) {
        const sp = spTotals.get(doc.salespersonId) ?? { name: doc.salespersonName ?? "Comercial", total: 0 };
        if (isKnownCurrency(doc.currency)) sp.total += doc.grossAmount;
        spTotals.set(doc.salespersonId, sp);
      }
    }

    const topService = topNameFromMap(serviceTotals);
    const topSp = topNameFromMap(spTotals);
    const label = monthLabel(`${year}-${mm}`);
    const prev = rows[rows.length - 1] ?? null;

    let vsPrevious: MonthlyCommercialRow["vsPrevious"] = null;
    if (prev) {
      const curSnap = {
        sales: round2Pair(sales),
        invoices: docs.size,
        customers: customers.size,
        topService,
      };
      const prevSnap = {
        sales: prev.salesByCurrency,
        invoices: prev.invoiceCount,
        customers: prev.customerCount,
        topService: prev.topServiceName,
      };
      vsPrevious = {
        salesDeltaByCurrency: {
          UYU: round2(curSnap.sales.UYU - prevSnap.sales.UYU),
          USD: round2(curSnap.sales.USD - prevSnap.sales.USD),
        },
        salesPctByCurrency: {
          UYU: pct(curSnap.sales.UYU, prevSnap.sales.UYU),
          USD: pct(curSnap.sales.USD, prevSnap.sales.USD),
        },
        invoiceDelta: curSnap.invoices - prevSnap.invoices,
        customerDelta: curSnap.customers - prevSnap.customers,
        insights: buildMonthInsights(curSnap, prevSnap, label, prev.label),
      };
    }

    rows.push({
      month: `${year}-${mm}`,
      label,
      salesByCurrency: round2Pair(sales),
      invoiceCount: docs.size,
      customerCount: customers.size,
      avgTicketByCurrency: ticketPair(sales, invByCur),
      topServiceName: topService,
      topSalespersonName: topSp,
      vsPrevious,
    });
  }

  return rows;
}

function comparisonStatus(
  curInv: number,
  prevInv: number,
  curSales: CurrencyPair,
  prevSales: CurrencyPair
): ServiceComparisonStatus {
  const curTotal = curSales.UYU + curSales.USD;
  const prevTotal = prevSales.UYU + prevSales.USD;
  if (curInv === 0 && prevInv === 0) return "no_sales";
  if (prevInv === 0 && curInv > 0) return "new";
  if (curInv === 0 && prevInv > 0) return "no_sales";
  const delta = curTotal - prevTotal;
  if (Math.abs(delta) < 0.01 && curInv === prevInv) return "stable";
  if (delta > 0 || curInv > prevInv) return "grew";
  if (delta < 0 || curInv < prevInv) return "dropped";
  return "stable";
}

export function buildServicePeriodComparison(
  documents: readonly CanonicalSaleDocument[],
  currentFrom: string,
  currentTo: string,
  previousFrom: string,
  previousTo: string
): ServiceComparisonRow[] {
  const current = buildProductSalesSummary(documents, currentFrom, currentTo);
  const previous = buildProductSalesSummary(documents, previousFrom, previousTo);
  const prevMap = new Map(previous.map((p) => [p.key, p]));
  const keys = new Set([...current.map((p) => p.key), ...previous.map((p) => p.key)]);

  const rows: ServiceComparisonRow[] = [];
  for (const key of keys) {
    const c = current.find((p) => p.key === key);
    const p = prevMap.get(key);
    if ((c?.normalizationStatus === "missing_detail" || p?.normalizationStatus === "missing_detail") && !c?.invoiceCount && !p?.invoiceCount) {
      continue;
    }
    const name = c?.productName ?? p?.productName ?? "Servicio";
    const salesCurrent = c?.totalByCurrency ?? emptyCurrencyPair();
    const salesPrevious = p?.totalByCurrency ?? emptyCurrencyPair();
    const invC = c?.invoiceCount ?? 0;
    const invP = p?.invoiceCount ?? 0;
    const custC = c?.customerCount ?? 0;
    const custP = p?.customerCount ?? 0;
    const status = comparisonStatus(invC, invP, salesCurrent, salesPrevious);
    const insights: string[] = [];
    if (invC > 0 || invP > 0) {
      insights.push(`${name} tuvo ${invC} factura${invC === 1 ? "" : "s"} en el período actual y ${invP} en el anterior.`);
    }
    const custDelta = custC - custP;
    if (custDelta !== 0) {
      insights.push(
        custDelta > 0
          ? `${name} sumó ${custDelta} cliente${custDelta === 1 ? "" : "s"} más.`
          : `${name} tuvo ${Math.abs(custDelta)} cliente${Math.abs(custDelta) === 1 ? "" : "s"} menos.`
      );
    }
    const usdDelta = round2(salesCurrent.USD - salesPrevious.USD);
    if (usdDelta !== 0) {
      insights.push(
        usdDelta > 0
          ? `${name} creció U$S ${Math.abs(usdDelta).toLocaleString("es-UY", { maximumFractionDigits: 0 })} frente al período anterior.`
          : `${name} bajó U$S ${Math.abs(usdDelta).toLocaleString("es-UY", { maximumFractionDigits: 0 })} frente al período anterior.`
      );
    }
    rows.push({
      key,
      serviceName: name,
      invoiceCountCurrent: invC,
      invoiceCountPrevious: invP,
      customerCountCurrent: custC,
      customerCountPrevious: custP,
      salesCurrent,
      salesPrevious,
      status,
      insights: insights.slice(0, 3),
    });
  }

  rows.sort((a, b) => {
    const at = a.salesCurrent.UYU + a.salesCurrent.USD;
    const bt = b.salesCurrent.UYU + b.salesCurrent.USD;
    return bt - at;
  });
  return rows;
}

/** Enriquece productos del período con variación vs período anterior. */
export function enrichProductsWithVariation(
  current: ProductSalesSummaryRow[],
  previous: ProductSalesSummaryRow[]
): Array<ProductSalesSummaryRow & { previousTotalByCurrency: CurrencyPair; salesPctByCurrency: { UYU: number | null; USD: number | null } }> {
  const prevMap = new Map(previous.map((p) => [p.key, p]));
  return current.map((p) => {
    const prev = prevMap.get(p.key);
    const previousTotal = prev?.totalByCurrency ?? emptyCurrencyPair();
    return {
      ...p,
      previousTotalByCurrency: previousTotal,
      salesPctByCurrency: {
        UYU: pct(p.totalByCurrency.UYU, previousTotal.UYU),
        USD: pct(p.totalByCurrency.USD, previousTotal.USD),
      },
    };
  });
}

function collectInvoicesForService(
  documents: readonly CanonicalSaleDocument[],
  serviceKey: string,
  from: string,
  to: string
): DrillInvoiceRow[] {
  const rows: DrillInvoiceRow[] = [];
  for (const doc of documents) {
    if (!isValidSale(doc)) continue;
    if (!inWindow(doc.issueDate, from, to)) continue;
    for (const line of doc.lines) {
      if (line.classificationStatus === "ignored") continue;
      if (line.productGroupKey !== serviceKey) continue;
      rows.push({
        documentId: doc.documentId,
        lineId: line.lineId,
        date: doc.issueDate,
        customerId: doc.customerId,
        customerName: doc.customerName,
        documentNumber: doc.documentNumber,
        documentType: doc.documentType,
        serviceName: line.displayProductName,
        originalConcept: line.originalConcept,
        originalCode: line.originalCode,
        currency: line.currency,
        lineAmount: line.lineAmount,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        netAmount: line.netAmount,
        taxAmount: line.taxAmount,
        dueDate: doc.dueDate,
        salespersonId: doc.salespersonId,
        salespersonName: doc.salespersonName,
        docTotal: doc.grossAmount,
        docApplied: doc.appliedAmount,
        docPending: doc.pendingAmount,
      });
    }
  }
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return rows;
}

function monthlyEvolution(
  documents: readonly CanonicalSaleDocument[],
  from: string,
  to: string,
  filter: (doc: CanonicalSaleDocument, lineKey?: string) => boolean,
  mode: "service" | "customer" | "salesperson"
): DrillMonthRow[] {
  const map = new Map<
    string,
    { docs: Set<string>; customers: Set<string>; services: Set<string>; sales: CurrencyPair }
  >();

  for (const doc of documents) {
    if (!isValidSale(doc)) continue;
    if (!inWindow(doc.issueDate, from, to)) continue;
    if (mode === "customer" || mode === "salesperson") {
      if (!filter(doc)) continue;
      const month = doc.issueDate.slice(0, 7);
      let acc = map.get(month);
      if (!acc) {
        acc = { docs: new Set(), customers: new Set(), services: new Set(), sales: emptyCurrencyPair() };
        map.set(month, acc);
      }
      acc.docs.add(doc.documentId);
      acc.customers.add(customerKey(doc));
      if (isKnownCurrency(doc.currency)) addToPair(acc.sales, doc.currency, doc.grossAmount);
      for (const line of doc.lines) {
        if (line.classificationStatus === "ignored" || line.normalizationStatus === "missing_detail") continue;
        acc.services.add(line.productGroupKey);
      }
      continue;
    }
    // service mode: filter by line
    for (const line of doc.lines) {
      if (line.classificationStatus === "ignored") continue;
      if (!filter(doc, line.productGroupKey)) continue;
      const month = doc.issueDate.slice(0, 7);
      let acc = map.get(month);
      if (!acc) {
        acc = { docs: new Set(), customers: new Set(), services: new Set(), sales: emptyCurrencyPair() };
        map.set(month, acc);
      }
      acc.docs.add(doc.documentId);
      acc.customers.add(customerKey(doc));
      if (isKnownCurrency(line.currency)) addToPair(acc.sales, line.currency, line.lineAmount);
    }
  }

  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, acc]) => ({
      month,
      label: monthLabel(month),
      invoiceCount: acc.docs.size,
      customerCount: acc.customers.size,
      serviceCount: acc.services.size,
      salesByCurrency: round2Pair(acc.sales),
    }));
}

export function buildServiceDrillDown(
  documents: readonly CanonicalSaleDocument[],
  serviceKey: string,
  from: string,
  to: string,
  comparisonFrom: string,
  comparisonTo: string
) {
  const invoices = collectInvoicesForService(documents, serviceKey, from, to);
  const products = buildProductSalesSummary(documents, from, to);
  const productsPrev = buildProductSalesSummary(documents, comparisonFrom, comparisonTo);
  const current = products.find((p) => p.key === serviceKey) ?? null;
  const previous = productsPrev.find((p) => p.key === serviceKey) ?? null;

  const customersMap = new Map<string, DrillCustomerRow>();
  const salespersons = new Set<string>();
  let firstSale: string | null = null;
  let lastSale: string | null = null;

  for (const inv of invoices) {
    const ck = inv.customerId ?? `name:${inv.customerName}`;
    let c = customersMap.get(ck);
    if (!c) {
      c = {
        customerId: inv.customerId,
        customerName: inv.customerName,
        invoiceCount: 0,
        salesByCurrency: emptyCurrencyPair(),
        firstSale: inv.date,
        lastSale: inv.date,
      };
      customersMap.set(ck, c);
    }
    const docs = new Set<string>();
    // recount per unique document below
    void docs;
    if (isKnownCurrency(inv.currency)) addToPair(c.salesByCurrency, inv.currency, inv.lineAmount);
    if (!c.firstSale || inv.date < c.firstSale) c.firstSale = inv.date;
    if (!c.lastSale || inv.date > c.lastSale) c.lastSale = inv.date;
    if (inv.salespersonName) salespersons.add(inv.salespersonName);
    if (!firstSale || inv.date < firstSale) firstSale = inv.date;
    if (!lastSale || inv.date > lastSale) lastSale = inv.date;
  }

  // Facturas únicas por cliente
  const docsByCustomer = new Map<string, Set<string>>();
  for (const inv of invoices) {
    const ck = inv.customerId ?? `name:${inv.customerName}`;
    let set = docsByCustomer.get(ck);
    if (!set) {
      set = new Set();
      docsByCustomer.set(ck, set);
    }
    set.add(inv.documentId);
  }
  for (const [ck, row] of customersMap) {
    row.invoiceCount = docsByCustomer.get(ck)?.size ?? 0;
    row.salesByCurrency = round2Pair(row.salesByCurrency);
  }

  const sales = current?.totalByCurrency ?? emptyCurrencyPair();
  const invCount = current?.invoiceCount ?? new Set(invoices.map((i) => i.documentId)).size;
  const invByCur = emptyCurrencyPair();
  const uniqueDocs = new Map<string, string>();
  for (const inv of invoices) uniqueDocs.set(inv.documentId, inv.currency);
  for (const cur of uniqueDocs.values()) {
    if (isKnownCurrency(cur)) addToPair(invByCur, cur, 1);
  }

  return {
    summary: {
      serviceKey,
      serviceName: current?.productName ?? invoices[0]?.serviceName ?? "Servicio",
      invoiceCount: invCount,
      customerCount: current?.customerCount ?? customersMap.size,
      salesByCurrency: sales,
      avgTicketByCurrency: current?.avgTicketByCurrency ?? ticketPair(sales, invByCur),
      firstSale,
      lastSale,
      salespersons: [...salespersons].sort(),
      categoryName: current?.categoryName ?? null,
      comparison: {
        previousSales: previous?.totalByCurrency ?? emptyCurrencyPair(),
        previousInvoices: previous?.invoiceCount ?? 0,
        previousCustomers: previous?.customerCount ?? 0,
        salesDelta: {
          UYU: round2(sales.UYU - (previous?.totalByCurrency.UYU ?? 0)),
          USD: round2(sales.USD - (previous?.totalByCurrency.USD ?? 0)),
        },
        salesPct: {
          UYU: pct(sales.UYU, previous?.totalByCurrency.UYU ?? 0),
          USD: pct(sales.USD, previous?.totalByCurrency.USD ?? 0),
        },
        invoiceDelta: invCount - (previous?.invoiceCount ?? 0),
        customerDelta: (current?.customerCount ?? customersMap.size) - (previous?.customerCount ?? 0),
      },
    },
    invoices,
    customers: [...customersMap.values()].sort(
      (a, b) => b.salesByCurrency.UYU + b.salesByCurrency.USD - (a.salesByCurrency.UYU + a.salesByCurrency.USD)
    ),
    monthly: monthlyEvolution(documents, from, to, (_doc, lineKey) => lineKey === serviceKey, "service"),
  };
}

export function buildCustomerDrillDown(
  documents: readonly CanonicalSaleDocument[],
  customerId: string,
  from: string,
  to: string,
  periodTotalUsd: number
) {
  const match = (doc: CanonicalSaleDocument) => doc.customerId === customerId;
  const customers = buildCustomerSalesSummary(documents, from, to);
  const summaryRow = customers.find((c) => c.customerId === customerId) ?? null;

  const invoices: DrillInvoiceRow[] = [];
  const servicesMap = new Map<string, DrillServiceRow & { _docs: Set<string> }>();
  const salespersons = new Map<string, number>();
  const activeMonths = new Set<string>();

  for (const doc of documents) {
    if (!isValidSale(doc)) continue;
    if (!inWindow(doc.issueDate, from, to)) continue;
    if (!match(doc)) continue;
    activeMonths.add(doc.issueDate.slice(0, 7));
    if (doc.salespersonName) {
      salespersons.set(doc.salespersonName, (salespersons.get(doc.salespersonName) ?? 0) + doc.grossAmount);
    }
    for (const line of doc.lines) {
      if (line.classificationStatus === "ignored") continue;
      invoices.push({
        documentId: doc.documentId,
        lineId: line.lineId,
        date: doc.issueDate,
        customerId: doc.customerId,
        customerName: doc.customerName,
        documentNumber: doc.documentNumber,
        documentType: doc.documentType,
        serviceName: line.displayProductName,
        originalConcept: line.originalConcept,
        originalCode: line.originalCode,
        currency: line.currency,
        lineAmount: line.lineAmount,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        netAmount: line.netAmount,
        taxAmount: line.taxAmount,
        dueDate: doc.dueDate,
        salespersonId: doc.salespersonId,
        salespersonName: doc.salespersonName,
        docTotal: doc.grossAmount,
        docApplied: doc.appliedAmount,
        docPending: doc.pendingAmount,
      });
      if (line.normalizationStatus === "missing_detail") continue;
      let s = servicesMap.get(line.productGroupKey);
      if (!s) {
        s = {
          key: line.productGroupKey,
          serviceName: line.displayProductName,
          invoiceCount: 0,
          customerCount: 1,
          salesByCurrency: emptyCurrencyPair(),
          firstSale: doc.issueDate,
          lastSale: doc.issueDate,
          _docs: new Set(),
        };
        servicesMap.set(line.productGroupKey, s);
      }
      s._docs.add(doc.documentId);
      if (isKnownCurrency(line.currency)) addToPair(s.salesByCurrency, line.currency, line.lineAmount);
      if (!s.firstSale || doc.issueDate < s.firstSale) s.firstSale = doc.issueDate;
      if (!s.lastSale || doc.issueDate > s.lastSale) s.lastSale = doc.issueDate;
    }
  }

  invoices.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const services = [...servicesMap.values()].map(({ _docs, ...rest }) => ({
    ...rest,
    invoiceCount: _docs.size,
    salesByCurrency: round2Pair(rest.salesByCurrency),
  }));
  services.sort((a, b) => b.salesByCurrency.UYU + b.salesByCurrency.USD - (a.salesByCurrency.UYU + a.salesByCurrency.USD));

  let topSalesperson: string | null = null;
  let topSpTotal = -1;
  for (const [name, total] of salespersons) {
    if (total > topSpTotal) {
      topSpTotal = total;
      topSalesperson = name;
    }
  }

  const topService = services[0] ?? null;
  const salesUsd = summaryRow?.salesByCurrency.USD ?? 0;
  const shareUsd =
    periodTotalUsd > 0 && salesUsd > 0 ? Math.round((salesUsd / periodTotalUsd) * 1000) / 10 : null;

  const insights: string[] = [];
  if (services.length > 0) {
    insights.push(`Contrató ${services.length} servicio${services.length === 1 ? "" : "s"} diferente${services.length === 1 ? "" : "s"}.`);
  }
  if (summaryRow?.type === "new") {
    insights.push("Es cliente nuevo en este período.");
  }
  if (summaryRow?.lastPurchase) {
    const today = to.slice(0, 10);
    const days = Math.round((Date.parse(today) - Date.parse(summaryRow.lastPurchase.slice(0, 10))) / 86400000);
    if (Number.isFinite(days) && days >= 0) {
      insights.push(`Compró por última vez hace ${days} día${days === 1 ? "" : "s"}.`);
    }
  }
  if (topService) {
    insights.push(`El servicio más contratado fue ${topService.serviceName}.`);
  }
  if (shareUsd != null) {
    insights.push(`Representa ${shareUsd.toLocaleString("es-UY", { maximumFractionDigits: 1 })}% de las ventas del período en USD.`);
  }

  // Evolución mensual del año del período (desde ene del year de `from` hasta `to`)
  const yearFrom = `${from.slice(0, 4)}-01-01`;
  const monthly = monthlyEvolution(documents, yearFrom, to, match, "customer");

  // Variación USD vs mes anterior al cierre del período
  if (monthly.length >= 2) {
    const last = monthly[monthly.length - 1]!;
    const prev = monthly[monthly.length - 2]!;
    if (last.salesByCurrency.USD !== prev.salesByCurrency.USD) {
      insights.push(
        last.salesByCurrency.USD > prev.salesByCurrency.USD
          ? "Su facturación USD creció frente al mes anterior."
          : "Su facturación USD bajó frente al mes anterior."
      );
    }
  }

  return {
    summary: {
      customerId,
      customerName: summaryRow?.customerName ?? invoices[0]?.customerName ?? "Cliente",
      salesByCurrency: summaryRow?.salesByCurrency ?? emptyCurrencyPair(),
      invoiceCount: summaryRow?.invoiceCount ?? new Set(invoices.map((i) => i.documentId)).size,
      serviceCount: services.length,
      avgTicketByCurrency: summaryRow?.avgTicketByCurrency ?? emptyCurrencyPair(),
      firstPurchase: summaryRow?.firstPurchase ?? null,
      lastPurchase: summaryRow?.lastPurchase ?? null,
      type: summaryRow?.type ?? "recurring",
      topSalespersonName: topSalesperson,
      activeMonthCount: activeMonths.size,
    },
    invoices,
    services,
    monthly,
    insights: insights.slice(0, 6),
  };
}

export function buildSalespersonDrillDown(
  documents: readonly CanonicalSaleDocument[],
  salespersonId: string | null, // null = unassigned
  from: string,
  to: string
) {
  const match = (doc: CanonicalSaleDocument) =>
    salespersonId === null ? doc.salespersonId == null : doc.salespersonId === salespersonId;

  const people = buildSalespersonSummary(documents, from, to);
  const summaryRow =
    people.find((p) => (salespersonId === null ? p.salespersonId === null : p.salespersonId === salespersonId)) ??
    null;

  const invoices: DrillInvoiceRow[] = [];
  const servicesMap = new Map<string, DrillServiceRow & { _docs: Set<string>; _cust: Set<string> }>();

  for (const doc of documents) {
    if (!isValidSale(doc)) continue;
    if (!inWindow(doc.issueDate, from, to)) continue;
    if (!match(doc)) continue;
    for (const line of doc.lines) {
      if (line.classificationStatus === "ignored") continue;
      invoices.push({
        documentId: doc.documentId,
        lineId: line.lineId,
        date: doc.issueDate,
        customerId: doc.customerId,
        customerName: doc.customerName,
        documentNumber: doc.documentNumber,
        documentType: doc.documentType,
        serviceName: line.displayProductName,
        originalConcept: line.originalConcept,
        originalCode: line.originalCode,
        currency: line.currency,
        lineAmount: line.lineAmount,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        netAmount: line.netAmount,
        taxAmount: line.taxAmount,
        dueDate: doc.dueDate,
        salespersonId: doc.salespersonId,
        salespersonName: doc.salespersonName,
        docTotal: doc.grossAmount,
        docApplied: doc.appliedAmount,
        docPending: doc.pendingAmount,
      });
      if (line.normalizationStatus === "missing_detail") continue;
      let s = servicesMap.get(line.productGroupKey);
      if (!s) {
        s = {
          key: line.productGroupKey,
          serviceName: line.displayProductName,
          invoiceCount: 0,
          customerCount: 0,
          salesByCurrency: emptyCurrencyPair(),
          firstSale: doc.issueDate,
          lastSale: doc.issueDate,
          _docs: new Set(),
          _cust: new Set(),
        };
        servicesMap.set(line.productGroupKey, s);
      }
      s._docs.add(doc.documentId);
      s._cust.add(customerKey(doc));
      if (isKnownCurrency(line.currency)) addToPair(s.salesByCurrency, line.currency, line.lineAmount);
    }
  }

  invoices.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const services = [...servicesMap.values()].map(({ _docs, _cust, ...rest }) => ({
    ...rest,
    invoiceCount: _docs.size,
    customerCount: _cust.size,
    salesByCurrency: round2Pair(rest.salesByCurrency),
  }));
  services.sort((a, b) => b.salesByCurrency.UYU + b.salesByCurrency.USD - (a.salesByCurrency.UYU + a.salesByCurrency.USD));

  const yearFrom = `${from.slice(0, 4)}-01-01`;
  const monthly = monthlyEvolution(documents, yearFrom, to, match, "salesperson");

  return {
    summary: {
      salespersonId,
      salespersonName: summaryRow?.salespersonName ?? (salespersonId ? "Comercial" : "Sin asignar"),
      invoiceCount: summaryRow?.invoiceCount ?? new Set(invoices.map((i) => i.documentId)).size,
      customerCount: summaryRow?.customerCount ?? 0,
      newCustomerCount: summaryRow?.newCustomerCount ?? 0,
      salesByCurrency: summaryRow?.salesByCurrency ?? emptyCurrencyPair(),
      avgTicketByCurrency: summaryRow?.avgTicketByCurrency ?? emptyCurrencyPair(),
      topServiceName: summaryRow?.topProductName ?? services[0]?.serviceName ?? null,
      period: { from, to },
    },
    invoices,
    services,
    monthly,
  };
}

export function buildCommercialHighlights(
  documents: readonly CanonicalSaleDocument[],
  from: string,
  to: string
) {
  const products = buildProductSalesSummary(documents, from, to).filter((p) => p.normalizationStatus !== "missing_detail");
  const customers = buildCustomerSalesSummary(documents, from, to);
  const salespersons = buildSalespersonSummary(documents, from, to);
  const snapshot = buildSalesPeriodSnapshot(documents, from, to);

  const topByInvoices = [...products].sort((a, b) => b.invoiceCount - a.invoiceCount)[0] ?? null;
  const topByCustomers = [...products].sort((a, b) => b.customerCount - a.customerCount)[0] ?? null;
  const topUyu = [...products].sort((a, b) => b.totalByCurrency.UYU - a.totalByCurrency.UYU)[0] ?? null;
  const topUsd = [...products].sort((a, b) => b.totalByCurrency.USD - a.totalByCurrency.USD)[0] ?? null;
  const topCustUyu = [...customers].sort((a, b) => b.salesByCurrency.UYU - a.salesByCurrency.UYU)[0] ?? null;
  const topCustUsd = [...customers].sort((a, b) => b.salesByCurrency.USD - a.salesByCurrency.USD)[0] ?? null;
  const assigned = salespersons.filter((s) => s.salespersonId !== null);
  const topSp = [...assigned].sort(
    (a, b) => b.salesByCurrency.UYU + b.salesByCurrency.USD - (a.salesByCurrency.UYU + a.salesByCurrency.USD)
  )[0] ?? null;

  const unassigned = salespersons.find((s) => s.salespersonId === null);
  const fromJuly = from < "2026-07-01" ? "2026-07-01" : from;
  const unassignedFromJuly =
    to >= "2026-07-01"
      ? buildSalespersonSummary(documents, fromJuly, to).find((s) => s.salespersonId === null)?.invoiceCount ?? 0
      : 0;

  return {
    topServiceByInvoices: topByInvoices,
    topServiceByCustomers: topByCustomers,
    topServiceByUyu: topUyu,
    topServiceByUsd: topUsd,
    topCustomerByUyu: topCustUyu,
    topCustomerByUsd: topCustUsd,
    topSalesperson: topSp,
    unassignedInvoiceCount: unassigned?.invoiceCount ?? 0,
    unassignedInvoicesSinceJuly: unassignedFromJuly,
    creditNoteCount: snapshot.creditNoteCount,
    creditNotes: snapshot.creditNotes,
  };
}
