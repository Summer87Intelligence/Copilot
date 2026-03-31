/**
 * Mock exclusivo del módulo DEMO `/demo/ia` — sin backend.
 */

export type DemoIaAgentStatus = "activo" | "supervisado" | "pausado";

export type DemoIaAgent = {
  id: string;
  name: string;
  role: string;
  shortFn: string;
  status: DemoIaAgentStatus;
  autonomy: number;
  autonomyLabel: string;
  lastRun: string;
  typeLabel: string;
  metrics: { label: string; value: string }[];
};

export const DEMO_IA_EXEC_SUMMARY = {
  activeAgents: 5,
  decisionsToday: 142,
  automations: 8,
  incidents: 2,
  autonomyLevel: 72,
  autonomyLabel: "Supervisado",
  lastSync: "Hoy · 09:42 ART",
} as const;

export const DEMO_IA_OPERATIVE_BRAIN = {
  systemState: "Óptimo",
  systemDetail:
    "Todos los agentes en cola respondieron dentro de SLA. Sin degradación de modelos.",
  activeFlow: "Leads → Diagnóstico → Decisión comercial → Acción",
  dailyMission:
    "Priorizar 12 cuentas con señal de compra en 48h y evitar fugas en etapa de propuesta.",
  nextProcesses: [
    { id: "n1", label: "Batch scoring · cartera media", eta: "10:15" },
    { id: "n2", label: "Sincronización CRM · delta incremental", eta: "10:40" },
    { id: "n3", label: "Resumen ejecutivo · alertas críticas", eta: "11:00" },
  ],
  humanIntervention: 28,
  humanInterventionLabel:
    "Intervención humana requerida en aprobaciones de descuento y mensajes sensibles.",
} as const;

export const DEMO_IA_AGENTS: DemoIaAgent[] = [
  {
    id: "inv",
    name: "Investigador",
    role: "Investigador",
    shortFn: "Enriquece contexto, fuentes y señales externas por cuenta.",
    status: "activo",
    autonomy: 85,
    autonomyLabel: "Alto",
    lastRun: "Hace 6 min",
    typeLabel: "Percepción",
    metrics: [
      { label: "Señales nuevas", value: "34" },
      { label: "Confianza media", value: "0,82" },
    ],
  },
  {
    id: "diag",
    name: "Diagnóstico",
    role: "Diagnóstico",
    shortFn: "Traduce datos en lectura ejecutiva y riesgos priorizados.",
    status: "supervisado",
    autonomy: 62,
    autonomyLabel: "Medio",
    lastRun: "Hace 14 min",
    typeLabel: "Análisis",
    metrics: [
      { label: "Briefings", value: "18" },
      { label: "Escalaciones", value: "3" },
    ],
  },
  {
    id: "dec",
    name: "Decisor comercial",
    role: "Decisor comercial",
    shortFn: "Propone siguiente mejor acción y orden de contacto.",
    status: "activo",
    autonomy: 70,
    autonomyLabel: "Medio-alto",
    lastRun: "Hace 3 min",
    typeLabel: "Orquestación",
    metrics: [
      { label: "Decisiones", value: "56" },
      { label: "Acierto est.", value: "74%" },
    ],
  },
  {
    id: "opt",
    name: "Optimizador",
    role: "Optimizador",
    shortFn: "Ajusta prioridades según capacidad del equipo y SLAs.",
    status: "activo",
    autonomy: 55,
    autonomyLabel: "Medio",
    lastRun: "Hace 22 min",
    typeLabel: "Planificación",
    metrics: [
      { label: "Reordenamientos", value: "9" },
      { label: "Ahorro tiempo", value: "12%" },
    ],
  },
  {
    id: "sup",
    name: "Supervisor",
    role: "Supervisor",
    shortFn: "Audita salidas, políticas y consistencia con marca.",
    status: "pausado",
    autonomy: 40,
    autonomyLabel: "Bajo",
    lastRun: "Ayer · 18:02",
    typeLabel: "Gobernanza",
    metrics: [
      { label: "Bloqueos", value: "1" },
      { label: "Revisiones", value: "7" },
    ],
  },
];

export const DEMO_IA_CAPABILITIES = [
  {
    id: "c1",
    title: "Análisis de negocio",
    hint: "Lectura de pipeline, riesgo y oportunidad en lenguaje directivo.",
  },
  {
    id: "c2",
    title: "Scoring dinámico",
    hint: "Priorización continua según señales y contexto operativo.",
  },
  {
    id: "c3",
    title: "Generación de mensajes",
    hint: "Borradores alineados a tono y políticas de contacto.",
  },
  {
    id: "c4",
    title: "Priorización",
    hint: "Orden de ejecución según impacto, plazo y carga humana.",
  },
  {
    id: "c5",
    title: "Aprendizaje",
    hint: "Feedback de resultados para afinar reglas y umbrales.",
  },
  {
    id: "c6",
    title: "Control humano",
    hint: "Puntos de aprobación y trazabilidad de decisiones sensibles.",
  },
] as const;

export const DEMO_IA_SYSTEM_RULES = [
  {
    id: "r1",
    title: "Política de contacto",
    detail: "Máx. 3 touchpoints / 72h salvo excepción aprobada.",
  },
  {
    id: "r2",
    title: "Datos sensibles",
    detail: "Mensajes con pricing nunca salen sin revisión humana.",
  },
  {
    id: "r3",
    title: "Autonomía",
    detail: "Por debajo del 60% de confianza → modo supervisado automático.",
  },
] as const;

export const DEMO_IA_EXECUTION_ORDER = [
  { step: 1, label: "Investigador · contexto", state: "done" as const },
  { step: 2, label: "Diagnóstico · lectura", state: "done" as const },
  { step: 3, label: "Decisor · siguiente paso", state: "active" as const },
  { step: 4, label: "Optimizador · cola", state: "pending" as const },
  { step: 5, label: "Supervisor · auditoría", state: "pending" as const },
] as const;

export const DEMO_IA_HUMAN_INTERVENTION = {
  pending: 6,
  avgMinutes: 4,
  channels: ["Descuentos", "Cuentas estratégicas", "Canales sensibles"],
} as const;

export const DEMO_IA_METRICS_ROW = [
  { label: "Latencia media", value: "1,2 s" },
  { label: "Tasa de escalación", value: "6,4%" },
  { label: "Cumplimiento políticas", value: "98%" },
] as const;
