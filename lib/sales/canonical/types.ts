/**
 * FASE 9 — Módulo canónico de Ventas.
 *
 * Tipos puros del modelo comercial. Sin JSX, sin acceso a DB: solo estructuras
 * de datos que las capas de agregación, API y UI consumen.
 *
 * Fuente real (auditada 2026-07-16, ver memoria project_fase9_sales_audit):
 *   Las líneas de venta NO viven en una tabla dedicada. Están persistidas en
 *   `proto_invoices.zeta_metadata.zeta_customer_voucher_v1.raw_payload.Lineas[]`
 *   por el pipeline de comprobantes cliente Zeta. Cada línea trae:
 *     Concepto, ArticuloCodigo, Cantidad, PrecioUnitario, Neto, IVA, Total,
 *     Descuento1/2/3, Notas.
 *   El header trae MonedaCodigo (1=UYU,2=USD), CFETipo, Cotizacion,
 *   VendedorCodigo (SIEMPRE vacío en este tenant → vendedor no disponible).
 *
 * Reglas innegociables reflejadas aquí:
 *   - UYU y USD NUNCA se mezclan ni se suman.
 *   - Vendido ≠ cobrado. Cobrado aplicado ≠ cobrado registrado.
 *   - Ventas emitidas ≠ notas de crédito. "Venta ajustada" solo con fórmula
 *     explícita (emitidas − NC).
 *   - Se excluyen documentos anteriores a MIN_FINANCIAL_DATE (2026-01-01).
 *   - No se inventan cantidades/precios/productos que Zeta no provee.
 */

export type SalesCurrency = "UYU" | "USD";

/** Documento con moneda no resuelta (raro): se cuenta pero se excluye de KPIs por moneda. */
export type SalesCurrencyResolved = SalesCurrency | "UNKNOWN";

export type SalesDocumentKind = "sale" | "credit_note";

export type SalesDocumentStatus = "valid" | "cancelled" | "adjustment";

export type SalesClassificationStatus =
  | "classified"
  | "unclassified"
  | "suggested"
  | "ignored";

export type SalesClassificationSource =
  | "zeta_code"
  | "manual_rule"
  | "exact_alias"
  | "normalized_alias"
  | "fallback";

export type CanonicalSaleLine = {
  lineId: string;
  documentId: string;

  /** ArticuloCodigo de Zeta (código estable) si existe. */
  originalCode: string | null;
  /** Concepto de Zeta — texto original, jamás se modifica. */
  originalDescription: string;

  canonicalProductId: string | null;
  canonicalProductName: string | null;
  canonicalCategoryId: string | null;
  canonicalCategoryName: string | null;

  classificationStatus: SalesClassificationStatus;
  classificationSource: SalesClassificationSource;

  /** Cantidad real de la línea (Zeta Cantidad). 1 si Zeta no la informa. */
  quantity: number;
  /** Precio unitario de Zeta si existe, si no null (nunca se inventa). */
  unitPrice: number | null;
  /** Importe de la línea = Total Zeta (bruto, incluye IVA) — reconcilia con header. */
  lineAmount: number;
  /** Neto (sin IVA) si Zeta lo informa. */
  netAmount: number | null;
  /** IVA de la línea si Zeta lo informa. */
  taxAmount: number | null;

  currency: SalesCurrencyResolved;

  /** true cuando la línea es sintética (documento sin detalle de líneas). */
  synthetic: boolean;
};

export type CanonicalSaleDocument = {
  workspaceId: string;
  documentId: string;
  externalId: string | null;

  /** Kind semántico: venta o nota de crédito. */
  kind: SalesDocumentKind;
  /** Etiqueta de tipo de comprobante (e-Factura, e-Ticket, NC, etc.). */
  documentType: string;
  /** CFE tipo DGI numérico si está disponible. */
  cfeTipo: number | null;
  documentNumber: string | null;

  customerId: string | null;
  customerCode: string | null;
  customerName: string;

  issueDate: string;
  dueDate: string | null;

  currency: SalesCurrencyResolved;

  /** Bruto emitido (magnitud positiva) = Σ lineAmount = header total_amount. */
  grossAmount: number;

  /** Cobrado aplicado (paid_amount) — lo efectivamente imputado. */
  appliedAmount: number;
  /** Cobrado registrado — cobros reconocidos aunque no imputados 1:1 (ver limitación). */
  registeredAmount: number;
  /** Pendiente = balance_amount. */
  pendingAmount: number;

  status: SalesDocumentStatus;

  /** Vendedor: null en este tenant (Zeta no lo expone). Reservado para futuro. */
  salespersonId: string | null;
  salespersonName: string | null;

  lines: CanonicalSaleLine[];
};

// ---------------------------------------------------------------------------
// Snapshots / agregaciones
// ---------------------------------------------------------------------------

/** Par de montos por moneda. UYU y USD SIEMPRE separados. */
export type CurrencyPair = {
  UYU: number;
  USD: number;
};

export function emptyCurrencyPair(): CurrencyPair {
  return { UYU: 0, USD: 0 };
}

export type SalesPeriodSnapshot = {
  periodFrom: string;
  periodTo: string;

  /** Ventas emitidas (solo kind=sale, status válido). */
  salesEmitted: CurrencyPair;
  /** Notas de crédito emitidas (magnitud positiva). */
  creditNotes: CurrencyPair;
  /** Venta ajustada = salesEmitted − creditNotes (fórmula explícita). */
  salesAdjusted: CurrencyPair;

  /** Cobrado aplicado sobre documentos del período. */
  appliedCollected: CurrencyPair;
  registeredCollected: CurrencyPair;
  pending: CurrencyPair;

  /** Facturas de venta válidas (documentos, no líneas). */
  invoiceCount: number;
  creditNoteCount: number;
  /** Unidades/servicios vendidos (Σ quantity de líneas clasificables de ventas). */
  unitsSold: number;

  /** Ticket promedio por moneda = salesEmitted / facturas de esa moneda. */
  averageTicket: CurrencyPair;

  newCustomers: number;
  recurringCustomers: number;

  /** Líneas sin clasificar (impacto). */
  unclassifiedLineCount: number;
  unclassifiedAmount: CurrencyPair;

  /** Documentos con moneda no resuelta (excluidos de UYU/USD). */
  unknownCurrencyCount: number;
};

export type ProductSalesSummaryRow = {
  key: string;
  productId: string | null;
  productName: string;
  categoryId: string | null;
  categoryName: string | null;
  classificationStatus: SalesClassificationStatus;

  quantity: number;
  invoiceCount: number;
  customerCount: number;

  totalByCurrency: CurrencyPair;
  /** Precio promedio por moneda = total / cantidad (misma moneda). */
  avgPriceByCurrency: CurrencyPair;
};

export type CustomerSalesSummaryRow = {
  customerId: string | null;
  customerCode: string | null;
  customerName: string;

  invoiceCount: number;
  productCount: number;

  salesByCurrency: CurrencyPair;
  appliedByCurrency: CurrencyPair;
  pendingByCurrency: CurrencyPair;
  avgTicketByCurrency: CurrencyPair;

  firstPurchase: string | null;
  lastPurchase: string | null;

  type: "new" | "recurring";
};

export type SalesCollectionSummary = {
  sold: CurrencyPair;
  applied: CurrencyPair;
  registered: CurrencyPair;
  pending: CurrencyPair;
  /** % cobranza aplicada por moneda = applied / sold. */
  appliedRateByCurrency: CurrencyPair;
};

export type SalesComparison = {
  current: SalesPeriodSnapshot;
  previous: SalesPeriodSnapshot;

  /** Diferencia absoluta emitidas por moneda. */
  salesDeltaByCurrency: CurrencyPair;
  /** Variación % por moneda; null cuando base anterior es 0 ("Sin base comparable"). */
  salesPctByCurrency: { UYU: number | null; USD: number | null };

  invoiceDelta: number;
  unitsDelta: number;
  customerDelta: number;
};

export type UnclassifiedConceptRow = {
  /** Clave de agrupación: normalized(originalDescription)|originalCode. */
  key: string;
  originalDescription: string;
  originalCode: string | null;

  occurrences: number;
  totalByCurrency: CurrencyPair;
  customerCount: number;
  firstSeen: string | null;
  lastSeen: string | null;

  /** Sugerencia de producto canónico si una regla no-ambigua matchea. */
  suggestedProductId: string | null;
  suggestedProductName: string | null;
};
