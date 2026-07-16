/**
 * lib/copilot-cartera-cards-source.ts
 *
 * Helper puro y testeable que normaliza `report.currencies` antes de que las
 * cards de `/copilot/cartera` lo consuman. Resuelve tres variabilidades reales
 * observadas en producción / HMR / serialización:
 *
 *  1) `report.currencies` puede llegar como **array** (motor canónico) o como
 *     **objeto indexado por código** (`{ USD: {...}, UYU: {...} }`) si alguien
 *     transforma el reporte antes de llegar al componente.
 *  2) Las claves de cada bucket pueden venir en **camelCase**
 *     (`totalInvoiced`) o **snake_case** (`total_invoiced`).
 *  3) Los montos `numeric` de Postgres pueden serializarse como string
 *     (`"659992.38"`); los counts pueden venir como string también.
 *
 * El motor backend (`generateFinancialConsistencyReport`) actualmente devuelve
 * array + camelCase, pero este helper aísla esa dependencia y evita que un
 * cambio futuro de shape rompa silenciosamente las cards.
 *
 * Reglas:
 *  - NO recalcula nada que el motor ya haya calculado.
 *  - Si `totalCollected` está ausente, se deriva desde `max(0, invoiced − pending)`
 *    del MISMO bucket (nunca cross-source).
 *  - Si `collectionEffectiveness` está ausente, se deriva desde
 *    `clamp(collected / invoiced, 0, 1)` o `null` si `invoiced ≤ 0`.
 *  - Nunca lee aging/staleClients: ése es trabajo del fallback defensivo
 *    upstream en `executive-summary-cards.tsx`.
 */

import { toSafeNumber } from "@/lib/copilot-numeric-parse";
import type { ReconciliationCurrencyCode } from "@/lib/copilot-financial-reconciliation";

/**
 * Shape normalizado que consumen las cards. Todos los campos son ya
 * derivados/listos para mostrar — el componente solo formatea.
 *
 * Campos contables (replica de Zeta):
 *   - issuedInPeriod    → Ventas Detalladas del período (alias: totalInvoiced)
 *   - pendingAtCutoff   → Comprobantes Pendientes al `Hasta` (incluye pre-período)
 *   - collectedInPeriod → Receipts en período (Estado de Cuenta, columna Haber)
 *   - openingBalance    → Saldo anterior al `Desde` (Estado de Cuenta)
 *   - appliedCollectionsAtCutoff → Cobrado aplicado (ventas resueltas al corte)
 *   - registeredCollectionsInPeriod → Cobrado registrado (recibos por fecha)
 *
 * Aliases legacy:
 *   - totalInvoiced  = issuedInPeriod
 *   - totalPending   = pendingAtCutoff cuando el motor envía ambos; si solo
 *                      envía totalPending (motor viejo), totalPending refleja
 *                      sólo facturas del período y pendingAtCutoff se iguala
 *                      a totalPending como fallback.
 *   - totalCollected = collectedInPeriod cuando viene del motor con receipts;
 *                      si no, fallback a `max(0, invoiced − pending)`.
 */
export type NormalizedCurrencyMetrics = {
  currencyCode: ReconciliationCurrencyCode;
  totalInvoiced: number;
  totalPending: number;
  totalCollected: number;
  /** Cobrado aplicado: ventas del período resueltas al corte. */
  appliedCollectionsAtCutoff: number;
  /** Cobrado registrado: recibos válidos con receipt_date dentro del período. */
  registeredCollectionsInPeriod: number;
  /** % de cobranza aplicado, no basado en recibos por fecha. */
  appliedCollectionRate: number | null;
  invoiceCount: number;
  pendingInvoiceCount: number;
  /** [0..1] o `null` si `totalInvoiced ≤ 0`. */
  collectionEffectiveness: number | null;
  // -- Campos contables nuevos --
  /** Ventas emitidas dentro del período (`= totalInvoiced`, alias semántico). */
  issuedInPeriod: number;
  /**
   * Saldo pendiente al `periodEnd` incluyendo facturas pre-Desde con balance.
   * Coincide con "Comprobantes Pendientes" de Zeta a fecha de corte.
   * Si el motor no lo envía, se iguala a `totalPending` (fallback compat).
   */
  pendingAtCutoff: number;
  /**
   * Ratio registrado del período (familia B). 0 si el motor no
   * recibió recibos. Usar `collectedReceiptCount = 0` para detectar este
   * estado y mostrar "—" en la card.
   */
  collectedInPeriod: number;
  /** Cantidad de recibos que aportaron a `collectedInPeriod`. */
  collectedReceiptCount: number;
  /** Alias explícito de `collectedReceiptCount` para contratos FASE 2. */
  registeredReceiptCount: number;
  /**
   * Saldo anterior al `periodStart` reconstruido desde ledger pre-período.
   * 0 si no aplica (sin filtro de período o sin pre-período).
   */
  openingBalance: number;
  /** Notas de crédito del período: cantidad detectada. */
  creditNoteCount: number;
  /** Notas de crédito del período: monto total acumulado (signo positivo). */
  creditNoteAmount: number;
  /**
   * Facturado neto = issuedInPeriod − creditNoteAmount.
   * Valor principal que deben mostrar las cards de "Facturado en el mes".
   */
  issuedInPeriodNet: number;
  /**
   * Saldo pendiente arrastrado de períodos anteriores: facturas emitidas ANTES
   * del `Desde` con balance > 0. Cero si no hay filtro de período activo o si
   * no existe deuda histórica. Junto con `totalPending` (in-period) suma
   * `pendingAtCutoff`.
   */
  previousPending: number;
  /**
   * Derived residual portfolio resolution amount.
   *
   * This is NOT a direct sum of receipts.
   * Formula: gross issued − credit notes − pending balance
   *
   * Used to reconcile Zeta AR snapshots consistently.
   * It can include cash collections, credit-note compensation,
   * adjustments, overpayments, or other Zeta-side settlement effects.
   */
  portfolioResolvedAmount: number;
};

type AnyRecord = Record<string, unknown>;

const VALID_CODES: readonly ReconciliationCurrencyCode[] = ["USD", "UYU"];

/**
 * Lee una métrica numérica probando claves camelCase y snake_case en orden.
 * Retorna `null` (no `0`) si ninguna clave resuelve a un número finito, para
 * que el caller pueda distinguir "campo ausente" de "campo presente con 0".
 */
export function readCurrencyMetric(
  record: AnyRecord | null | undefined,
  ...keys: readonly string[]
): number | null {
  if (!record) return null;
  for (const key of keys) {
    if (!(key in record)) continue;
    const n = toSafeNumber(record[key]);
    if (n !== null) return n;
  }
  return null;
}

/** Detecta el currency code en cualquier shape razonable. */
function readCurrencyCode(
  record: AnyRecord
): ReconciliationCurrencyCode | null {
  const raw =
    record.currencyCode ??
    record.currency_code ??
    record.currency ??
    record.code;
  if (typeof raw !== "string") return null;
  const upper = raw.trim().toUpperCase();
  return upper === "USD" || upper === "UYU"
    ? (upper as ReconciliationCurrencyCode)
    : null;
}

/**
 * Normaliza un único bucket (de array o de objeto indexado) a
 * `NormalizedCurrencyMetrics`. Hace TODAS las derivaciones del mismo bucket
 * — nunca cross-source — para que cards y dashboards usen los mismos valores
 * sin riesgo de drift.
 */
function normalizeBucket(
  raw: AnyRecord,
  forcedCode?: ReconciliationCurrencyCode
): NormalizedCurrencyMetrics | null {
  const code = forcedCode ?? readCurrencyCode(raw);
  if (!code) return null;

  const totalInvoiced =
    readCurrencyMetric(
      raw,
      "totalInvoiced",
      "total_invoiced",
      "invoicedAmount",
      "invoiced_amount",
      "issuedAmount",
      "issued_amount",
      "invoiced"
    ) ?? 0;

  const totalPending =
    readCurrencyMetric(
      raw,
      "totalPending",
      "total_pending",
      "pendingAmount",
      "pending_amount",
      "pending"
    ) ?? 0;

  const totalCollectedRaw = readCurrencyMetric(
    raw,
    "totalCollected",
    "total_collected",
    "collectedAmount",
    "collected_amount",
    "collected"
  );
  const totalCollected =
    totalCollectedRaw !== null && totalCollectedRaw >= 0
      ? totalCollectedRaw
      : Math.max(0, totalInvoiced - totalPending);

  const appliedCollectionsAtCutoffRaw = readCurrencyMetric(
    raw,
    "appliedCollectionsAtCutoff",
    "applied_collections_at_cutoff",
    "appliedCollected",
    "applied_collected",
    "portfolioResolvedAmount",
    "portfolio_resolved_amount"
  );

  const invoiceCount =
    readCurrencyMetric(
      raw,
      "invoiceCount",
      "invoice_count",
      "invoices"
    ) ?? 0;

  const pendingInvoiceCount =
    readCurrencyMetric(
      raw,
      "pendingInvoiceCount",
      "pending_invoice_count",
      "pendingCount",
      "pending_count"
    ) ?? 0;

  const effectivenessRaw = readCurrencyMetric(
    raw,
    "collectionEffectiveness",
    "collection_effectiveness",
    "effectiveness"
  );
  const collectionEffectiveness =
    effectivenessRaw !== null
      ? Math.max(0, Math.min(1, effectivenessRaw))
      : totalInvoiced > 0
        ? Math.max(0, Math.min(1, totalCollected / totalInvoiced))
        : null;

  // -- Campos contables nuevos (fallback a aliases legacy si el motor no los envía) --
  const issuedInPeriod =
    readCurrencyMetric(raw, "issuedInPeriod", "issued_in_period") ??
    totalInvoiced;
  const pendingAtCutoff =
    readCurrencyMetric(raw, "pendingAtCutoff", "pending_at_cutoff") ??
    totalPending;
  const collectedInPeriod =
    readCurrencyMetric(raw, "collectedInPeriod", "collected_in_period") ?? 0;
  const registeredCollectionsInPeriod =
    readCurrencyMetric(
      raw,
      "registeredCollectionsInPeriod",
      "registered_collections_in_period",
      "registeredCollections",
      "registered_collections"
    ) ?? collectedInPeriod;
  const collectedReceiptCount =
    readCurrencyMetric(
      raw,
      "collectedReceiptCount",
      "collected_receipt_count"
    ) ?? 0;
  const registeredReceiptCount =
    readCurrencyMetric(
      raw,
      "registeredReceiptCount",
      "registered_receipt_count",
      "receiptCount",
      "receipt_count"
    ) ?? collectedReceiptCount;
  const openingBalance =
    readCurrencyMetric(raw, "openingBalance", "opening_balance") ?? 0;

  const creditNoteAmount =
    readCurrencyMetric(raw, "creditNoteAmount", "credit_note_amount") ?? 0;
  const creditNoteCount = Math.max(
    0,
    Math.trunc(
      readCurrencyMetric(raw, "creditNoteCount", "credit_note_count") ?? 0
    )
  );
  const issuedInPeriodNet = issuedInPeriod - creditNoteAmount;

  // previousPending: saldo arrastrado anterior al período.
  // Primero intenta leerlo directo del motor; si no viene, lo deriva como
  // max(0, pendingAtCutoff − totalPending) que es la identidad contable exacta.
  const previousPendingRaw = readCurrencyMetric(
    raw,
    "previousPending",
    "previous_pending"
  );
  const previousPending =
    previousPendingRaw !== null
      ? Math.max(0, previousPendingRaw)
      : Math.max(0, pendingAtCutoff - totalPending);

  /**
   * Derived residual portfolio resolution amount.
   *
   * This is NOT a direct sum of receipts.
   * Formula: gross issued - credit notes - pending balance
   *
   * Used to reconcile Zeta AR snapshots consistently.
   * It can include cash collections, credit-note compensation,
   * adjustments, overpayments, or other Zeta-side settlement effects.
   */
  const portfolioResolvedAmount = Math.max(
    0,
    issuedInPeriod - creditNoteAmount - pendingAtCutoff
  );
  const appliedCollectionsAtCutoff =
    appliedCollectionsAtCutoffRaw !== null && appliedCollectionsAtCutoffRaw >= 0
      ? appliedCollectionsAtCutoffRaw
      : portfolioResolvedAmount;
  const appliedCollectionRateRaw = readCurrencyMetric(
    raw,
    "appliedCollectionRate",
    "applied_collection_rate"
  );
  const appliedCollectionRate =
    appliedCollectionRateRaw !== null
      ? Math.max(0, Math.min(1, appliedCollectionRateRaw))
      : issuedInPeriodNet > 0
        ? Math.max(0, Math.min(1, appliedCollectionsAtCutoff / issuedInPeriodNet))
        : null;

  return {
    currencyCode: code,
    totalInvoiced,
    totalPending,
    totalCollected,
    appliedCollectionsAtCutoff,
    registeredCollectionsInPeriod,
    appliedCollectionRate,
    invoiceCount: Math.max(0, Math.trunc(invoiceCount)),
    pendingInvoiceCount: Math.max(0, Math.trunc(pendingInvoiceCount)),
    collectionEffectiveness,
    issuedInPeriod,
    pendingAtCutoff,
    previousPending,
    collectedInPeriod,
    collectedReceiptCount: Math.max(0, Math.trunc(collectedReceiptCount)),
    registeredReceiptCount: Math.max(0, Math.trunc(registeredReceiptCount)),
    openingBalance,
    creditNoteCount,
    creditNoteAmount,
    issuedInPeriodNet,
    portfolioResolvedAmount,
  };
}

/**
 * Indexa `report.currencies` (sea array o objeto) por código de moneda. Las
 * cards llaman `index.get("USD")` / `index.get("UYU")` sin importarles la
 * estructura original.
 *
 * El parámetro acepta `unknown` a propósito: el shape del reporte puede
 * romperse silenciosamente por un cambio de motor o por una serialización
 * intermedia inesperada; el helper degrada a `Map` vacío sin lanzar.
 */
export function buildCurrencyIndex(
  currencies: unknown
): Map<ReconciliationCurrencyCode, NormalizedCurrencyMetrics> {
  const out = new Map<ReconciliationCurrencyCode, NormalizedCurrencyMetrics>();
  if (!currencies) return out;

  if (Array.isArray(currencies)) {
    for (const item of currencies) {
      if (!item || typeof item !== "object") continue;
      const norm = normalizeBucket(item as AnyRecord);
      if (norm) out.set(norm.currencyCode, norm);
    }
    return out;
  }

  if (typeof currencies === "object") {
    // Objeto indexado: { USD: {...}, UYU: {...} }.
    const obj = currencies as AnyRecord;
    for (const code of VALID_CODES) {
      const direct = obj[code];
      const fallback = obj[code.toLowerCase()];
      const candidate = direct ?? fallback;
      if (!candidate || typeof candidate !== "object") continue;
      const norm = normalizeBucket(candidate as AnyRecord, code);
      if (norm) out.set(code, norm);
    }
  }

  return out;
}

/**
 * Atajo para las cards: dado el report y un código, devuelve el bucket
 * normalizado o `null`. Encapsula la doble indexación y evita repetir el
 * pattern `buildCurrencyIndex(report.currencies).get(code) ?? null` en cada
 * card.
 *
 * Notar que no se memoiza: los componentes consumidores ya envuelven el
 * cálculo dentro de un `useMemo` por `report`.
 */
export function findCurrencyMetrics(
  report: { currencies: unknown },
  code: ReconciliationCurrencyCode
): NormalizedCurrencyMetrics | null {
  return buildCurrencyIndex(report.currencies).get(code) ?? null;
}
