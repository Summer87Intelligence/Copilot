import { describe, it, expect } from "vitest";

import { humanConfidenceFromRecommendedAction, humanConfidenceLabel } from "@/lib/bank/canonical/reconciliation-confidence";

describe("humanConfidenceFromRecommendedAction — traduce el motor a las 4 etiquetas de negocio", () => {
  it("AUTO_RECONCILE_CANDIDATE siempre es Alta, sin importar el score", () => {
    expect(humanConfidenceFromRecommendedAction("AUTO_RECONCILE_CANDIDATE", 60)).toBe("alta");
    expect(humanConfidenceFromRecommendedAction("AUTO_RECONCILE_CANDIDATE", 99)).toBe("alta");
  });

  it("REVIEW se separa en media/baja según el score (no aplana toda la zona gris)", () => {
    expect(humanConfidenceFromRecommendedAction("REVIEW", 70)).toBe("media");
    expect(humanConfidenceFromRecommendedAction("REVIEW", 55)).toBe("media");
    expect(humanConfidenceFromRecommendedAction("REVIEW", 54)).toBe("baja");
    expect(humanConfidenceFromRecommendedAction("REVIEW", 10)).toBe("baja");
  });

  it("UNIDENTIFIED y REJECT siempre son 'Sin sugerencia', nunca un nivel de confianza falso", () => {
    expect(humanConfidenceFromRecommendedAction("UNIDENTIFIED", 40)).toBe("sin_sugerencia");
    expect(humanConfidenceFromRecommendedAction("REJECT", 40)).toBe("sin_sugerencia");
  });

  it("humanConfidenceLabel traduce cada nivel a la etiqueta exacta pedida por negocio", () => {
    expect(humanConfidenceLabel("alta")).toBe("Alta");
    expect(humanConfidenceLabel("media")).toBe("Media");
    expect(humanConfidenceLabel("baja")).toBe("Baja");
    expect(humanConfidenceLabel("sin_sugerencia")).toBe("Sin sugerencia");
  });
});
