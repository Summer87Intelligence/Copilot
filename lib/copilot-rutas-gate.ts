export type RutasGateMeta = {
  validation_report: unknown;
  confidence: "high" | "medium" | "low";
  coverage: "full" | "partial" | "insufficient";
  blocked_reasons: string[];
  recommendations_enabled: boolean;
};

export function toRutasGateMeta(input: unknown): RutasGateMeta {
  const o = (input ?? {}) as Record<string, unknown>;
  const confidence =
    o.confidence === "high" || o.confidence === "medium" || o.confidence === "low"
      ? o.confidence
      : "low";
  const coverage =
    o.coverage === "full" || o.coverage === "partial" || o.coverage === "insufficient"
      ? o.coverage
      : "insufficient";
  const blocked_reasons = Array.isArray(o.blocked_reasons)
    ? o.blocked_reasons.filter((x): x is string => typeof x === "string")
    : [];
  const recommendations_enabled = o.recommendations_enabled === true;
  return {
    validation_report: o.validation_report ?? null,
    confidence,
    coverage,
    blocked_reasons,
    recommendations_enabled,
  };
}
