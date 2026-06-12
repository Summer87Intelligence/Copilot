/**
 * COPILOT RISK ENGINE — fuente única de verdad para estados/severidades.
 *
 * Resuelve la inconsistencia entre módulos: misma data ⇒ mismo veredicto en
 *   Hoy · Dashboard · Finanzas · Clientes · Alertas.
 *
 * Diseño:
 *  - Una sola función `deriveRiskStatus(input)` produce un `RiskStatus` global.
 *  - Para vista detallada el motor expone `derivePriorityForClient(...)` y
 *    `coverageBand(...)`. Esos selectores son determinísticos y leen los mismos
 *    thresholds que `deriveRiskStatus`.
 *  - Sin LLM, sin I/O, sin React.
 *
 * Thresholds (documentados, ajustables sólo aquí):
 *  - Coverage crítico: ratio caja/expected outflows < 0.50
 *  - Coverage atención: ratio < 1.00
 *  - High-risk clients críticos: ≥ 3
 *  - Atención por high-risk: ≥ 1
 *  - Atención por overdue: ≥ 1 cliente con vencido > 0
 *
 * No depende de `copilot-today-business-pulse.ts`; al revés, ese módulo
 * delega aquí a través de `deriveRiskStatus`.
 */

import type { FinancialRiskBand } from "@/lib/copilot-business-language";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

/** Estado global del negocio que renderiza el cockpit. */
export type RiskStatus = "healthy" | "attention" | "critical";

/** Severidad operativa por cliente / tarea. */
export type RiskPriority = "critical" | "high" | "medium" | "low";

/** Banda de cobertura financiera caja/pagos. */
export type CoverageBand = "comfortable" | "adjusted" | "critical";

/** Insumos compartidos por todos los módulos. */
export type RiskEngineInput = {
  /** Lectura del motor financiero (FinancialSnapshotApiV1). */
  riskBand: FinancialRiskBand;
  /** Ratio caja / expected outflows. 0 = sin datos suficientes. */
  coverageRatio: number;
  /** Conteo de clientes marcados como Alto riesgo en el portfolio. */
  highRiskClientCount: number;
  /** Conteo de clientes con overdue_debt > 0 en el portfolio. */
  overdueClientCount: number;
};

export type RiskEngineOutput = {
  /** Estado global. */
  status: RiskStatus;
  /** Banda de cobertura derivada del ratio. */
  coverage: CoverageBand;
  /** Razones (códigos) que dispararon la clasificación. */
  reasons: RiskReasonCode[];
};

export type RiskReasonCode =
  | "risk_band_critical"
  | "risk_band_high"
  | "coverage_critical"
  | "coverage_low"
  | "high_risk_clients_critical"
  | "high_risk_clients_attention"
  | "overdue_clients";

// ---------------------------------------------------------------------------
// Thresholds — punto único de ajuste
// ---------------------------------------------------------------------------

export const RISK_ENGINE_THRESHOLDS = {
  coverage: {
    /** Por debajo de este ratio se considera crítico. */
    critical: 0.5,
    /** Por debajo de este ratio (y por arriba de critical) se considera atención. */
    low: 1.0,
  },
  highRiskClients: {
    /** A partir de este conteo se dispara crítico. */
    critical: 3,
    /** A partir de este conteo se dispara atención. */
    attention: 1,
  },
  overdue: {
    /** A partir de este conteo de clientes con vencido > 0 se dispara atención. */
    attention: 1,
  },
} as const;

// ---------------------------------------------------------------------------
// Núcleo determinístico
// ---------------------------------------------------------------------------

export function deriveRiskStatus(input: RiskEngineInput): RiskEngineOutput {
  const reasons: RiskReasonCode[] = [];
  const coverage = coverageBand(input.coverageRatio);
  // Sin datos suficientes para evaluar cobertura. No dispara atención.
  const hasCoverageData = Number.isFinite(input.coverageRatio) && input.coverageRatio > 0;

  // Crítico — cualquiera de las siguientes
  if (input.riskBand === "critical") reasons.push("risk_band_critical");
  if (hasCoverageData && coverage === "critical") reasons.push("coverage_critical");
  if (input.highRiskClientCount >= RISK_ENGINE_THRESHOLDS.highRiskClients.critical) {
    reasons.push("high_risk_clients_critical");
  }
  const isCritical = reasons.some((r) =>
    r === "risk_band_critical" || r === "coverage_critical" || r === "high_risk_clients_critical"
  );
  if (isCritical) return { status: "critical", coverage, reasons };

  // Atención
  if (input.riskBand === "high") reasons.push("risk_band_high");
  if (hasCoverageData && coverage === "adjusted") reasons.push("coverage_low");
  if (input.highRiskClientCount >= RISK_ENGINE_THRESHOLDS.highRiskClients.attention) {
    reasons.push("high_risk_clients_attention");
  }
  if (input.overdueClientCount >= RISK_ENGINE_THRESHOLDS.overdue.attention) {
    reasons.push("overdue_clients");
  }
  const isAttention = reasons.length > 0;
  if (isAttention) return { status: "attention", coverage, reasons };

  return { status: "healthy", coverage, reasons };
}

// ---------------------------------------------------------------------------
// Selectors auxiliares
// ---------------------------------------------------------------------------

export function coverageBand(ratio: number): CoverageBand {
  if (!Number.isFinite(ratio) || ratio <= 0) return "adjusted";
  if (ratio < RISK_ENGINE_THRESHOLDS.coverage.critical) return "critical";
  if (ratio < RISK_ENGINE_THRESHOLDS.coverage.low) return "adjusted";
  return "comfortable";
}

/**
 * Severidad operativa de un cliente a partir de su exposición.
 * - Críticos: high-risk + vencido alto, o muy vencido (>=60 días).
 * - Altos: vencido > 0 o riesgo Alto.
 * - Medios: derived_from_debt o cobro lento.
 * - Bajos: el resto.
 */
export function derivePriorityForClient(input: {
  riskLevel: "Alto" | "Medio" | "Bajo" | string | null | undefined;
  overdueDays: number;
  hasOverdueDebt: boolean;
  derivedFromDebt: boolean;
}): RiskPriority {
  if (input.overdueDays >= 60 || (input.riskLevel === "Alto" && input.hasOverdueDebt)) {
    return "critical";
  }
  if (input.hasOverdueDebt || input.riskLevel === "Alto") return "high";
  if (input.derivedFromDebt) return "medium";
  return "low";
}
