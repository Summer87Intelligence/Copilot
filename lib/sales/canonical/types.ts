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
  | "zeta_concept"
  | "fallback";

export type CanonicalSaleLine = {
  lineId: string;
  documentId: string;

  /** ArticuloCodigo de Zeta (código estable) si existe. */
  originalCode: string | null;
  /** Concepto de Zeta — texto original, jamás se modifica. */
  originalDescription: string;
  /** Concepto de Zeta (== originalDescription cuando existe línea real; null si sintética). */
  originalConcept: string | null;

  canonicalProductId: string | null;
  canonicalProductName: string | null;
  canonicalCategoryId: string | null;
  canonicalCategoryName: string | null;

  /**
   * Nombre de producto/servicio a mostrar en la UI comercial. Jerarquía:
   * canonicalProductName → concepto Zeta → descripción → "Sin detalle".
   * NUNCA es "Sin clasificar": un concepto Zeta válido siempre se muestra.
   */
  displayProductName: string;
  /** Clave estable de agrupación (producto canónico o concepto normalizado). */
  productGroupKey: string;
  /**
   * canonical: mapeado a producto del catálogo.
   * original: se muestra el concepto Zeta tal cual (sin alias todavía).
   * missing_detail: no hay concepto ni descripción (documento sin líneas).
   */
  normalizationStatus: "canonical" | "original" | "missing_detail";

  /** Estado interno de clasificación (administración; NO se muestra como producto). */
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

  /**
   * EJECUTIVO del cliente vigente en issueDate (cartera, `sales_client_salespersons`).
   * Responsable de la relación con el cliente. NO es quien realizó esta venta —
   * ver `sellerId` para eso. Se usa solo para métricas de "cartera gestionada".
   */
  salespersonId: string | null;
  salespersonName: string | null;

  /**
   * VENDEDOR real de esta operación puntual: asignación MANUAL por documento
   * (`sales_document_salespersons`). Zeta no expone vendedor por factura
   * (VendedorCodigo siempre vacío en este tenant), así que este campo SOLO se
   * completa cuando un usuario lo asigna explícitamente. null = "Sin vendedor
   * identificado". NUNCA se infiere automáticamente del ejecutivo del cliente.
   * Las notas de crédito no admiten asignación (siempre null).
   */
  sellerId: string | null;
  sellerName: string | null;

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

  /** Ventas emitidas brutas (solo kind=sale, status válido). Alias: grossSalesByCurrency. */
  salesEmitted: CurrencyPair;
  /** Notas de crédito emitidas (magnitud positiva). */
  creditNotes: CurrencyPair;
  /**
   * Ventas netas = salesEmitted − creditNotes (por moneda).
   * KPI comercial principal FASE 9D. Alias histórico: salesAdjusted.
   */
  salesAdjusted: CurrencyPair;
  /** Alias explícito de ventas netas (= salesAdjusted). */
  netSalesByCurrency: CurrencyPair;
  /** Alias explícito de ventas brutas (= salesEmitted). */
  grossSalesByCurrency: CurrencyPair;

  /** Cobrado aplicado sobre documentos del período. */
  appliedCollected: CurrencyPair;
  registeredCollected: CurrencyPair;
  pending: CurrencyPair;

  /** Facturas de venta válidas (documentos, no líneas). Excluye NC. */
  invoiceCount: number;
  creditNoteCount: number;
  /** Unidades/servicios (métrica interna; no usar como KPI directivo). */
  unitsSold: number;

  /** Ticket promedio por moneda = ventas netas / facturas de esa moneda. */
  averageTicket: CurrencyPair;

  newCustomers: number;
  recurringCustomers: number;

  /** Conceptos Zeta válidos aún sin alias en el catálogo (métrica interna admin). */
  unclassifiedLineCount: number;
  /** Líneas realmente sin detalle (documento sin líneas Zeta). */
  missingDetailLineCount: number;
  missingDetailAmount: CurrencyPair;

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
  /** canonical: mapeado al catálogo; original: concepto Zeta; missing_detail: sin línea. */
  normalizationStatus: "canonical" | "original" | "missing_detail";

  quantity: number;
  invoiceCount: number;
  customerCount: number;

  totalByCurrency: CurrencyPair;
  /** Precio promedio por moneda = total / cantidad (misma moneda). Uso interno / detalle. */
  avgPriceByCurrency: CurrencyPair;
  /** Ticket promedio comercial = total / facturas de esa moneda. */
  avgTicketByCurrency: CurrencyPair;
};

export type CustomerSalesSummaryRow = {
  customerId: string | null;
  customerCode: string | null;
  customerName: string;

  invoiceCount: number;
  productCount: number;

  /** Ventas brutas emitidas (sin NC). */
  salesByCurrency: CurrencyPair;
  /** NC del cliente en el período (Case B: vínculo por cliente). */
  creditNotesByCurrency: CurrencyPair;
  /** Ventas netas = sales − credit notes. */
  netSalesByCurrency: CurrencyPair;
  appliedByCurrency: CurrencyPair;
  pendingByCurrency: CurrencyPair;
  /** Ticket = netSales / facturas de esa moneda. */
  avgTicketByCurrency: CurrencyPair;

  firstPurchase: string | null;
  lastPurchase: string | null;

  type: "new" | "recurring";

  /** Comercial ATRIBUIDO al período (resuelto por fecha de cada venta). */
  salespersonId: string | null;
  salespersonName: string | null;
  /**
   * Comercial VIGENTE del cliente (asignación abierta actual). Es el valor que
   * edita el selector de Ventas → Clientes; independiente del período mostrado.
   */
  currentSalespersonId: string | null;
  currentSalespersonName: string | null;
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

  /** Diferencia absoluta de ventas netas por moneda. */
  salesDeltaByCurrency: CurrencyPair;
  /** Variación % de ventas netas; null cuando base anterior es 0. */
  salesPctByCurrency: { UYU: number | null; USD: number | null };

  invoiceDelta: number;
  unitsDelta: number;
  customerDelta: number;
  creditNoteDelta: number;
};

/** Fecha desde la cual se asigna comercial (no hay backfill anterior). */
export const SALESPERSON_START_DATE = "2026-07-01" as const;

export type SalespersonSummaryRow = {
  salespersonId: string | null; // null = "Sin asignar"
  salespersonName: string;

  invoiceCount: number;
  unitsSold: number;
  customerCount: number;
  /** Clientes con asignación vigente (aunque no hayan comprado en el período). */
  assignedCustomerCount: number;
  newCustomerCount: number;

  /** Ventas netas atribuidas (bruto − NC del cliente cuando el vínculo es por cliente). */
  salesByCurrency: CurrencyPair;
  creditNotesByCurrency: CurrencyPair;
  netSalesByCurrency: CurrencyPair;
  avgTicketByCurrency: CurrencyPair;

  topProductName: string | null;
  /** Participación % del total neto emitido por moneda (0 si el total es 0). */
  shareByCurrency: CurrencyPair;
};

/**
 * Vendedor de la operación (asignación manual por documento). Distinto de
 * `SalespersonSummaryRow`, que es cartera gestionada por EJECUTIVO. Una NC sin
 * factura original identificable reduce el bucket "Sin vendedor identificado"
 * pero nunca cuenta como operación (invoiceCount no la incluye).
 */
export type SellerSalesSummaryRow = {
  sellerId: string | null; // null = "Sin vendedor identificado"
  sellerName: string;

  invoiceCount: number;
  unitsSold: number;
  customerCount: number;

  /** Ventas brutas emitidas atribuidas manualmente a este vendedor. */
  salesByCurrency: CurrencyPair;
  /** NC sin factura original identificable (siempre en el bucket "Sin vendedor identificado"). */
  creditNotesByCurrency: CurrencyPair;
  /** Ventas netas = sales − creditNotes. */
  netSalesByCurrency: CurrencyPair;
  avgTicketByCurrency: CurrencyPair;

  topProductName: string | null;
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
