/**
 * Tipos canónicos para el sistema de Agentes IA coordinados.
 * Sin LLM, sin ejecución automática, solo lectura + priorización.
 */

export type CopilotAgentId =
  | "daily_executive"
  | "collection"
  | "treasury"
  | "data_integrity"
  | "cfo"
  | "client"
  | "alerts"
  | "risk";

export type CopilotAgentStatus = "active" | "coming_soon" | "disabled";

export type AgentSeverity = "critical" | "high" | "medium" | "low";

// ─── Priority ────────────────────────────────────────────────────────────────

export type CopilotAgentPriority = {
  id: string;
  agentId: CopilotAgentId;
  title: string;
  reason: string;
  severity: AgentSeverity;
  amount?: number;
  currency?: "UYU" | "USD";
  href: string;
  ctaLabel: string;
};

// ─── Brief por agente ─────────────────────────────────────────────────────────

export type CopilotAgentBrief = {
  agentId: CopilotAgentId;
  title: string;
  status: "stable" | "attention" | "critical";
  summary: string;
  priorities: CopilotAgentPriority[];
  nextBestAction?: {
    label: string;
    href: string;
  };
};

// ─── Resultado de la orquestación ─────────────────────────────────────────────

export type CopilotAgentsOrchestration = {
  status: "stable" | "attention" | "critical";
  summary: string;
  topPriorities: CopilotAgentPriority[];
  agentBriefs: CopilotAgentBrief[];
  nextBestAction: {
    label: string;
    href: string;
  };
};
