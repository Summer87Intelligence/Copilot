/** Mock de Gestión IA — cerebro operativo del copiloto (PyME). */

export const MOCK_IA_SYSTEM_SUMMARY = {
  copilotStatus: "Activo",
  lastAnalysis: "Hace 2 minutos",
  activeAgents: 4,
  decisionsToday: 7,
} as const;

export type MockIaAgentCard = {
  id: string;
  name: string;
  status: "Activo";
  frequency: string;
  lastInsight: string;
};

export const MOCK_IA_ACTIVE_AGENTS: MockIaAgentCard[] = [
  {
    id: "fin",
    name: "Analista Financiero",
    status: "Activo",
    frequency: "Cada 6 horas",
    lastInsight:
      "Detecta tensión de caja en 14 días por demora en cobranzas",
  },
  {
    id: "cob",
    name: "Agente de Cobranza",
    status: "Activo",
    frequency: "Cada 4 horas",
    lastInsight:
      "Priorizó 3 cuentas: impacto estimado $ 420k en 7 días",
  },
  {
    id: "gas",
    name: "Control de Gastos",
    status: "Activo",
    frequency: "Diario · 08:00",
    lastInsight:
      "Gastos administrativos +6% vs. mes anterior — revisar contratos SaaS",
  },
  {
    id: "rie",
    name: "Riesgo Comercial",
    status: "Activo",
    frequency: "Cada 12 horas",
    lastInsight:
      "Concentración 48% en top 2 clientes — umbral de riesgo medio-alto",
  },
];

export type MockIaRule = {
  id: string;
  name: string;
  condition: string;
  action: string;
};

export const MOCK_IA_RULES: MockIaRule[] = [
  {
    id: "r1",
    name: "Riesgo de caja",
    condition: "Caja proyectada < 20 días de gasto fijo",
    action: "Generar alerta crítica + decisión sugerida en Acciones",
  },
  {
    id: "r2",
    name: "Deuda vencida",
    condition: "Saldo vencido > 30 días en cualquier cliente",
    action: "Priorizar cobranza y notificar al agente de cobranza",
  },
  {
    id: "r3",
    name: "Anomalía de gastos",
    condition: "Gasto por categoría > 15% vs. promedio trimestral",
    action: "Insight en Finanzas + tarea sugerida en Acciones",
  },
  {
    id: "r4",
    name: "Concentración de clientes",
    condition: "Top 3 clientes > 55% de facturación mensual",
    action: "Alerta de riesgo comercial + escenario en Escenarios",
  },
];

export type MockIaHistoryEntry = {
  time: string;
  message: string;
};

export const MOCK_IA_EXECUTION_HISTORY: MockIaHistoryEntry[] = [
  { time: "10:34", message: "Se generaron 2 decisiones priorizadas" },
  { time: "10:33", message: "Se generaron 3 insights (liquidez, gastos, ventas)" },
  { time: "10:32", message: "Analista Financiero ejecutado — snapshot actualizado" },
  { time: "09:58", message: "Agente de Cobranza: ranking de cuentas recalculado" },
  { time: "08:01", message: "Control de Gastos: análisis diario completado" },
];

export const MOCK_IA_AUTOMATION_DEFAULTS = {
  dailyAnalysis: true,
  autoDecisions: false,
  prioritizeByImpact: true,
} as const;

export type MockIaInterventionLevel =
  | "solo_analisis"
  | "sugerencias"
  | "recomendaciones_activas"
  | "automatizacion_avanzada";

export const MOCK_IA_INTERVENTION_OPTIONS: {
  id: MockIaInterventionLevel;
  label: string;
  description: string;
}[] = [
  {
    id: "solo_analisis",
    label: "Solo análisis",
    description: "El sistema analiza y muestra lecturas; no propone acciones automáticas.",
  },
  {
    id: "sugerencias",
    label: "Sugerencias",
    description: "Recibís ideas y próximos pasos; vos confirmás todo.",
  },
  {
    id: "recomendaciones_activas",
    label: "Recomendaciones activas",
    description: "Prioridades y decisiones visibles en Acciones; siempre reversibles.",
  },
  {
    id: "automatizacion_avanzada",
    label: "Automatización avanzada",
    description: "Reglas y agentes con mayor autonomía (requiere políticas y permisos).",
  },
];
