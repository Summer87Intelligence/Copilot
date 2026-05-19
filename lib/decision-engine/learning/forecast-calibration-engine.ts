/**
 * Phase 5D — Forecast Calibration Engine.
 * Cruza PredictiveSnapshot.recovery_likelihoods con DERecentReceipt (30d).
 * Puro: sin imports de DB, sin side effects.
 */

import type { DERecentReceipt } from "@/lib/decision-engine/de-types";
import type { RecoveryLikelihood, RecoveryLikelihoodBand } from "@/lib/decision-engine/predictive/predictive-types";
import type {
  ForecastCalibrationDirection,
  ForecastCalibrationSegment,
  ForecastCalibrationSnapshot,
  StrategicLearningContext,
} from "./learning-types";

const RECEIPT_LOOKBACK_DAYS = 30;
const MIN_SAMPLE_FOR_SCORE = 3;

// Midpoint predicted probability per band
const BAND_PREDICTED_PCT: Record<RecoveryLikelihoodBand, number> = {
  high:     75,
  medium:   50,
  low:      25,
  very_low: 10,
};

const BAND_LABELS: Record<RecoveryLikelihoodBand, string> = {
  high:     "Alta probabilidad",
  medium:   "Probabilidad media",
  low:      "Probabilidad baja",
  very_low: "Muy baja probabilidad",
};

function daysBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000;
}

function hasRecentReceipt(
  customerId: string,
  receipts: DERecentReceipt[],
  nowIso: string
): boolean {
  return receipts.some(
    (r) =>
      r.company_id === customerId &&
      daysBetween(r.receipt_date, nowIso) >= 0 &&
      daysBetween(r.receipt_date, nowIso) <= RECEIPT_LOOKBACK_DAYS
  );
}

function directionFor(delta: number): ForecastCalibrationDirection {
  if (delta > 5)  return "underestimated";
  if (delta < -5) return "overestimated";
  return "accurate";
}

function computeSegments(
  likelihoods: RecoveryLikelihood[],
  receipts: DERecentReceipt[],
  nowIso: string
): ForecastCalibrationSegment[] {
  const bands: RecoveryLikelihoodBand[] = ["high", "medium", "low", "very_low"];
  const segments: ForecastCalibrationSegment[] = [];

  for (const band of bands) {
    const inBand = likelihoods.filter((l) => l.band === band);
    if (inBand.length === 0) continue;

    const paidCount = inBand.filter((l) =>
      hasRecentReceipt(l.customer_id, receipts, nowIso)
    ).length;

    const predicted = BAND_PREDICTED_PCT[band];
    const actual    = inBand.length > 0
      ? Math.round((paidCount / inBand.length) * 100)
      : 0;
    const delta     = actual - predicted;

    segments.push({
      segment:     BAND_LABELS[band],
      predicted_pct: predicted,
      actual_pct:    actual,
      delta_pct:     delta,
      direction:     directionFor(delta),
      sample_size:   inBand.length,
    });
  }

  return segments;
}

function calibrationScore(segments: ForecastCalibrationSegment[]): number {
  const usable = segments.filter((s) => s.sample_size >= MIN_SAMPLE_FOR_SCORE);
  if (usable.length === 0) return 50; // neutral when no data
  const avgAbsDelta =
    usable.reduce((s, seg) => s + Math.abs(seg.delta_pct), 0) / usable.length;
  return Math.max(0, Math.round(100 - avgAbsDelta));
}

function buildWeightAdjustments(
  segments: ForecastCalibrationSegment[]
): string[] {
  const adjustments: string[] = [];
  for (const seg of segments) {
    if (seg.sample_size < MIN_SAMPLE_FOR_SCORE) continue;
    if (seg.direction === "overestimated" && Math.abs(seg.delta_pct) >= 10) {
      adjustments.push(
        `Reducir peso del segmento "${seg.segment}" — sobreestimado por ${Math.abs(seg.delta_pct)}pp.`
      );
    } else if (seg.direction === "underestimated" && Math.abs(seg.delta_pct) >= 10) {
      adjustments.push(
        `Aumentar peso del segmento "${seg.segment}" — subestimado por ${seg.delta_pct}pp.`
      );
    }
  }
  return adjustments;
}

function buildInsight(
  score: number,
  segments: ForecastCalibrationSegment[],
  dataSource: ForecastCalibrationSnapshot["data_source"]
): string {
  if (dataSource === "insufficient") {
    return "Datos insuficientes para calibrar el modelo predictivo.";
  }
  if (score >= 80) {
    return `Modelo bien calibrado (score ${score}/100). Las predicciones son confiables.`;
  }
  if (score >= 60) {
    return `Calibración moderada (score ${score}/100). Revisar segmentos con mayor desviación.`;
  }
  const worst = [...segments].sort(
    (a, b) => Math.abs(b.delta_pct) - Math.abs(a.delta_pct)
  )[0];
  return (
    `Calibración baja (score ${score}/100). ` +
    (worst
      ? `Mayor desviación en "${worst.segment}": ${worst.delta_pct > 0 ? "+" : ""}${worst.delta_pct}pp.`
      : "")
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function computeForecastCalibration(
  context: StrategicLearningContext
): ForecastCalibrationSnapshot {
  const { predictive, bundle } = context;
  const nowIso = context.loadedAt;

  if (!predictive || predictive.recovery_likelihoods.length === 0) {
    return {
      generated_at:               nowIso,
      calibration_score:          50,
      overestimated_segments:     [],
      underestimated_segments:    [],
      all_segments:               [],
      recommended_weight_adjustments: [],
      insight:                    "Sin datos predictivos para calibrar.",
      data_source:                "insufficient",
    };
  }

  const segments = computeSegments(
    predictive.recovery_likelihoods,
    bundle.recentReceipts,
    nowIso
  );

  const usableSegments = segments.filter((s) => s.sample_size >= MIN_SAMPLE_FOR_SCORE);
  const dataSource: ForecastCalibrationSnapshot["data_source"] =
    usableSegments.length === 0
      ? "insufficient"
      : usableSegments.length < segments.length
      ? "partial"
      : "full";

  const score = calibrationScore(segments);

  return {
    generated_at:            nowIso,
    calibration_score:       score,
    overestimated_segments:  segments.filter((s) => s.direction === "overestimated"),
    underestimated_segments: segments.filter((s) => s.direction === "underestimated"),
    all_segments:            segments,
    recommended_weight_adjustments: buildWeightAdjustments(segments),
    insight:  buildInsight(score, segments, dataSource),
    data_source: dataSource,
  };
}
