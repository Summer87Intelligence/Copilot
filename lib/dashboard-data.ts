import type { Metric } from "@/types/dashboard";

export type DashboardSnapshot = {
  cashAvailable: number;
  monthlySales: number;
  pendingCollections: number;
  monthlyExpenses: number;
  cashRiskDays: number;
  topClientsConcentration: number;
  expensesGrowthPercent: number;
};

export const dashboardScenarios = {
  risk: {
    cashAvailable: 120000,
    monthlySales: 340000,
    pendingCollections: 90000,
    monthlyExpenses: 210000,
    cashRiskDays: 12,
    topClientsConcentration: 65,
    expensesGrowthPercent: 18,
  },
  stable: {
    cashAvailable: 480000,
    monthlySales: 275000,
    pendingCollections: 32000,
    monthlyExpenses: 188000,
    cashRiskDays: 58,
    topClientsConcentration: 28,
    expensesGrowthPercent: 4,
  },
  growth: {
    cashAvailable: 210000,
    monthlySales: 620000,
    pendingCollections: 235000,
    monthlyExpenses: 252000,
    cashRiskDays: 24,
    topClientsConcentration: 48,
    expensesGrowthPercent: 12,
  },
} satisfies Record<"risk" | "stable" | "growth", DashboardSnapshot>;

export type DashboardScenarioName = keyof typeof dashboardScenarios;

export const dashboardSnapshot: DashboardSnapshot = dashboardScenarios.risk;

function formatMoney(amount: number): string {
  const formatted = amount.toLocaleString("es-AR", {
    maximumFractionDigits: 0,
  });
  return `$${formatted}`;
}

const PENDING_TO_SALES_ALERT_RATIO = 0.25;

export function getSnapshotSignals(s: DashboardSnapshot) {
  const pendingRatio =
    s.monthlySales > 0 ? s.pendingCollections / s.monthlySales : 0;

  const cashStress = s.cashRiskDays < 15;
  const concentrationRisk = s.topClientsConcentration > 60;
  const expensePressure = s.expensesGrowthPercent > 15;
  const collectionDrag = pendingRatio > PENDING_TO_SALES_ALERT_RATIO;

  const isCalmPeriod =
    s.cashRiskDays >= 40 &&
    s.topClientsConcentration < 45 &&
    s.expensesGrowthPercent <= 10 &&
    pendingRatio <= 0.22;

  return {
    pendingRatio,
    cashStress,
    concentrationRisk,
    expensePressure,
    collectionDrag,
    isCalmPeriod,
  };
}

export function buildAlertsFromSnapshot(s: DashboardSnapshot): string[] {
  const alerts: string[] = [];
  const sig = getSnapshotSignals(s);

  if (sig.cashStress) {
    alerts.push(
      `Caja en alerta: con el ritmo actual podés entrar en estrés en ${s.cashRiskDays} días.`
    );
  }
  if (sig.concentrationRisk) {
    alerts.push(
      `Pocos clientes concentran el ${s.topClientsConcentration}% de la cobranza: dependencia comercial elevada.`
    );
  }
  if (sig.expensePressure) {
    alerts.push(
      `Los gastos crecieron ${s.expensesGrowthPercent}% este mes, por encima de lo deseable para el margen.`
    );
  }
  if (sig.collectionDrag) {
    alerts.push(
      `Cobranzas pendientes por ${formatMoney(s.pendingCollections)} frente a ventas de ${formatMoney(s.monthlySales)}: riesgo de liquidez por demoras en ingresos.`
    );
  }

  if (alerts.length === 0 && sig.isCalmPeriod) {
    alerts.push(
      "Liquidez holgada: no se detectan señales críticas de caja en el corto plazo.",
      "Cartera poco concentrada en términos relativos; seguí monitoreando el mix de clientes.",
      "Evolución de gastos alineada con un margen saludable; mantené el seguimiento mensual."
    );
  } else if (alerts.length === 0) {
    alerts.push(
      "Situación intermedia: conviene revisar proyección de caja y calendario de cobros.",
      "Mantené visibilidad sobre clientes con mayor saldo pendiente.",
      "Compará gastos reales vs. presupuesto y ajustá si aparecen desvíos sostenidos."
    );
  }

  return alerts;
}

export function buildMetricsFromSnapshot(s: DashboardSnapshot): Metric[] {
  return [
    { title: "Caja disponible", value: formatMoney(s.cashAvailable) },
    { title: "Ventas del mes", value: formatMoney(s.monthlySales) },
    {
      title: "Cobranzas pendientes",
      value: formatMoney(s.pendingCollections),
    },
    { title: "Gastos del mes", value: formatMoney(s.monthlyExpenses) },
  ];
}

export function buildRecommendedActionsFromSnapshot(
  s: DashboardSnapshot
): string[] {
  const actions: string[] = [];
  const sig = getSnapshotSignals(s);

  if (sig.cashStress) {
    actions.push(
      "Priorizar cobranzas y acelerar ingresos confirmados antes de asumir nuevos compromisos de pago."
    );
  }
  if (sig.collectionDrag) {
    actions.push(
      "Contactar clientes clave con saldo pendiente y acordar planes de pago concretos y fechas."
    );
  }
  if (sig.concentrationRisk) {
    actions.push(
      "Revisar cartera y avanzar un plan de diversificación de ingresos en el mediano plazo."
    );
  }
  if (sig.expensePressure) {
    actions.push(
      "Auditar gastos administrativos y contener partidas discrecionales en las próximas semanas."
    );
  }

  if (actions.length === 0 && sig.isCalmPeriod) {
    actions.push(
      "Mantener revisión mensual de flujo de caja con proyección a 60 días.",
      "Programar encuentros preventivos con principales clientes para anticipar imprevistos.",
      "Actualizar comparativo de costos fijos vs. variables y afinar el presupuesto."
    );
  } else if (actions.length === 0) {
    actions.push(
      "Refinar la proyección semanal de caja y el calendario de cobranzas.",
      "Seguir de cerca a los clientes con mayor exposición en cartera.",
      "Contrastar gastos reales vs. presupuesto y corregir desvíos a tiempo."
    );
  }

  return actions;
}

export const metrics: Metric[] = buildMetricsFromSnapshot(dashboardSnapshot);

export const alerts: string[] = buildAlertsFromSnapshot(dashboardSnapshot);

export const recommendedActions: string[] =
  buildRecommendedActionsFromSnapshot(dashboardSnapshot);
