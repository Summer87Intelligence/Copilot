/**
 * COLLECTION AGING MODEL — modelo único de clasificación de cobranza por
 * antigüedad desde la fecha de factura (`issue_date`).
 *
 * Decisión de negocio (COLLECTION-AGING-MODEL-IMPLEMENTATION-001):
 *  - El día de emisión es el día 0.
 *  - 0 a 7 días   → NO ATRASADO        (`not_overdue`).
 *  - 8 a 14 días  → ATRASADO LEVE      (`overdue_8_14`).
 *  - 15 a 30 días → ATRASADO MEDIO     (`overdue_15_30`).
 *  - 31+ días     → ATRASADO GRAVE     (`overdue_30_plus`).
 *  - El atraso empieza en el día 8 (≤ 7 días todavía está dentro de plazo).
 *  - Si un cliente tiene varias facturas, toma el PEOR estado (máx. días).
 *  - "Pendiente" = toda deuda abierta. "Atrasado" = deuda abierta con > 7 días.
 *
 * Fuente temporal: SIEMPRE `issue_date`. No se usa `due_date` (hoy sintético
 * en facturas Zeta — ver DIV-CONT-001). Función pura, sin I/O ni estado.
 *
 * Convención de fechas: se mide en días enteros usando mediodía UTC (12:00Z)
 * para evitar saltos por DST/zona horaria, igual que `copilot-client-debt-status`.
 */

import {
  formatYmdMontevideo,
  todayYmdMontevideo,
} from "@/lib/date/summer87-today";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type CollectionAgingBucket =
  | "not_overdue"
  | "overdue_8_14"
  | "overdue_15_30"
  | "overdue_30_plus";

export type CollectionAgingTone = "neutral" | "success" | "warning" | "danger";

export type CollectionAgingClassification = {
  bucket: CollectionAgingBucket;
  /** Label largo para títulos/badges (p. ej. "Atrasado 8–14 días"). */
  label: string;
  /** Label corto para chips/columnas compactas (p. ej. "8–14 días"). */
  shortLabel: string;
  tone: CollectionAgingTone;
  /** Días enteros desde emisión, nunca negativo (futuro/sin fecha ⇒ 0). */
  daysSinceIssue: number;
  /** true para cualquier bucket distinto de `not_overdue` (> 7 días). */
  isOverdue: boolean;
  /** Severidad ascendente: 0 = no atrasado … 3 = +30 días. Ordenar peor-primero ⇒ desc. */
  sortRank: number;
};

// ---------------------------------------------------------------------------
// Tabla canónica de buckets (única fuente de labels / tonos / rangos)
// ---------------------------------------------------------------------------

type BucketSpec = {
  bucket: CollectionAgingBucket;
  label: string;
  shortLabel: string;
  tone: CollectionAgingTone;
  sortRank: number;
};

/** Umbrales inclusivos en días desde emisión. */
export const COLLECTION_AGING_THRESHOLDS = {
  /** ≤ 7 días: dentro de plazo. */
  notOverdueMaxDays: 7,
  /** 8–14 días: atraso leve. */
  light: { minDays: 8, maxDays: 14 },
  /** 15–30 días: atraso medio. */
  medium: { minDays: 15, maxDays: 30 },
  /** > 30 días: atraso grave. */
  strongMinDays: 31,
} as const;

export const COLLECTION_AGING_BUCKETS: Record<CollectionAgingBucket, BucketSpec> = {
  not_overdue: {
    bucket: "not_overdue",
    label: "No atrasado",
    shortLabel: "No atrasado",
    tone: "neutral",
    sortRank: 0,
  },
  overdue_8_14: {
    bucket: "overdue_8_14",
    label: "Atrasado 8–14 días",
    shortLabel: "8–14 días",
    tone: "success",
    sortRank: 1,
  },
  overdue_15_30: {
    bucket: "overdue_15_30",
    label: "Atrasado 15–30 días",
    shortLabel: "15–30 días",
    tone: "warning",
    sortRank: 2,
  },
  overdue_30_plus: {
    bucket: "overdue_30_plus",
    label: "Atrasado +30 días",
    shortLabel: "+30 días",
    tone: "danger",
    sortRank: 3,
  },
};

/** Orden de presentación canónico (de no atrasado a más grave). */
export const COLLECTION_AGING_BUCKET_ORDER: readonly CollectionAgingBucket[] = [
  "not_overdue",
  "overdue_8_14",
  "overdue_15_30",
  "overdue_30_plus",
];

// ---------------------------------------------------------------------------
// Utilidades de fecha (puras)
// ---------------------------------------------------------------------------

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/**
 * Normaliza una entrada de fecha a `YYYY-MM-DD`.
 *  - `string`: se toma el prefijo de 10 chars (acepta ISO con hora).
 *  - `Date`: se proyecta a la fecha local de Montevideo (regla de negocio).
 * Devuelve `null` si no es parseable.
 */
function toYmd(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return formatYmdMontevideo(value);
  }
  const s = String(value).trim();
  const candidate = s.length >= 10 ? s.slice(0, 10) : s;
  return YMD_RE.test(candidate) ? candidate : null;
}

/** Convierte `YYYY-MM-DD` a ms UTC al mediodía (evita DST). null si inválido. */
function ymdToUtcNoonMs(ymd: string): number | null {
  const ms = Date.parse(`${ymd}T12:00:00.000Z`);
  return Number.isFinite(ms) ? ms : null;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Días enteros transcurridos desde `issueDate` hasta `referenceDate`
 * (default: hoy en Montevideo). El día de emisión es el día 0.
 *
 * Devuelve `NaN` si `issueDate` no es parseable. Puede ser negativo si la
 * fecha de emisión es futura (los consumidores deben tratarlo como 0).
 */
export function getDaysSinceIssue(
  issueDate: string | Date,
  referenceDate?: string | Date
): number {
  const issueYmd = toYmd(issueDate);
  if (issueYmd === null) return Number.NaN;

  const refYmd = toYmd(referenceDate ?? todayYmdMontevideo());
  if (refYmd === null) return Number.NaN;

  const issueMs = ymdToUtcNoonMs(issueYmd);
  const refMs = ymdToUtcNoonMs(refYmd);
  if (issueMs === null || refMs === null) return Number.NaN;

  return Math.floor((refMs - issueMs) / DAY_MS);
}

/** Convierte días desde emisión al bucket canónico. */
function bucketForDays(daysSinceIssue: number): CollectionAgingBucket {
  if (daysSinceIssue <= COLLECTION_AGING_THRESHOLDS.notOverdueMaxDays) {
    return "not_overdue";
  }
  if (daysSinceIssue <= COLLECTION_AGING_THRESHOLDS.light.maxDays) {
    return "overdue_8_14";
  }
  if (daysSinceIssue <= COLLECTION_AGING_THRESHOLDS.medium.maxDays) {
    return "overdue_15_30";
  }
  return "overdue_30_plus";
}

function buildClassification(daysSinceIssue: number): CollectionAgingClassification {
  // Fechas inválidas (NaN) o futuras (negativas) ⇒ tratamos como 0 días (no atrasado).
  const safeDays =
    Number.isFinite(daysSinceIssue) && daysSinceIssue > 0
      ? Math.floor(daysSinceIssue)
      : 0;
  const spec = COLLECTION_AGING_BUCKETS[bucketForDays(safeDays)];
  return {
    bucket: spec.bucket,
    label: spec.label,
    shortLabel: spec.shortLabel,
    tone: spec.tone,
    daysSinceIssue: safeDays,
    isOverdue: spec.bucket !== "not_overdue",
    sortRank: spec.sortRank,
  };
}

/**
 * Clasifica una factura por su fecha de emisión.
 * `referenceDate` default: hoy en Montevideo.
 */
export function classifyInvoiceByIssueDate(
  issueDate: string | Date,
  referenceDate?: string | Date
): CollectionAgingClassification {
  return buildClassification(getDaysSinceIssue(issueDate, referenceDate));
}

/** true si la factura está atrasada bajo el modelo (> 7 días desde emisión). */
export function isInvoiceOverdueByCollectionModel(
  issueDate: string | Date,
  referenceDate?: string | Date
): boolean {
  return classifyInvoiceByIssueDate(issueDate, referenceDate).isOverdue;
}

export type CollectionAgingInvoiceInput = {
  issue_date?: string | null;
  issueDate?: string | null;
  /** Saldo pendiente. Si se informa y es ≤ 0, la factura se ignora (no abierta). */
  pendingAmount?: number | null;
};

function readIssueDate(inv: CollectionAgingInvoiceInput): string | null {
  return inv.issue_date ?? inv.issueDate ?? null;
}

/**
 * Clasifica un cliente por la PEOR de sus facturas abiertas (máx. días desde
 * emisión). Solo cuentan facturas con `pendingAmount > 0`; si `pendingAmount`
 * no se informa, la factura se considera abierta.
 *
 * Sin facturas abiertas ⇒ `not_overdue` con 0 días.
 */
export function classifyClientByWorstInvoice(
  invoices: ReadonlyArray<CollectionAgingInvoiceInput>,
  referenceDate?: string | Date
): CollectionAgingClassification {
  let worstDays = 0;
  let hasOpenInvoice = false;

  for (const inv of invoices ?? []) {
    if (inv.pendingAmount != null && !(inv.pendingAmount > 0)) continue;
    hasOpenInvoice = true;
    const issue = readIssueDate(inv);
    if (issue == null) continue;
    const days = getDaysSinceIssue(issue, referenceDate);
    if (Number.isFinite(days) && days > worstDays) worstDays = days;
  }

  // Sin facturas abiertas: no atrasado por definición.
  if (!hasOpenInvoice) return buildClassification(0);
  return buildClassification(worstDays);
}

/** Default para scripts Node (`tsx`/`.mjs`): named ESM no se re-exporta desde `.ts`. */
const collectionAgingModelDefault = {
  COLLECTION_AGING_BUCKETS,
  COLLECTION_AGING_BUCKET_ORDER,
  COLLECTION_AGING_THRESHOLDS,
  getDaysSinceIssue,
  classifyInvoiceByIssueDate,
  classifyClientByWorstInvoice,
  isInvoiceOverdueByCollectionModel,
};
export default collectionAgingModelDefault;
