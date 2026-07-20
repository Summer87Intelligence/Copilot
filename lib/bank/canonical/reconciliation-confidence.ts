/**
 * FASE BANK-RECONCILIATION-CANONICAL-ENGINE-001 — traduce el `recommended_action`
 * + `confidence` (0-100) del motor D a las 4 etiquetas humanas que pide el negocio
 * (Alta/Media/Baja/Sin sugerencia). Nunca expone el número crudo como "precisión"
 * en la UI operativa — el número interno se puede seguir usando para ordenar.
 */

import type { RecommendedAction } from "@/lib/bank/intelligence/reconciliation-matching";

export type HumanConfidenceLevel = "alta" | "media" | "baja" | "sin_sugerencia";

export const HUMAN_CONFIDENCE_LABELS: Record<HumanConfidenceLevel, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
  sin_sugerencia: "Sin sugerencia",
};

/**
 * Deriva la etiqueta humana desde `recommended_action` (fuente primaria: refleja
 * las guardas del motor — empate, moneda, recibo usado, etc. — no solo el score).
 * `UNIDENTIFIED`/`REJECT` siempre son "Sin sugerencia"; `REVIEW` se separa en
 * media/baja según el score para no aplanar toda la zona gris a un solo nivel.
 */
export function humanConfidenceFromRecommendedAction(
  recommendedAction: RecommendedAction,
  confidence: number
): HumanConfidenceLevel {
  switch (recommendedAction) {
    case "AUTO_RECONCILE_CANDIDATE":
      return "alta";
    case "REVIEW":
      return confidence >= 55 ? "media" : "baja";
    case "UNIDENTIFIED":
    case "REJECT":
    default:
      return "sin_sugerencia";
  }
}

export function humanConfidenceLabel(level: HumanConfidenceLevel): string {
  return HUMAN_CONFIDENCE_LABELS[level];
}
