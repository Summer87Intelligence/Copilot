/**
 * AI-01 — Contrato estable de briefing para LLM (sin payloads crudos de proveedor).
 */

export type CopilotBriefingCoverage = "full" | "partial" | "insufficient";

/** Fuente interna usada para armar el briefing (trazabilidad). */
export type CopilotBriefingSourceRef = {
  id: string;
  label: string;
  /** Instantáneo de ensamblado o del dato cuando existe. */
  asOfIso: string | null;
  coverage: CopilotBriefingCoverage;
  /** Nota técnica breve, no datos sensibles. */
  detail?: string;
};

export type CopilotLlmBriefingTrace = {
  assembledAtIso: string;
  tenantCompanyId: string;
  sources: CopilotBriefingSourceRef[];
  missingData: string[];
  cautelas: string[];
};

export type CopilotBriefingFact = {
  key: string;
  value: string;
};

export type CopilotBriefingSignal = {
  label: string;
  detail: string;
  /** Severidad UX, no scoring inventado. */
  tier: "info" | "watch" | "risk";
};

/** Entrada mínima del ensamblador (solo contexto ya autenticado en ruta). */
export type AssembleCopilotLlmBriefingInput = {
  tenantCompanyId: string;
  /** Etiqueta humana sin email (ej. nombre + rol). */
  operatorLabel: string;
  operatorRole: string;
};

/**
 * Salida estable para capa LLM / exportación.
 * No incluye DTOs externos ni shapes inestables.
 */
export type CopilotBriefingPipelineAction = {
  company: string;
  action_type: string;
  channel: string;
  execution_status: string;
  outcome_type: string | null;
  expected_excerpt: string | null;
};

export type CopilotLlmBriefingOutput = {
  summary: string;
  facts: CopilotBriefingFact[];
  signals: CopilotBriefingSignal[];
  recommendedFocus: string[];
  missingData: string[];
  trace: CopilotLlmBriefingTrace;
  /** Cobertura global del paquete (solo parcial o insuficiente en prototipo). */
  coverage: "partial" | "insufficient";
  recentPipelineActions: CopilotBriefingPipelineAction[];
  /** Framing corto para el modelo; evita prompts gigantes en código. */
  llmInstructions: string;
};

export const COPILOT_LLM_BRIEFING_FRAMING_ES =
  "Sos un asistente operativo de Summer87 Copilot. Usá únicamente el briefing estructurado. " +
  "No inventes cifras ni hechos ausentes. Si la cobertura es parcial o insuficiente, decilo al usuario. " +
  "No cites UUIDs ni payloads internos salvo que pidan trazabilidad técnica explícita.";
