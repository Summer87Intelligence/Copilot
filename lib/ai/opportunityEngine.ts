/**
 * Opportunity Engine — motor mock inicial.
 * Genera iniciativas demo realistas (PyME) para persistir en `initiatives`.
 */

export type OpportunityInitiative = {
  company_name: string;
  source: string;
  trigger: string;
  score: number;
  status: string;
};

const POOL: OpportunityInitiative[] = [
  {
    company_name: "Metalúrgica Delta S.R.L.",
    source: "motor_financiero",
    trigger: "Caja proyectada < 18 días por demora en cobranzas mayorista",
    score: 86,
    status: "new",
  },
  {
    company_name: "Distribuidora Sur S.A.",
    source: "pipeline_cobranza",
    trigger: "Deuda vencida > 35 días concentrada en 2 facturas clave",
    score: 81,
    status: "new",
  },
  {
    company_name: "Comercial Andina",
    source: "control_gastos",
    trigger: "Gastos administrativos +14% vs. trimestre anterior (anomalía)",
    score: 74,
    status: "new",
  },
  {
    company_name: "Retail Express",
    source: "canal_ventas",
    trigger: "Caída intermensual retail −11% con stock alto en A/B",
    score: 69,
    status: "new",
  },
  {
    company_name: "Logística Oeste",
    source: "riesgo_comercial",
    trigger: "Top 2 clientes representan 52% de facturación mensual",
    score: 77,
    status: "new",
  },
  {
    company_name: "Alimentos Patagonia",
    source: "motor_financiero",
    trigger: "Margen operativo estimado por debajo del objetivo 2º mes consecutivo",
    score: 72,
    status: "new",
  },
  {
    company_name: "Servicios Norte",
    source: "pipeline_cobranza",
    trigger: "Promesas de pago incumplidas en 3 cuentas medianas",
    score: 79,
    status: "new",
  },
  {
    company_name: "Industrias Litoral",
    source: "control_gastos",
    trigger: "Contrato SaaS y servicios externos duplican patrón histórico",
    score: 68,
    status: "new",
  },
  {
    company_name: "Textil Centro",
    source: "canal_ventas",
    trigger: "Canal mayorista estable pero retail presionado por competencia",
    score: 64,
    status: "new",
  },
  {
    company_name: "Química Sur",
    source: "riesgo_comercial",
    trigger: "Dependencia de insumo importado — sensibilidad a tipo de cambio",
    score: 71,
    status: "new",
  },
  {
    company_name: "Construcciones del Valle",
    source: "motor_financiero",
    trigger: "Ratio caja / gasto fijo en zona de alerta (14 días)",
    score: 83,
    status: "new",
  },
  {
    company_name: "Agropecuaria La Esperanza",
    source: "pipeline_cobranza",
    trigger: "Facturación estacional: revisar calendario de cobros Q2",
    score: 66,
    status: "new",
  },
];

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Devuelve entre 8 y 12 iniciativas demo (sin persistencia).
 */
export function generateMockOpportunities(): OpportunityInitiative[] {
  const count = 8 + Math.floor(Math.random() * 5);
  return shuffle(POOL).slice(0, count);
}
