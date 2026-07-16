/**
 * FASE 9E — Universo canónico de VENTAS EMITIDAS (fuente única compartida).
 *
 * Antes de esta capa, Ventas y Finanzas resolvían la moneda de forma distinta:
 *   - Ventas  (`buildCanonicalSaleDocuments`): `currency_code` → fallback al
 *     `MonedaCodigo` del payload Zeta (1 → UYU, 2 → USD).
 *   - Finanzas (`generateFinancialConsistencyReport`): SOLO `currency_code`;
 *     descartaba como "sin moneda" toda fila con `currency_code` nulo/vacío.
 *
 * Consecuencia real (tenant Summer87, julio 2026): 4 comprobantes CCV1 internos
 * de Zeta (`ZETA:CCV1:NOSER:…:701:…`, `CFETipo=0` con líneas de venta — caso
 * PRESTIS documentado en el clasificador) tienen `currency_code` nulo pero
 * `MonedaCodigo` presente. Ventas los contaba (correcto: son ventas válidas),
 * Finanzas los excluía. Divergencia UYU = $97.112 (3 docs) + $305 (1 doc).
 *
 * Estas funciones son la definición ÚNICA y reusable en Ventas, Finanzas, Hoy,
 * Dashboard, Cliente 360 y exportaciones. PURAS: no tocan DB ni inventan datos.
 */

import { isCreditNoteFromMetadata } from "@/lib/copilot-zeta-credit-note";

export type CanonicalSaleCurrency = "UYU" | "USD";

/** Estados que marcan un comprobante anulado (no cuenta como venta emitida). */
const VOIDED_STATUSES: ReadonlySet<string> = new Set([
  "void",
  "voided",
  "cancelled",
  "canceled",
  "anulada",
  "anulado",
  "annulled",
  "annul",
]);

export function isVoidedSaleStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return VOIDED_STATUSES.has(status.trim().toLowerCase());
}

/** Fila mínima con la que se puede resolver la moneda canónica de una venta. */
export type CurrencyResolvableSaleRow = {
  currency_code?: string | null;
  currency?: string | null;
  zeta_metadata?: unknown;
};

function readMonedaCodigo(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const v1 = (metadata as Record<string, unknown>).zeta_customer_voucher_v1;
  if (!v1 || typeof v1 !== "object" || Array.isArray(v1)) return null;
  const payload = (v1 as Record<string, unknown>).raw_payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const mc = (payload as Record<string, unknown>).MonedaCodigo;
  if (mc == null) return null;
  const s = typeof mc === "string" ? mc.trim() : String(mc).trim();
  return s || null;
}

/**
 * Moneda canónica de un comprobante de venta.
 * Prioridad: código ISO (`currency_code` → `currency`) → `MonedaCodigo` Zeta.
 * Devuelve `null` cuando no se puede resolver a UYU/USD (moneda desconocida).
 */
export function resolveCanonicalSaleCurrency(
  row: CurrencyResolvableSaleRow
): CanonicalSaleCurrency | null {
  const iso = String(row.currency_code ?? row.currency ?? "").toUpperCase().trim();
  if (iso === "UYU" || iso === "USD") return iso;
  const mc = readMonedaCodigo(row.zeta_metadata);
  if (mc === "1") return "UYU";
  if (mc === "2") return "USD";
  return null;
}

function toAmount(v: number | string | null | undefined): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Fila mínima para clasificar como venta emitida válida. */
export type IssuedSaleRow = CurrencyResolvableSaleRow & {
  is_active?: boolean | null;
  status?: string | null;
  total_amount?: number | string | null;
  /** Opt-in: si el caller ya resolvió el flag NC. Si no, se deriva de metadata. */
  is_credit_note?: boolean;
};

/** `true` si la fila es una Nota de Crédito (flag explícito o CFE DGI en metadata). */
export function isCreditNoteSaleRow(row: IssuedSaleRow): boolean {
  if (row.is_credit_note === true) return true;
  return isCreditNoteFromMetadata(row.zeta_metadata);
}

export type IssuedSaleClassification = {
  /** Participa del universo de ventas emitidas (activa, no anulada, monto > 0, moneda resuelta). */
  include: boolean;
  currency: CanonicalSaleCurrency | null;
  isCreditNote: boolean;
  /** Total positivo del comprobante (encabezado). */
  total: number;
};

/**
 * Clasifica una fila para el universo canónico de ventas emitidas.
 *
 * Regla ÚNICA (Ventas === Finanzas):
 *   - excluye inactivas, anuladas, monto ≤ 0 o moneda no resoluble;
 *   - las NC participan del universo con `isCreditNote = true` (se restan del
 *     neto, no cuentan como factura positiva).
 */
export function classifyIssuedSaleRow(row: IssuedSaleRow): IssuedSaleClassification {
  const isCreditNote = isCreditNoteSaleRow(row);
  if (row.is_active === false || isVoidedSaleStatus(row.status)) {
    return { include: false, currency: null, isCreditNote, total: 0 };
  }
  const total = Math.round(Math.max(0, toAmount(row.total_amount)) * 100) / 100;
  if (!(total > 0)) {
    return { include: false, currency: null, isCreditNote, total: 0 };
  }
  const currency = resolveCanonicalSaleCurrency(row);
  if (currency === null) {
    return { include: false, currency: null, isCreditNote, total };
  }
  return { include: true, currency, isCreditNote, total };
}

/** `true` si la fila es una FACTURA de venta válida emitida (no NC, no anulada). */
export function isValidIssuedSaleRow(row: IssuedSaleRow): boolean {
  const c = classifyIssuedSaleRow(row);
  return c.include && !c.isCreditNote;
}

export type NetByCurrency = { UYU: number; USD: number };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Neto emitido por moneda = Σ(facturas válidas) − Σ(NC) sobre `rows`.
 * Definición canónica reusable para verificar paridad Ventas/Finanzas.
 * El caller debe pasar filas YA filtradas por período y deduplicadas.
 */
export function netIssuedByCurrency(rows: readonly IssuedSaleRow[]): NetByCurrency {
  const gross: NetByCurrency = { UYU: 0, USD: 0 };
  const credit: NetByCurrency = { UYU: 0, USD: 0 };
  for (const row of rows) {
    const c = classifyIssuedSaleRow(row);
    if (!c.include || c.currency === null) continue;
    if (c.isCreditNote) credit[c.currency] += c.total;
    else gross[c.currency] += c.total;
  }
  return {
    UYU: round2(gross.UYU - credit.UYU),
    USD: round2(gross.USD - credit.USD),
  };
}
