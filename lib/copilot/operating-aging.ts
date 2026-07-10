/**
 * OPERATING AGING — buckets de atraso para UI operativa del Copilot.
 *
 * Mide días de atraso desde `due_date` (fecha de vencimiento del documento).
 * Fuente recomendada para Cliente 360 y nuevas pantallas operativas.
 *
 * No reemplaza `collection-aging-model` (issue_date, cobranza Cartera) ni
 * `copilot-installment-aging` (buckets contables 0–30 / 31–60 / 61–90 / 90+).
 *
 * Ver: docs/product/copilot-operating-language.md
 */

import {
  formatYmdMontevideo,
  todayYmdMontevideo,
} from "@/lib/date/summer87-today";

export type OperatingDelayBucket =
  | "on_time"
  | "late_1_7"
  | "late_8_14"
  | "late_15_30"
  | "late_30_plus";

export type OperatingDelayClassification = {
  bucket: OperatingDelayBucket;
  /** Días enteros de atraso (0 = al día; negativo = aún no vence). */
  daysLate: number;
  label: string;
  shortLabel: string;
  isLate: boolean;
};

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

type BucketSpec = {
  bucket: OperatingDelayBucket;
  label: string;
  shortLabel: string;
};

export const OPERATING_DELAY_BUCKETS: Record<OperatingDelayBucket, BucketSpec> = {
  on_time: {
    bucket: "on_time",
    label: "Al día",
    shortLabel: "Al día",
  },
  late_1_7: {
    bucket: "late_1_7",
    label: "1–7 días de atraso",
    shortLabel: "1–7 días",
  },
  late_8_14: {
    bucket: "late_8_14",
    label: "8–14 días de atraso",
    shortLabel: "8–14 días",
  },
  late_15_30: {
    bucket: "late_15_30",
    label: "15–30 días de atraso",
    shortLabel: "15–30 días",
  },
  late_30_plus: {
    bucket: "late_30_plus",
    label: "+30 días de atraso",
    shortLabel: "+30 días",
  },
};

export const OPERATING_DELAY_BUCKET_ORDER: readonly OperatingDelayBucket[] = [
  "on_time",
  "late_1_7",
  "late_8_14",
  "late_15_30",
  "late_30_plus",
];

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

function ymdToUtcNoonMs(ymd: string): number | null {
  const ms = Date.parse(`${ymd}T12:00:00.000Z`);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Días de atraso desde `dueDate` hasta `referenceDate` (default: hoy Montevideo).
 * 0 = vence hoy o ya al día · positivo = atraso · negativo = aún no vence.
 */
export function getDaysLate(
  dueDate: string | Date,
  referenceDate?: string | Date
): number {
  const dueYmd = toYmd(dueDate);
  if (dueYmd === null) return Number.NaN;

  const refYmd = toYmd(referenceDate ?? todayYmdMontevideo());
  if (refYmd === null) return Number.NaN;

  const dueMs = ymdToUtcNoonMs(dueYmd);
  const refMs = ymdToUtcNoonMs(refYmd);
  if (dueMs === null || refMs === null) return Number.NaN;

  return Math.floor((refMs - dueMs) / DAY_MS);
}

function bucketForDaysLate(daysLate: number): OperatingDelayBucket {
  if (!Number.isFinite(daysLate) || daysLate <= 0) return "on_time";
  if (daysLate <= 7) return "late_1_7";
  if (daysLate <= 14) return "late_8_14";
  if (daysLate <= 30) return "late_15_30";
  return "late_30_plus";
}

export function getOperatingDelayBucket(daysLate: number): OperatingDelayBucket {
  return bucketForDaysLate(daysLate);
}

export function formatOperatingDelayBucket(bucket: OperatingDelayBucket): string {
  return OPERATING_DELAY_BUCKETS[bucket].label;
}

export function getOperatingDelayLabel(daysLate: number): string {
  return formatOperatingDelayBucket(getOperatingDelayBucket(daysLate));
}

export function classifyOperatingDelay(
  dueDate: string | Date,
  referenceDate?: string | Date
): OperatingDelayClassification {
  const daysLate = getDaysLate(dueDate, referenceDate);
  const safeDays = Number.isFinite(daysLate) ? daysLate : 0;
  const bucket = bucketForDaysLate(safeDays);
  const spec = OPERATING_DELAY_BUCKETS[bucket];
  return {
    bucket,
    daysLate: safeDays,
    label: spec.label,
    shortLabel: spec.shortLabel,
    isLate: bucket !== "on_time",
  };
}
