/**
 * FASE 9 — Agregaciones puras del modelo canónico de ventas.
 *
 * Reglas:
 *   - UYU y USD siempre separados (CurrencyPair). Nunca se suman ni convierten.
 *   - `salesEmitted` se calcula a nivel documento (grossAmount) para reconciliar
 *     exactamente con `proto_invoices.total_amount` (y por ende con Finanzas).
 *   - La clasificación afecta SOLO el desglose por producto, nunca los totales.
 *   - Notas de crédito: nunca se suman a emitidas. "Venta ajustada" = emitidas − NC.
 *   - Documentos anulados (status cancelled) se excluyen de emitidas y NC.
 *   - Cliente nuevo = primera venta válida dentro del período. Recurrente = venta
 *     válida previa al período + venta en el período.
 */

import { conceptKey } from "@/lib/sales/canonical/sales-normalization";
import {
  emptyCurrencyPair,
  type CanonicalSaleDocument,
  type CanonicalSaleLine,
  type CurrencyPair,
  type CustomerSalesSummaryRow,
  type ProductSalesSummaryRow,
  type SalespersonSummaryRow,
  type SellerSalesSummaryRow,
  type SalesCollectionSummary,
  type SalesComparison,
  type SalesCurrency,
  type SalesPeriodSnapshot,
  type UnclassifiedConceptRow,
} from "@/lib/sales/canonical/types";

// ---------------------------------------------------------------------------
// Helpers de moneda
// ---------------------------------------------------------------------------

function addToPair(pair: CurrencyPair, currency: string, amount: number): void {
  if (currency === "UYU") pair.UYU += amount;
  else if (currency === "USD") pair.USD += amount;
}

function isKnownCurrency(c: string): c is SalesCurrency {
  return c === "UYU" || c === "USD";
}

function round2Pair(pair: CurrencyPair): CurrencyPair {
  return { UYU: Math.round(pair.UYU * 100) / 100, USD: Math.round(pair.USD * 100) / 100 };
}

function inWindow(dateYmd: string, from: string, to: string): boolean {
  const d = dateYmd.slice(0, 10);
  return d >= from && d <= to;
}

function isValidSale(doc: CanonicalSaleDocument): boolean {
  return doc.kind === "sale" && doc.status === "valid";
}

/** Líneas contables de una venta (no ignoradas). */
function countableLines(doc: CanonicalSaleDocument): CanonicalSaleLine[] {
  return doc.lines.filter((l) => l.classificationStatus !== "ignored");
}

// ---------------------------------------------------------------------------
// Period snapshot
// ---------------------------------------------------------------------------

/** Fecha de primera venta válida por cliente en TODO el histórico provisto. */
function firstSaleByCustomer(allDocs: readonly CanonicalSaleDocument[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const doc of allDocs) {
    if (!isValidSale(doc)) continue;
    const key = customerKey(doc);
    const prev = map.get(key);
    if (!prev || doc.issueDate < prev) map.set(key, doc.issueDate);
  }
  return map;
}

function customerKey(doc: CanonicalSaleDocument): string {
  return doc.customerId ?? `code:${doc.customerCode ?? ""}`;
}

/**
 * Combina primera venta del dataset KPI con lookback extendido (por customerId).
 * Preferimos la fecha más temprana confiable.
 */
function mergeFirstSaleMaps(
  fromDocs: Map<string, string>,
  byCustomerId?: Map<string, string>
): Map<string, string> {
  if (!byCustomerId || byCustomerId.size === 0) return fromDocs;
  const out = new Map(fromDocs);
  for (const [customerId, date] of byCustomerId) {
    const key = customerId;
    const prev = out.get(key);
    if (!prev || date < prev) out.set(key, date);
  }
  return out;
}

export type SalesAggregationOptions = {
  /** customerId → primera venta válida (historia extendida). */
  firstSaleByCustomerId?: Map<string, string>;
  assignedCustomerCountBySalesperson?: Map<string | null, number>;
  /**
   * customerId → comercial VIGENTE del cliente (asignación abierta, valid_to IS NULL).
   * Distinto de la atribución del período (`salespersonId`, resuelta por fecha de venta):
   * este es el comercial "actual" que edita el selector de Ventas → Clientes.
   */
  currentSalespersonByCustomerId?: Map<string, string>;
  /** salespersonId → displayName, para nombrar el comercial vigente. */
  salespersonNameById?: Map<string, string>;
};

export function buildSalesPeriodSnapshot(
  allDocs: readonly CanonicalSaleDocument[],
  periodFrom: string,
  periodTo: string,
  options?: SalesAggregationOptions
): SalesPeriodSnapshot {
  const firstSale = mergeFirstSaleMaps(firstSaleByCustomer(allDocs), options?.firstSaleByCustomerId);

  const salesEmitted = emptyCurrencyPair();
  const creditNotes = emptyCurrencyPair();
  const applied = emptyCurrencyPair();
  const registered = emptyCurrencyPair();
  const pending = emptyCurrencyPair();
  const missingDetailAmount = emptyCurrencyPair();
  const invoiceCountByCurrency = emptyCurrencyPair();

  let invoiceCount = 0;
  let creditNoteCount = 0;
  let unitsSold = 0;
  let unclassifiedLineCount = 0;
  let missingDetailLineCount = 0;
  let unknownCurrencyCount = 0;

  const periodCustomers = new Set<string>();

  for (const doc of allDocs) {
    if (!inWindow(doc.issueDate, periodFrom, periodTo)) continue;
    if (doc.status === "cancelled") continue;

    if (doc.kind === "credit_note") {
      if (isKnownCurrency(doc.currency)) addToPair(creditNotes, doc.currency, doc.grossAmount);
      creditNoteCount += 1;
      continue;
    }

    // Venta válida
    if (doc.currency === "UNKNOWN") {
      unknownCurrencyCount += 1;
    } else {
      addToPair(salesEmitted, doc.currency, doc.grossAmount);
      addToPair(applied, doc.currency, doc.appliedAmount);
      addToPair(registered, doc.currency, doc.registeredAmount);
      addToPair(pending, doc.currency, doc.pendingAmount);
      addToPair(invoiceCountByCurrency, doc.currency, 1);
    }
    invoiceCount += 1;
    periodCustomers.add(customerKey(doc));

    for (const line of countableLines(doc)) {
      if (!line.synthetic) unitsSold += line.quantity;
      // "Sin detalle" = líneas realmente vacías (documento sin líneas Zeta).
      if (line.normalizationStatus === "missing_detail") {
        missingDetailLineCount += 1;
        if (isKnownCurrency(line.currency)) addToPair(missingDetailAmount, line.currency, line.lineAmount);
      }
      // Métrica interna de administración: concepto válido aún sin alias.
      if (line.classificationStatus === "unclassified" && line.normalizationStatus !== "missing_detail") {
        unclassifiedLineCount += 1;
      }
    }
  }

  let newCustomers = 0;
  let recurringCustomers = 0;
  for (const key of periodCustomers) {
    const first = firstSale.get(key);
    if (first && first >= periodFrom) newCustomers += 1;
    else recurringCustomers += 1;
  }

  const salesAdjusted: CurrencyPair = {
    UYU: salesEmitted.UYU - creditNotes.UYU,
    USD: salesEmitted.USD - creditNotes.USD,
  };
  // Ticket comercial = ventas netas / facturas válidas de esa moneda.
  const averageTicket: CurrencyPair = {
    UYU: invoiceCountByCurrency.UYU > 0 ? salesAdjusted.UYU / invoiceCountByCurrency.UYU : 0,
    USD: invoiceCountByCurrency.USD > 0 ? salesAdjusted.USD / invoiceCountByCurrency.USD : 0,
  };

  const gross = round2Pair(salesEmitted);
  const net = round2Pair(salesAdjusted);

  return {
    periodFrom,
    periodTo,
    salesEmitted: gross,
    creditNotes: round2Pair(creditNotes),
    salesAdjusted: net,
    netSalesByCurrency: net,
    grossSalesByCurrency: gross,
    appliedCollected: round2Pair(applied),
    registeredCollected: round2Pair(registered),
    pending: round2Pair(pending),
    invoiceCount,
    creditNoteCount,
    unitsSold: Math.round(unitsSold * 100) / 100,
    averageTicket: round2Pair(averageTicket),
    newCustomers,
    recurringCustomers,
    unclassifiedLineCount,
    missingDetailLineCount,
    missingDetailAmount: round2Pair(missingDetailAmount),
    unknownCurrencyCount,
  };
}

// ---------------------------------------------------------------------------
// Product summary
// ---------------------------------------------------------------------------

export function buildProductSalesSummary(
  allDocs: readonly CanonicalSaleDocument[],
  periodFrom: string,
  periodTo: string
): ProductSalesSummaryRow[] {
  type Acc = {
    key: string;
    productId: string | null;
    productName: string;
    categoryId: string | null;
    categoryName: string | null;
    status: ProductSalesSummaryRow["classificationStatus"];
    normalizationStatus: ProductSalesSummaryRow["normalizationStatus"];
    quantity: number;
    docs: Set<string>;
    docsByCurrency: { UYU: Set<string>; USD: Set<string> };
    customers: Set<string>;
    total: CurrencyPair;
    qtyByCurrency: CurrencyPair;
  };
  const map = new Map<string, Acc>();

  for (const doc of allDocs) {
    if (!isValidSale(doc)) continue;
    if (!inWindow(doc.issueDate, periodFrom, periodTo)) continue;

    for (const line of countableLines(doc)) {
      const classified = line.normalizationStatus === "canonical" && line.canonicalProductId;
      // Agrupar por producto canónico o por concepto Zeta normalizado. Nunca
      // colapsar conceptos válidos en "Sin clasificar".
      const key = line.productGroupKey;
      let acc = map.get(key);
      if (!acc) {
        acc = {
          key,
          productId: classified ? line.canonicalProductId : null,
          productName: line.displayProductName,
          categoryId: classified ? line.canonicalCategoryId : null,
          categoryName: classified ? line.canonicalCategoryName : null,
          status: classified ? "classified" : "unclassified",
          normalizationStatus: line.normalizationStatus,
          quantity: 0,
          docs: new Set(),
          docsByCurrency: { UYU: new Set(), USD: new Set() },
          customers: new Set(),
          total: emptyCurrencyPair(),
          qtyByCurrency: emptyCurrencyPair(),
        };
        map.set(key, acc);
      }
      if (!line.synthetic) acc.quantity += line.quantity;
      acc.docs.add(doc.documentId);
      acc.customers.add(customerKey(doc));
      if (isKnownCurrency(line.currency)) {
        addToPair(acc.total, line.currency, line.lineAmount);
        acc.docsByCurrency[line.currency].add(doc.documentId);
        if (!line.synthetic) addToPair(acc.qtyByCurrency, line.currency, line.quantity);
      }
    }
  }

  const rows: ProductSalesSummaryRow[] = [];
  for (const acc of map.values()) {
    const invUyu = acc.docsByCurrency.UYU.size;
    const invUsd = acc.docsByCurrency.USD.size;
    rows.push({
      key: acc.key,
      productId: acc.productId,
      productName: acc.productName,
      categoryId: acc.categoryId,
      categoryName: acc.categoryName,
      classificationStatus: acc.status,
      normalizationStatus: acc.normalizationStatus,
      quantity: Math.round(acc.quantity * 100) / 100,
      invoiceCount: acc.docs.size,
      customerCount: acc.customers.size,
      totalByCurrency: round2Pair(acc.total),
      avgPriceByCurrency: {
        UYU: acc.qtyByCurrency.UYU > 0 ? Math.round((acc.total.UYU / acc.qtyByCurrency.UYU) * 100) / 100 : 0,
        USD: acc.qtyByCurrency.USD > 0 ? Math.round((acc.total.USD / acc.qtyByCurrency.USD) * 100) / 100 : 0,
      },
      avgTicketByCurrency: {
        UYU: invUyu > 0 ? Math.round((acc.total.UYU / invUyu) * 100) / 100 : 0,
        USD: invUsd > 0 ? Math.round((acc.total.USD / invUsd) * 100) / 100 : 0,
      },
    });
  }

  // Orden: facturación total desc; "Sin detalle" (missing_detail) siempre al final.
  rows.sort((a, b) => {
    const aMissing = a.normalizationStatus === "missing_detail";
    const bMissing = b.normalizationStatus === "missing_detail";
    if (aMissing && !bMissing) return 1;
    if (bMissing && !aMissing) return -1;
    const av = a.totalByCurrency.UYU + a.totalByCurrency.USD;
    const bv = b.totalByCurrency.UYU + b.totalByCurrency.USD;
    return bv - av;
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Customer summary
// ---------------------------------------------------------------------------

export function buildCustomerSalesSummary(
  allDocs: readonly CanonicalSaleDocument[],
  periodFrom: string,
  periodTo: string,
  options?: SalesAggregationOptions
): CustomerSalesSummaryRow[] {
  const firstSale = mergeFirstSaleMaps(firstSaleByCustomer(allDocs), options?.firstSaleByCustomerId);

  type Acc = {
    customerId: string | null;
    customerCode: string | null;
    customerName: string;
    docs: Set<string>;
    products: Set<string>;
    sales: CurrencyPair;
    creditNotes: CurrencyPair;
    applied: CurrencyPair;
    pending: CurrencyPair;
    invoiceCountByCurrency: CurrencyPair;
    firstInPeriod: string | null;
    lastInPeriod: string | null;
    salespersonId: string | null;
    salespersonName: string | null;
  };
  const map = new Map<string, Acc>();

  for (const doc of allDocs) {
    if (doc.status === "cancelled") continue;
    if (!inWindow(doc.issueDate, periodFrom, periodTo)) continue;
    const key = customerKey(doc);

    if (doc.kind === "credit_note") {
      // Case B: NC se atribuye al cliente. No crea "cliente comprador" solo por NC.
      let acc = map.get(key);
      if (!acc) {
        // Solo registrar NC si el cliente también tiene ventas; si no, bucket aparte vía overview.
        // Creamos acc solo para acumular NC — type/new se calcula después solo si hay ventas.
        acc = {
          customerId: doc.customerId,
          customerCode: doc.customerCode,
          customerName: doc.customerName,
          docs: new Set(),
          products: new Set(),
          sales: emptyCurrencyPair(),
          creditNotes: emptyCurrencyPair(),
          applied: emptyCurrencyPair(),
          pending: emptyCurrencyPair(),
          invoiceCountByCurrency: emptyCurrencyPair(),
          firstInPeriod: null,
          lastInPeriod: null,
          salespersonId: doc.salespersonId,
          salespersonName: doc.salespersonName,
        };
        map.set(key, acc);
      }
      if (isKnownCurrency(doc.currency)) addToPair(acc.creditNotes, doc.currency, doc.grossAmount);
      continue;
    }

    if (!isValidSale(doc)) continue;

    let acc = map.get(key);
    if (!acc) {
      acc = {
        customerId: doc.customerId,
        customerCode: doc.customerCode,
        customerName: doc.customerName,
        docs: new Set(),
        products: new Set(),
        sales: emptyCurrencyPair(),
        creditNotes: emptyCurrencyPair(),
        applied: emptyCurrencyPair(),
        pending: emptyCurrencyPair(),
        invoiceCountByCurrency: emptyCurrencyPair(),
        firstInPeriod: null,
        lastInPeriod: null,
        salespersonId: doc.salespersonId,
        salespersonName: doc.salespersonName,
      };
      map.set(key, acc);
    }
    acc.docs.add(doc.documentId);
    if (doc.salespersonId && !acc.salespersonId) {
      acc.salespersonId = doc.salespersonId;
      acc.salespersonName = doc.salespersonName;
    } else if (doc.salespersonId) {
      acc.salespersonId = doc.salespersonId;
      acc.salespersonName = doc.salespersonName;
    }
    if (isKnownCurrency(doc.currency)) {
      addToPair(acc.sales, doc.currency, doc.grossAmount);
      addToPair(acc.applied, doc.currency, doc.appliedAmount);
      addToPair(acc.pending, doc.currency, doc.pendingAmount);
      addToPair(acc.invoiceCountByCurrency, doc.currency, 1);
    }
    for (const line of countableLines(doc)) {
      if (line.normalizationStatus !== "missing_detail") acc.products.add(line.productGroupKey);
    }
    if (!acc.firstInPeriod || doc.issueDate < acc.firstInPeriod) acc.firstInPeriod = doc.issueDate;
    if (!acc.lastInPeriod || doc.issueDate > acc.lastInPeriod) acc.lastInPeriod = doc.issueDate;
  }

  const rows: CustomerSalesSummaryRow[] = [];
  for (const [key, acc] of map.entries()) {
    // Cliente comprador = al menos una factura válida. NC sola no cuenta.
    if (acc.docs.size === 0) continue;
    const first = firstSale.get(key);
    const type = first && first >= periodFrom ? "new" : "recurring";
    const net: CurrencyPair = {
      UYU: acc.sales.UYU - acc.creditNotes.UYU,
      USD: acc.sales.USD - acc.creditNotes.USD,
    };
    const currentSpId = acc.customerId
      ? options?.currentSalespersonByCustomerId?.get(acc.customerId) ?? null
      : null;
    rows.push({
      customerId: acc.customerId,
      customerCode: acc.customerCode,
      customerName: acc.customerName,
      invoiceCount: acc.docs.size,
      productCount: acc.products.size,
      salesByCurrency: round2Pair(acc.sales),
      creditNotesByCurrency: round2Pair(acc.creditNotes),
      netSalesByCurrency: round2Pair(net),
      appliedByCurrency: round2Pair(acc.applied),
      pendingByCurrency: round2Pair(acc.pending),
      avgTicketByCurrency: {
        UYU: acc.invoiceCountByCurrency.UYU > 0 ? Math.round((net.UYU / acc.invoiceCountByCurrency.UYU) * 100) / 100 : 0,
        USD: acc.invoiceCountByCurrency.USD > 0 ? Math.round((net.USD / acc.invoiceCountByCurrency.USD) * 100) / 100 : 0,
      },
      firstPurchase: first ?? acc.firstInPeriod,
      lastPurchase: acc.lastInPeriod,
      type,
      salespersonId: acc.salespersonId,
      salespersonName: acc.salespersonName,
      currentSalespersonId: currentSpId,
      currentSalespersonName: currentSpId ? options?.salespersonNameById?.get(currentSpId) ?? null : null,
    });
  }
  rows.sort((a, b) => b.netSalesByCurrency.UYU + b.netSalesByCurrency.USD - (a.netSalesByCurrency.UYU + a.netSalesByCurrency.USD));
  return rows;
}

// ---------------------------------------------------------------------------
// Salesperson summary (comerciales)
// ---------------------------------------------------------------------------

const UNASSIGNED_ID = "__unassigned__";

export function buildSalespersonSummary(
  allDocs: readonly CanonicalSaleDocument[],
  periodFrom: string,
  periodTo: string,
  options?: SalesAggregationOptions
): SalespersonSummaryRow[] {
  const firstSale = mergeFirstSaleMaps(firstSaleByCustomer(allDocs), options?.firstSaleByCustomerId);

  const totalNet = emptyCurrencyPair();
  type Acc = {
    id: string | null;
    name: string;
    docs: Set<string>;
    customers: Set<string>;
    newCustomers: Set<string>;
    units: number;
    sales: CurrencyPair;
    creditNotes: CurrencyPair;
    invoiceCountByCurrency: CurrencyPair;
    productTotals: Map<string, { name: string; total: number }>;
  };
  const map = new Map<string, Acc>();

  function ensure(doc: CanonicalSaleDocument): Acc {
    const key = doc.salespersonId ?? UNASSIGNED_ID;
    let acc = map.get(key);
    if (!acc) {
      acc = {
        id: doc.salespersonId,
        name: doc.salespersonName ?? "Sin asignar",
        docs: new Set(),
        customers: new Set(),
        newCustomers: new Set(),
        units: 0,
        sales: emptyCurrencyPair(),
        creditNotes: emptyCurrencyPair(),
        invoiceCountByCurrency: emptyCurrencyPair(),
        productTotals: new Map(),
      };
      map.set(key, acc);
    }
    return acc;
  }

  for (const doc of allDocs) {
    if (doc.status === "cancelled") continue;
    if (!inWindow(doc.issueDate, periodFrom, periodTo)) continue;

    if (doc.kind === "credit_note") {
      // Case B: NC del cliente se atribuye al comercial vigente del documento (heredado del cliente).
      const acc = ensure(doc);
      if (isKnownCurrency(doc.currency)) addToPair(acc.creditNotes, doc.currency, doc.grossAmount);
      continue;
    }

    if (!isValidSale(doc)) continue;
    const acc = ensure(doc);
    acc.docs.add(doc.documentId);
    const ck = customerKey(doc);
    acc.customers.add(ck);
    if ((firstSale.get(ck) ?? "") >= periodFrom) acc.newCustomers.add(ck);
    if (isKnownCurrency(doc.currency)) {
      addToPair(acc.sales, doc.currency, doc.grossAmount);
      addToPair(acc.invoiceCountByCurrency, doc.currency, 1);
    }
    for (const line of countableLines(doc)) {
      if (!line.synthetic) acc.units += line.quantity;
      const pt = acc.productTotals.get(line.productGroupKey) ?? { name: line.displayProductName, total: 0 };
      if (isKnownCurrency(line.currency)) pt.total += line.lineAmount;
      acc.productTotals.set(line.productGroupKey, pt);
    }
  }

  for (const acc of map.values()) {
    totalNet.UYU += acc.sales.UYU - acc.creditNotes.UYU;
    totalNet.USD += acc.sales.USD - acc.creditNotes.USD;
  }

  const rows: SalespersonSummaryRow[] = [];
  for (const acc of map.values()) {
    let topProduct: string | null = null;
    let topTotal = -1;
    for (const pt of acc.productTotals.values()) {
      if (pt.total > topTotal) {
        topTotal = pt.total;
        topProduct = pt.name;
      }
    }
    const net: CurrencyPair = {
      UYU: acc.sales.UYU - acc.creditNotes.UYU,
      USD: acc.sales.USD - acc.creditNotes.USD,
    };
    const assignedCount =
      options?.assignedCustomerCountBySalesperson?.get(acc.id) ?? acc.customers.size;
    rows.push({
      salespersonId: acc.id,
      salespersonName: acc.name,
      invoiceCount: acc.docs.size,
      unitsSold: Math.round(acc.units * 100) / 100,
      customerCount: acc.customers.size,
      assignedCustomerCount: assignedCount,
      newCustomerCount: acc.newCustomers.size,
      salesByCurrency: round2Pair(acc.sales),
      creditNotesByCurrency: round2Pair(acc.creditNotes),
      netSalesByCurrency: round2Pair(net),
      avgTicketByCurrency: {
        UYU: acc.invoiceCountByCurrency.UYU > 0 ? Math.round((net.UYU / acc.invoiceCountByCurrency.UYU) * 100) / 100 : 0,
        USD: acc.invoiceCountByCurrency.USD > 0 ? Math.round((net.USD / acc.invoiceCountByCurrency.USD) * 100) / 100 : 0,
      },
      topProductName: topProduct,
      shareByCurrency: {
        UYU: totalNet.UYU > 0 ? Math.round((net.UYU / totalNet.UYU) * 1000) / 10 : 0,
        USD: totalNet.USD > 0 ? Math.round((net.USD / totalNet.USD) * 1000) / 10 : 0,
      },
    });
  }
  rows.sort((a, b) => {
    if (a.salespersonId === null && b.salespersonId !== null) return 1;
    if (b.salespersonId === null && a.salespersonId !== null) return -1;
    return b.netSalesByCurrency.UYU + b.netSalesByCurrency.USD - (a.netSalesByCurrency.UYU + a.netSalesByCurrency.USD);
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Seller summary (vendedores — operación puntual, manual, distinto de cartera)
// ---------------------------------------------------------------------------

/**
 * Ventas agrupadas por VENDEDOR real de cada operación (`doc.sellerId`,
 * asignación manual por documento). Distinto de `buildSalespersonSummary`
 * (cartera gestionada por ejecutivo).
 *
 * Notas de crédito: sin vínculo confiable a la factura original, no se puede
 * saber quién vendió la operación que ajustan — SIEMPRE reducen el bucket
 * "Sin vendedor identificado", nunca cuentan como operación (no incrementan
 * invoiceCount) y nunca se asignan a un vendedor por herencia del ejecutivo.
 */
export function buildSellerSalesSummary(
  allDocs: readonly CanonicalSaleDocument[],
  periodFrom: string,
  periodTo: string
): SellerSalesSummaryRow[] {
  type Acc = {
    id: string | null;
    name: string;
    docs: Set<string>;
    customers: Set<string>;
    units: number;
    sales: CurrencyPair;
    creditNotes: CurrencyPair;
    invoiceCountByCurrency: CurrencyPair;
    productTotals: Map<string, { name: string; total: number }>;
  };
  const map = new Map<string, Acc>();

  function ensure(id: string | null, name: string): Acc {
    const key = id ?? UNASSIGNED_ID;
    let acc = map.get(key);
    if (!acc) {
      acc = {
        id,
        name,
        docs: new Set(),
        customers: new Set(),
        units: 0,
        sales: emptyCurrencyPair(),
        creditNotes: emptyCurrencyPair(),
        invoiceCountByCurrency: emptyCurrencyPair(),
        productTotals: new Map(),
      };
      map.set(key, acc);
    }
    return acc;
  }

  for (const doc of allDocs) {
    if (doc.status === "cancelled") continue;
    if (!inWindow(doc.issueDate, periodFrom, periodTo)) continue;

    if (doc.kind === "credit_note") {
      const acc = ensure(null, "Sin vendedor identificado");
      if (isKnownCurrency(doc.currency)) addToPair(acc.creditNotes, doc.currency, doc.grossAmount);
      continue;
    }

    if (!isValidSale(doc)) continue;
    const acc = ensure(doc.sellerId, doc.sellerId ? (doc.sellerName ?? "Vendedor") : "Sin vendedor identificado");
    acc.docs.add(doc.documentId);
    acc.customers.add(customerKey(doc));
    if (isKnownCurrency(doc.currency)) {
      addToPair(acc.sales, doc.currency, doc.grossAmount);
      addToPair(acc.invoiceCountByCurrency, doc.currency, 1);
    }
    for (const line of countableLines(doc)) {
      if (!line.synthetic) acc.units += line.quantity;
      const pt = acc.productTotals.get(line.productGroupKey) ?? { name: line.displayProductName, total: 0 };
      if (isKnownCurrency(line.currency)) pt.total += line.lineAmount;
      acc.productTotals.set(line.productGroupKey, pt);
    }
  }

  const rows: SellerSalesSummaryRow[] = [];
  for (const acc of map.values()) {
    let topProduct: string | null = null;
    let topTotal = -1;
    for (const pt of acc.productTotals.values()) {
      if (pt.total > topTotal) {
        topTotal = pt.total;
        topProduct = pt.name;
      }
    }
    const net: CurrencyPair = {
      UYU: acc.sales.UYU - acc.creditNotes.UYU,
      USD: acc.sales.USD - acc.creditNotes.USD,
    };
    rows.push({
      sellerId: acc.id,
      sellerName: acc.name,
      invoiceCount: acc.docs.size,
      unitsSold: Math.round(acc.units * 100) / 100,
      customerCount: acc.customers.size,
      salesByCurrency: round2Pair(acc.sales),
      creditNotesByCurrency: round2Pair(acc.creditNotes),
      netSalesByCurrency: round2Pair(net),
      avgTicketByCurrency: {
        UYU: acc.invoiceCountByCurrency.UYU > 0 ? Math.round((net.UYU / acc.invoiceCountByCurrency.UYU) * 100) / 100 : 0,
        USD: acc.invoiceCountByCurrency.USD > 0 ? Math.round((net.USD / acc.invoiceCountByCurrency.USD) * 100) / 100 : 0,
      },
      topProductName: topProduct,
    });
  }
  rows.sort((a, b) => {
    if (a.sellerId === null && b.sellerId !== null) return 1;
    if (b.sellerId === null && a.sellerId !== null) return -1;
    return b.netSalesByCurrency.UYU + b.netSalesByCurrency.USD - (a.netSalesByCurrency.UYU + a.netSalesByCurrency.USD);
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Collection summary
// ---------------------------------------------------------------------------

export function buildSalesCollectionSummary(
  allDocs: readonly CanonicalSaleDocument[],
  periodFrom: string,
  periodTo: string
): SalesCollectionSummary {
  const sold = emptyCurrencyPair();
  const applied = emptyCurrencyPair();
  const registered = emptyCurrencyPair();
  const pending = emptyCurrencyPair();

  for (const doc of allDocs) {
    if (!isValidSale(doc)) continue;
    if (!inWindow(doc.issueDate, periodFrom, periodTo)) continue;
    if (!isKnownCurrency(doc.currency)) continue;
    addToPair(sold, doc.currency, doc.grossAmount);
    addToPair(applied, doc.currency, doc.appliedAmount);
    addToPair(registered, doc.currency, doc.registeredAmount);
    addToPair(pending, doc.currency, doc.pendingAmount);
  }

  return {
    sold: round2Pair(sold),
    applied: round2Pair(applied),
    registered: round2Pair(registered),
    pending: round2Pair(pending),
    appliedRateByCurrency: {
      UYU: sold.UYU > 0 ? Math.round((applied.UYU / sold.UYU) * 1000) / 10 : 0,
      USD: sold.USD > 0 ? Math.round((applied.USD / sold.USD) * 1000) / 10 : 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export function buildSalesComparison(
  allDocs: readonly CanonicalSaleDocument[],
  currentFrom: string,
  currentTo: string,
  previousFrom: string,
  previousTo: string,
  options?: SalesAggregationOptions
): SalesComparison {
  const current = buildSalesPeriodSnapshot(allDocs, currentFrom, currentTo, options);
  const previous = buildSalesPeriodSnapshot(allDocs, previousFrom, previousTo, options);

  const pct = (cur: number, prev: number): number | null => {
    if (prev === 0) return null; // "Sin base comparable"
    return Math.round(((cur - prev) / prev) * 1000) / 10;
  };

  return {
    current,
    previous,
    salesDeltaByCurrency: {
      UYU: Math.round((current.netSalesByCurrency.UYU - previous.netSalesByCurrency.UYU) * 100) / 100,
      USD: Math.round((current.netSalesByCurrency.USD - previous.netSalesByCurrency.USD) * 100) / 100,
    },
    salesPctByCurrency: {
      UYU: pct(current.netSalesByCurrency.UYU, previous.netSalesByCurrency.UYU),
      USD: pct(current.netSalesByCurrency.USD, previous.netSalesByCurrency.USD),
    },
    invoiceDelta: current.invoiceCount - previous.invoiceCount,
    unitsDelta: Math.round((current.unitsSold - previous.unitsSold) * 100) / 100,
    customerDelta:
      current.newCustomers + current.recurringCustomers - (previous.newCustomers + previous.recurringCustomers),
    creditNoteDelta: current.creditNoteCount - previous.creditNoteCount,
  };
}

// ---------------------------------------------------------------------------
// Unclassified concepts (bandeja)
// ---------------------------------------------------------------------------

export function buildUnclassifiedSalesSummary(
  allDocs: readonly CanonicalSaleDocument[],
  periodFrom: string,
  periodTo: string,
  suggest?: (description: string, code: string | null) => { productId: string; productName: string } | null
): UnclassifiedConceptRow[] {
  type Acc = {
    key: string;
    originalDescription: string;
    originalCode: string | null;
    occurrences: number;
    total: CurrencyPair;
    customers: Set<string>;
    firstSeen: string | null;
    lastSeen: string | null;
  };
  const map = new Map<string, Acc>();

  for (const doc of allDocs) {
    if (!isValidSale(doc)) continue;
    if (!inWindow(doc.issueDate, periodFrom, periodTo)) continue;
    for (const line of doc.lines) {
      if (line.classificationStatus !== "unclassified") continue;
      const key = conceptKey(line.originalDescription, line.originalCode);
      let acc = map.get(key);
      if (!acc) {
        acc = {
          key,
          originalDescription: line.originalDescription,
          originalCode: line.originalCode,
          occurrences: 0,
          total: emptyCurrencyPair(),
          customers: new Set(),
          firstSeen: null,
          lastSeen: null,
        };
        map.set(key, acc);
      }
      acc.occurrences += 1;
      if (isKnownCurrency(line.currency)) addToPair(acc.total, line.currency, line.lineAmount);
      acc.customers.add(customerKey(doc));
      if (!acc.firstSeen || doc.issueDate < acc.firstSeen) acc.firstSeen = doc.issueDate;
      if (!acc.lastSeen || doc.issueDate > acc.lastSeen) acc.lastSeen = doc.issueDate;
    }
  }

  const rows: UnclassifiedConceptRow[] = [];
  for (const acc of map.values()) {
    const suggestion = suggest ? suggest(acc.originalDescription, acc.originalCode) : null;
    rows.push({
      key: acc.key,
      originalDescription: acc.originalDescription,
      originalCode: acc.originalCode,
      occurrences: acc.occurrences,
      totalByCurrency: round2Pair(acc.total),
      customerCount: acc.customers.size,
      firstSeen: acc.firstSeen,
      lastSeen: acc.lastSeen,
      suggestedProductId: suggestion?.productId ?? null,
      suggestedProductName: suggestion?.productName ?? null,
    });
  }
  // Prioridad: impacto (facturación) desc, luego frecuencia.
  rows.sort((a, b) => {
    const av = a.totalByCurrency.UYU + a.totalByCurrency.USD;
    const bv = b.totalByCurrency.UYU + b.totalByCurrency.USD;
    if (bv !== av) return bv - av;
    return b.occurrences - a.occurrences;
  });
  return rows;
}
