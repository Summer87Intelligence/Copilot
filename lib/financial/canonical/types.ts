/**
 * FINANCIAL CANONICAL LAYER — Tipos canónicos.
 *
 * Fuente única de tipos para las métricas financieras del Copilot. El objetivo
 * de esta capa es eliminar las definiciones duplicadas de "saldo pendiente",
 * "saldo atrasado", "cobrado" y "ventas" que hoy conviven en Hoy, Cartera,
 * Finanzas, Cliente 360 y Reportes.
 *
 * Reglas de diseño:
 *  - Nombres explícitos: nunca `collected`, `debt`, `sales`, `overdue` a secas.
 *  - UYU y USD SIEMPRE separados. No hay consolidación implícita.
 *  - Fechas como `YYYY-MM-DD` (convención del dominio Copilot — ver
 *    `lib/copilot-operational-period.ts`). No se usan objetos `Date` para
 *    evitar ambigüedad de zona horaria.
 *  - Distinción explícita entre STOCK (al corte) y PERÍODO (actividad del rango).
 *
 * Ver: docs/technical/financial-canonical-layer.md
 */

// ---------------------------------------------------------------------------
// Primitivos
// ---------------------------------------------------------------------------

/** Monedas soportadas por el dominio operativo. UYU y USD nunca se suman. */
export type FinancialCurrency = "UYU" | "USD";

/** Fecha ISO `YYYY-MM-DD` (día calendario, sin hora ni zona). */
export type IsoDate = string;

/**
 * Buckets canónicos de atraso. Se miden por DÍAS DE ATRASO desde la fecha de
 * vencimiento (`due_date`), nunca desde la emisión.
 *
 *  - `current`        → al día (aún no vence o vence hoy).
 *  - `overdue_1_7`    → 1 a 7 días de atraso.
 *  - `overdue_8_14`   → 8 a 14 días de atraso.
 *  - `overdue_15_30`  → 15 a 30 días de atraso.
 *  - `overdue_31_plus`→ más de 30 días de atraso.
 */
export type CanonicalAgingBucket =
  | "current"
  | "overdue_1_7"
  | "overdue_8_14"
  | "overdue_15_30"
  | "overdue_31_plus";

export const CANONICAL_AGING_BUCKET_ORDER: readonly CanonicalAgingBucket[] = [
  "current",
  "overdue_1_7",
  "overdue_8_14",
  "overdue_15_30",
  "overdue_31_plus",
];

/** Monto etiquetado con su moneda. La moneda es parte inseparable del monto. */
export interface CanonicalMoney {
  currency: FinancialCurrency;
  amount: number;
}

/**
 * Ventana temporal canónica. `from`/`to` delimitan la ACTIVIDAD del período;
 * `cutoff` es la fecha de corte para el STOCK (saldo pendiente / atrasado).
 */
export interface CanonicalPeriod {
  from: IsoDate;
  to: IsoDate;
  cutoff: IsoDate;
}

// ---------------------------------------------------------------------------
// Métricas canónicas
// ---------------------------------------------------------------------------

/**
 * Métricas de VENTAS del período (flujo). Ancladas en `issue_date`.
 *
 *  - `issuedNet`         → ventas emitidas netas de notas de crédito.
 *  - `appliedCollected`  → COBRADO APLICADO: `issuedNet − pendingAtCutoff` de
 *                          ESAS ventas. NO representa recibos ingresados en el
 *                          mismo período (para eso ver métricas de cobranza
 *                          registrada).
 *  - `pendingAtCutoff`   → saldo pendiente de las ventas del período al corte.
 *  - `collectionRate`    → `appliedCollected / issuedNet` en [0..1]; `null` si
 *                          `issuedNet <= 0`.
 */
export interface CanonicalSalesMetrics {
  currency: FinancialCurrency;
  issuedNet: number;
  appliedCollected: number;
  pendingAtCutoff: number;
  collectionRate: number | null;
  invoiceCount: number;
  averageTicket: number | null;
  /** Cantidad de notas de crédito detectadas dentro del período. */
  creditNoteCount: number;
  /** Monto total de notas de crédito (signo positivo) restado de `issuedNet`. */
  creditNoteAmount: number;
}

/**
 * Métricas de COBRANZA REGISTRADA del período. Ancladas en `receipt_date`.
 *
 * Puede incluir cobros de facturas emitidas en períodos anteriores, por lo que
 * NUNCA debe compararse 1:1 contra `issuedNet` como si fueran el mismo flujo.
 */
export interface CanonicalRegisteredCollectionsMetrics {
  currency: FinancialCurrency;
  registeredCollections: number;
  receiptCount: number;
}

/**
 * Métricas de DEUDA (stock) al corte. Suma de balances abiertos
 * (`balance_amount > 0`) de facturas con `issue_date <= cutoff`.
 *
 *  - `pendingBalance` → todo el saldo abierto.
 *  - `overdueBalance` → subconjunto con vencimiento (`due_date`) anterior al
 *                       corte. NUNCA se usa `issue_date` como sustituto.
 *  - `currentBalance` → `pendingBalance − overdueBalance` (aún no vencido).
 */
export interface CanonicalDebtMetrics {
  currency: FinancialCurrency;
  pendingBalance: number;
  overdueBalance: number;
  currentBalance: number;
  overdueClients: number;
  totalOpenClients: number;
  /**
   * Saldo abierto sin `due_date` resoluble: no puede clasificarse como vencido
   * y cae en `currentBalance`. Se expone para explicabilidad, no es un error.
   */
  balanceWithoutDueDate: number;
}

/**
 * Aging canónico (stock) por moneda. Los montos son saldos abiertos
 * (`balance_amount`) distribuidos por bucket de atraso según `due_date`.
 */
export interface CanonicalAgingMetrics {
  currency: FinancialCurrency;
  current: number;
  overdue1To7: number;
  overdue8To14: number;
  overdue15To30: number;
  overdue31Plus: number;
  /** Total = suma de los 5 buckets (== `pendingBalance` de la misma moneda). */
  total: number;
}

// ---------------------------------------------------------------------------
// Contexto financiero canónico
// ---------------------------------------------------------------------------

/**
 * Contexto reutilizable para que cada módulo interprete fechas y monedas de la
 * misma forma. Evita que Hoy, Cartera y Reportes definan su propio "hoy",
 * "corte" o "piso 2026".
 */
export interface CanonicalFinancialContext {
  workspaceId: string;
  /** Inicio de la actividad del período (inclusive). */
  periodStart: IsoDate;
  /** Fin de la actividad del período (inclusive). */
  periodEnd: IsoDate;
  /** Fecha de corte para el stock (saldo pendiente / atrasado / aging). */
  cutoffDate: IsoDate;
  /** Piso duro de fechas financieras (default `MIN_FINANCIAL_DATE` = 2026-01-01). */
  minFinancialDate: IsoDate;
  /** Monedas a calcular. UYU y USD nunca se consolidan sin `exchangeRate`. */
  currencies: FinancialCurrency[];
  /**
   * Tipo de cambio SOLO para consolidación explícita y visible. Nunca se aplica
   * de forma silenciosa. `rate` = UYU por 1 USD.
   */
  exchangeRate?: {
    from: "USD";
    to: "UYU";
    rate: number;
    date: IsoDate;
    source: string;
  };
}

// ---------------------------------------------------------------------------
// Diagnósticos e integridad
// ---------------------------------------------------------------------------

/**
 * Datos que no participaron de los cálculos, por política o por falta de
 * información. Se exponen para explicabilidad — no se infieren silenciosamente.
 */
export interface CanonicalFinancialDiagnostics {
  /** Facturas excluidas por `issue_date < minFinancialDate`. */
  excludedByMinFinancialDate: number;
  /** Recibos excluidos por `receipt_date < minFinancialDate`. */
  excludedReceiptsByMinFinancialDate: number;
  /** Facturas activas no anuladas descartadas por `currency_code` nulo/no soportado. */
  excludedByUnknownCurrency: number;
  /** Recibos activos descartados por `currency_code` nulo/no soportado. */
  excludedReceiptsByUnknownCurrency: number;
}

/** Bloque de métricas canónicas de una moneda. */
export interface CanonicalCurrencyMetrics {
  currency: FinancialCurrency;
  sales: CanonicalSalesMetrics;
  registeredCollections: CanonicalRegisteredCollectionsMetrics;
  debt: CanonicalDebtMetrics;
  aging: CanonicalAgingMetrics;
}

/**
 * Salida canónica única. Provee, por moneda, las 4 familias de métricas más los
 * diagnósticos de integridad. Es el contrato estable que los módulos deben
 * consumir a medida que migren.
 */
export interface CanonicalFinancialSummary {
  context: CanonicalFinancialContext;
  byCurrency: CanonicalCurrencyMetrics[];
  diagnostics: CanonicalFinancialDiagnostics;
}

// ---------------------------------------------------------------------------
// Contratos de entrada (mínimos, estructurales)
// ---------------------------------------------------------------------------

/**
 * Fila de factura mínima que consumen los builders canónicos. Es un
 * subconjunto estructural de `InvoiceInput`
 * (`lib/copilot-financial-reconciliation.ts`) y de las filas `proto_invoices`,
 * por lo que ambos son asignables sin adaptador.
 */
export interface CanonicalInvoiceInput {
  id?: string | null;
  company_id?: string | null;
  currency_code?: string | null;
  total_amount?: number | null;
  balance_amount?: number | null;
  status?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  /** `true` si la fila es Nota de Crédito (detectada por el caller). */
  is_credit_note?: boolean;
  /** `false` excluye la fila de todo cálculo. `null`/`undefined` = activo. */
  is_active?: boolean | null;
}

/**
 * Recibo mínimo que consumen los builders canónicos. Subconjunto estructural de
 * `ReceiptInput` (`lib/copilot-financial-reconciliation.ts`).
 */
export interface CanonicalReceiptInput {
  currency_code?: string | null;
  amount?: number | null;
  receipt_date?: string | null;
  status?: string | null;
  is_active?: boolean | null;
}

/**
 * Cuota mínima que consume el builder de debt units. Subconjunto estructural de
 * las filas `proto_invoice_installments`.
 */
export interface CanonicalInstallmentInput {
  id?: string | null;
  invoice_id?: string | null;
  currency_code?: string | null;
  /** Saldo abierto de la cuota (`cuota_saldo`). */
  cuota_saldo?: number | null;
  /** Vencimiento de la cuota (`cuota_vencimiento`). */
  cuota_vencimiento?: string | null;
  is_active?: boolean | null;
}

// ---------------------------------------------------------------------------
// Debt units — unidad vencible canónica (factura o cuota)
// ---------------------------------------------------------------------------

/**
 * Unidad de deuda vencible. Es la unidad ATÓMICA sobre la que se calculan
 * saldo pendiente, atrasado, al día y aging. Cuando una factura tiene cuotas
 * válidas, cada cuota abierta es una unidad; si no, la factura completa es una
 * unidad. Nunca se cuenta la factura Y sus cuotas a la vez.
 */
export interface CanonicalDebtUnit {
  sourceType: "invoice" | "installment";
  invoiceId: string;
  installmentId?: string;
  companyId: string | null;
  currency: FinancialCurrency;
  /** Vencimiento resoluble (`YYYY-MM-DD`) o `null` si falta / es inválido. */
  dueDate: IsoDate | null;
  /** Saldo abierto (> 0). */
  openBalance: number;
}

/** Códigos de diagnóstico de calidad de datos de deuda. */
export type CanonicalDebtDiagnosticCode =
  | "missing_currency"
  | "missing_due_date"
  | "invalid_due_date"
  | "installment_balance_mismatch"
  | "negative_open_balance"
  | "invoice_without_company";

/** Diagnóstico individual, referenciando la factura/cuota afectada. */
export interface CanonicalDebtDiagnostic {
  code: CanonicalDebtDiagnosticCode;
  invoiceId: string;
  installmentId?: string;
  currency?: FinancialCurrency;
  /** Detalle numérico contextual (p. ej. delta de mismatch). */
  detail?: number;
}

/** Resultado del builder central de debt units. */
export interface CanonicalDebtUnitsResult {
  units: CanonicalDebtUnit[];
  diagnostics: CanonicalDebtDiagnostic[];
  /** Conteo por código para métricas rápidas. */
  diagnosticCounts: Record<CanonicalDebtDiagnosticCode, number>;
}
