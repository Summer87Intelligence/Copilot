/** Datos simulados para vistas mock del módulo Summer87 Copilot (PyME). */

export const MOCK_COMPANY_NAME = "Distribuidora Norte S.A.";

export const MOCK_KPIS = [
  {
    id: "cash",
    label: "Caja disponible",
    value: "$ 2.840.000",
    hint: "Incluye cuentas a cobrar líquidas",
    trend: "+4% vs. mes anterior",
  },
  {
    id: "sales",
    label: "Ventas del mes",
    value: "$ 18.200.000",
    hint: "Facturación neta estimada",
    trend: "−2% vs. promedio trimestral",
  },
  {
    id: "receivables",
    label: "Cobranza pendiente",
    value: "$ 4.120.000",
    hint: "Vencido: $ 890.000",
    trend: "Requiere seguimiento",
  },
  {
    id: "expenses",
    label: "Gastos del mes",
    value: "$ 12.450.000",
    hint: "Operativos + administrativos",
    trend: "+6% vs. mes anterior",
  },
  {
    id: "margin",
    label: "Rentabilidad estimada",
    value: "18,4%",
    hint: "Margen operativo aproximado",
    trend: "Objetivo: 20%",
  },
] as const;

export const MOCK_BUSINESS_HEALTH = {
  score: 72,
  label: "Salud estable con foco en cobranza",
  bullets: [
    "La liquidez cubre ~6 semanas de gasto fijo.",
    "Hay concentración moderada en el top 3 de clientes.",
    "Los gastos administrativos subieron más que las ventas.",
  ],
};

export const MOCK_ALERTS_SUMMARY = {
  critical: 2,
  high: 4,
  medium: 7,
};

export const MOCK_ALERTS = [
  {
    id: "a1",
    title: "Caja por debajo del umbral mínimo",
    priority: "critical" as const,
    type: "liquidez" as const,
    summary:
      "La caja proyectada cae bajo el piso seguro si no ingresan cobros en 10 días.",
    detail:
      "Recomendamos priorizar cobranza de facturas vencidas y revisar pagos diferidos programados.",
  },
  {
    id: "a2",
    title: "Clientes con deuda vencida",
    priority: "critical" as const,
    type: "cobranza" as const,
    summary: "Tres clientes concentran el 62% del vencido total.",
    detail:
      "Contacto sugerido con prioridad: Metalúrgica Delta y Distribuidora Sur.",
  },
  {
    id: "a3",
    title: "Aumento anormal de gastos administrativos",
    priority: "high" as const,
    type: "gastos" as const,
    summary: "+18% respecto al promedio de los últimos 3 meses.",
    detail: "Revisar contratos de software y honorarios externos.",
  },
  {
    id: "a4",
    title: "Concentración de clientes",
    priority: "high" as const,
    type: "riesgo" as const,
    summary: "El 48% de las ventas proviene de dos clientes.",
    detail: "Evaluar diversificación comercial y condiciones comerciales.",
  },
  {
    id: "a5",
    title: "Caída de ventas en canal retail",
    priority: "medium" as const,
    type: "ventas" as const,
    summary: "−11% intermensual en el segmento retail.",
    detail: "Correlación con stock y promociones del competidor principal.",
  },
];

export const MOCK_ACTIONS = {
  today: [
    {
      id: "t1",
      title: "Llamar a Cliente A (Metalúrgica Delta)",
      impact: "Alto",
      reason: "Factura vencida $ 340.000 — evita deterioro de caja.",
      status: "pendiente" as const,
    },
    {
      id: "t2",
      title: "Revisar gasto administrativo (software)",
      impact: "Medio",
      reason: "Suba sostenida fuera de patrón histórico.",
      status: "en curso" as const,
    },
  ],
  week: [
    {
      id: "w1",
      title: "Acelerar cobranza — Distribuidora Sur",
      impact: "Alto",
      reason: "Compromiso de pago pendiente de confirmación.",
      status: "pendiente" as const,
    },
    {
      id: "w2",
      title: "Evaluar dependencia de clientes top",
      impact: "Alto",
      reason: "Concentración elevada en dos cuentas.",
      status: "pendiente" as const,
    },
  ],
  priority: [
    {
      id: "p1",
      title: "Asegurar ingreso de $ 890.000 esta semana",
      impact: "Crítico",
      reason: "Cubre brecha de liquidez proyectada.",
      status: "pendiente" as const,
    },
  ],
};

export const MOCK_CLIENTS = [
  {
    name: "Metalúrgica Delta",
    billing: "$ 4.200.000",
    debt: "$ 340.000",
    risk: "Alto",
    share: "23%",
  },
  {
    name: "Distribuidora Sur",
    billing: "$ 3.100.000",
    debt: "$ 0",
    risk: "Medio",
    share: "17%",
  },
  {
    name: "Comercial Andina",
    billing: "$ 2.450.000",
    debt: "$ 120.000",
    risk: "Bajo",
    share: "14%",
  },
  {
    name: "Retail Express",
    billing: "$ 1.980.000",
    debt: "$ 430.000",
    risk: "Medio",
    share: "11%",
  },
  {
    name: "Logística Oeste",
    billing: "$ 1.650.000",
    debt: "$ 0",
    risk: "Bajo",
    share: "9%",
  },
];

export const MOCK_FINANCE = {
  cashFlow: [
    { label: "Semana 1", in: 4200, out: 3800 },
    { label: "Semana 2", in: 3900, out: 4100 },
    { label: "Semana 3", in: 4500, out: 3600 },
    { label: "Semana 4", in: 4100, out: 4000 },
  ],
  incomeVsExpense: { income: 18.2, expense: 12.45 },
  monthly: [
    { m: "Oct", v: 16.2 },
    { m: "Nov", v: 17.1 },
    { m: "Dic", v: 17.8 },
    { m: "Ene", v: 18.2 },
  ],
  marginPct: 18.4,
};

export const MOCK_SCENARIOS = [
  {
    id: "risk" as const,
    label: "Riesgo",
    cash: "$ 1,1 M",
    sales: "$ 15,8 M",
    expenses: "$ 12,9 M",
    narrative:
      "Presión en caja y cobranza; priorizar liquidez y recortes selectivos.",
  },
  {
    id: "stable" as const,
    label: "Estable",
    cash: "$ 2,8 M",
    sales: "$ 18,2 M",
    expenses: "$ 12,5 M",
    narrative:
      "Operación alineada al plan; monitorear concentración y gastos admin.",
  },
  {
    id: "growth" as const,
    label: "Crecimiento",
    cash: "$ 3,6 M",
    sales: "$ 21,4 M",
    expenses: "$ 13,8 M",
    narrative:
      "Inversión en stock y equipo; vigilar apalancamiento y plazos de cobro.",
  },
];

export const MOCK_INSIGHTS = [
  {
    id: "i1",
    title: "La cobranza vencida explica gran parte del riesgo de caja",
    priority: "Alta",
    date: "31 mar 2026",
    category: "Liquidez",
    status: "Activo",
  },
  {
    id: "i2",
    title: "Gastos administrativos fuera de banda histórica",
    priority: "Media",
    date: "28 mar 2026",
    category: "Costos",
    status: "En seguimiento",
  },
  {
    id: "i3",
    title: "Oportunidad: renegociar plazo con proveedor clave",
    priority: "Media",
    date: "25 mar 2026",
    category: "Proveedores",
    status: "Cerrado",
  },
];

export const MOCK_INTEGRATIONS = [
  {
    id: "supabase",
    name: "Supabase",
    status: "conectado" as const,
    detail: "Última sync: hace 12 min",
  },
  {
    id: "csv",
    name: "Importación CSV",
    status: "conectado" as const,
    detail: "Último archivo: movimientos_marzo.csv",
  },
  {
    id: "zeta",
    name: "API Zeta",
    status: "pendiente" as const,
    detail: "Disponible en una próxima versión",
  },
];

export const MOCK_SYNC_LOGS = [
  { time: "10:42", message: "Sincronización incremental completada" },
  { time: "09:15", message: "Validación de categorías: sin errores" },
  { time: "08:01", message: "Importación CSV: 1.240 filas procesadas" },
];

export const MOCK_TICKETS = [
  {
    id: "#4821",
    subject: "Sugerencia: filtro por rubro en Clientes",
    state: "En evaluación",
    date: "22 mar 2026",
  },
  {
    id: "#4798",
    subject: "Problema: demora al cargar Finanzas",
    state: "Resuelto",
    date: "15 mar 2026",
  },
];

/** Lectura ejecutiva que solo tiene sentido con un copiloto (no es un KPI suelto). */
export const MOCK_COPILOT_BRIEFING = {
  headline: "Hoy el riesgo no es “bajar ventas”: es el calendario de cobros.",
  narrative:
    "Tus gastos fijos siguen saliendo, pero el vencido se concentró en pocas cuentas. Eso significa que podés estar “en verde” en facturación y aun así entrar en tensión de caja la próxima quincena. El copiloto no te muestra un número aislado: te cuenta la secuencia (cobros → caja → margen) y qué mover primero.",
  focus:
    "Prioridad sugerida: recuperar $ 400–600k del vencido en 7 días y congelar dos gastos administrativos recurrentes hasta normalizar cobranza.",
};

/** Contraste explícito: panel vs copiloto (la “ventaja” visible). */
export const MOCK_PANEL_VS_COPILOT = {
  panel:
    "Gráficos y tablas: ves el resultado, pero no el orden de impacto ni el efecto en cadena.",
  copilot:
    "Síntesis + alertas priorizadas + acciones: te dice qué pasa si no movés X, y qué mejorar primero para desbloquear Y.",
} as const;

/** Cadena causal simple: donde se nota el razonamiento (mock). */
export const MOCK_CAUSAL_CHAIN = [
  {
    id: "c1",
    trigger: "Suben gastos admin. (+6%)",
    link: "mientras",
    effect: "ventas caen leve (−2%)",
    copilotRead:
      "Eso comprime margen más rápido que un “mal mes” suelto: conviene cortar costos discrecionales antes de tocar precio.",
  },
  {
    id: "c2",
    trigger: "$ 890k vencidos",
    link: "en",
    effect: "3 clientes (62% del vencido)",
    copilotRead:
      "No es “cobrar en general”: es llamar con orden (mayor impacto en caja por minuto de gestión).",
  },
] as const;

/** Pregunta tipo asistente (demo de intención; la respuesta es simulada). */
export const MOCK_COPILOT_QUICK_ASK = {
  question: "¿Qué pasa si cobro el 50% del vencido esta semana?",
  answer:
    "Proyectás aliviar la tensión de caja en ~8–10 días y ganar margen de maniobra para cubrir gastos fijos sin tocar inversión en stock. El cuello de botella pasa de liquidez a ejecución comercial (seguimiento de promesas de pago).",
} as const;

export type MockAiAgentId =
  | "cobranza"
  | "costos"
  | "ventas"
  | "riesgo"
  | "briefing";

export const MOCK_AI_AGENTS: {
  id: MockAiAgentId;
  name: string;
  tagline: string;
  withoutCopilot: string;
  withAgent: string;
  delivers: string[];
  defaultOn: boolean;
}[] = [
  {
    id: "cobranza",
    name: "Agente de cobranza inteligente",
    tagline: "Prioriza quién pagaría más rápido con menos fricción.",
    withoutCopilot:
      "Listado de facturas vencidas: vos interpretás prioridades y riesgos.",
    withAgent:
      "Ranking por impacto en caja y probabilidad de cobro; guiones y próximos pasos sugeridos.",
    delivers: [
      "Orden de cobro sugerido (no alfabético)",
      "Alertas cuando el vencido se concentra",
    ],
    defaultOn: true,
  },
  {
    id: "costos",
    name: "Agente de costos y gastos",
    tagline: "Detecta fugas recurrentes y anomalías fuera de tu patrón.",
    withoutCopilot:
      "Categorías y totales: detectar “qué está raro” lleva tiempo y Excel.",
    withAgent:
      "Anomalías explicadas en lenguaje de negocio + hipótesis de causa.",
    delivers: ["Picos fuera de banda", "Contratos recurrentes a revisar"],
    defaultOn: true,
  },
  {
    id: "ventas",
    name: "Agente de ventas y canal",
    tagline: "Conecta caídas con clientes, canal y estacionalidad.",
    withoutCopilot:
      "Un gráfico de ventas: no te dice “por qué” ni “qué hacer”.",
    withAgent:
      "Lectura de drivers: clientes, producto/canal y siguiente experimento.",
    delivers: ["Caídas explicadas", "Acciones comerciales concretas"],
    defaultOn: false,
  },
  {
    id: "riesgo",
    name: "Agente de riesgo y concentración",
    tagline: "Traduce concentración en riesgo real de negocio.",
    withoutCopilot:
      "Porcentajes de participación: vos decidís si es “mucho” o “poco”.",
    withAgent:
      "Umbrales de negocio + escenarios (qué pasa si pierde un cliente top).",
    delivers: ["Mapa de concentración", "Simulación de impacto"],
    defaultOn: true,
  },
  {
    id: "briefing",
    name: "Agente de briefing ejecutivo",
    tagline: "Resume la semana en 60 segundos, con tono director.",
    withoutCopilot:
      "Reunís datos a mano: 20 páginas para llegar a una conclusión.",
    withAgent:
      "Un texto corto + 3 decisiones sugeridas. Listo para compartir.",
    delivers: ["Brief semanal", "Decisiones priorizadas"],
    defaultOn: false,
  },
];
