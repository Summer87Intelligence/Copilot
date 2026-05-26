import type { CopilotAgentId, CopilotAgentStatus } from "./types";

export type AgentRegistryEntry = {
  id: CopilotAgentId;
  label: string;
  status: CopilotAgentStatus;
  description: string;
};

export const AGENT_REGISTRY: AgentRegistryEntry[] = [
  {
    id: "daily_executive",
    label: "Ejecutivo Diario",
    status: "active",
    description: "Resume el día y ordena prioridades.",
  },
  {
    id: "collection",
    label: "Cobranza",
    status: "active",
    description: "Ordena clientes por urgencia de cobro.",
  },
  {
    id: "treasury",
    label: "Tesorería",
    status: "active",
    description: "Revisa pagos, caja y compromisos para evitar sorpresas.",
  },
  {
    id: "data_integrity",
    label: "Integridad de datos",
    status: "active",
    description: "Explica si los datos están actualizados y si hay problemas externos o de sincronización.",
  },
  {
    id: "cfo",
    label: "CFO / Finanzas",
    status: "active",
    description: "Detecta riesgo de liquidez, cartera vencida y compromisos de pago.",
  },
  {
    id: "alerts",
    label: "Alertas",
    status: "coming_soon",
    description: "Prioriza alertas relevantes.",
  },
  {
    id: "risk",
    label: "Riesgo",
    status: "coming_soon",
    description: "Detecta riesgos antes de que escalen.",
  },
];

export const ACTIVE_AGENTS = AGENT_REGISTRY.filter((a) => a.status === "active");
export const COMING_SOON_AGENTS = AGENT_REGISTRY.filter((a) => a.status === "coming_soon");
