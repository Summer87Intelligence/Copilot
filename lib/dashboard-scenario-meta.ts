import { dashboardScenarios } from "@/lib/dashboard-data";

export type ScenarioMeta = {
  label: string;
  summary: string;
};

type ScenarioKey = keyof typeof dashboardScenarios;

const SCENARIO_META: Record<ScenarioKey, ScenarioMeta> = {
  risk: {
    label: "Riesgo",
    summary:
      "Empresa con presión de caja, concentración de clientes y gastos en aumento.",
  },
  stable: {
    label: "Estable",
    summary:
      "Empresa con operación ordenada, caja saludable y seguimiento preventivo.",
  },
  growth: {
    label: "Crecimiento",
    summary:
      "Empresa con ventas en expansión, pero con foco necesario en cobranzas y eficiencia.",
  },
};

export function getScenarioMeta(scenario: ScenarioKey): ScenarioMeta {
  return SCENARIO_META[scenario];
}
