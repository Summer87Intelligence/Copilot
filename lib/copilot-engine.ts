import type { DashboardSnapshot } from "@/lib/dashboard-data";
import { getSnapshotTrends } from "@/lib/dashboard-trends";
import type { CopilotInsightRecord } from "@/types/copilot-insight-record";

export type CopilotInsight = {
  type: "alert" | "opportunity" | "recommendation";
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  /** Siguiente paso sugerido (opcional; la UI puede ignorarlo hasta que se integre). */
  action?: string;
};

const PRIORITY_ORDER: Record<CopilotInsight["priority"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** Cuántas apariciones del mismo título en historial disparan alerta de recurrencia. */
const HISTORY_TITLE_RECURRENCE_MIN = 2;

/** Tope para el número mostrado en la descripción (evita textos absurdos). */
const HISTORY_RECURRENCE_DISPLAY_MAX = 99;

const RECURRENT_META_TITLE = "Problema recurrente detectado";

/** Concentración como fracción 0–1 (acepta % 0–100 o ratio 0–1). */
function clientConcentrationShare(value: number): number {
  if (value > 1) return value / 100;
  return value;
}

/**
 * Motor de insights para decisiones a partir del snapshot financiero.
 * Combina alertas, recomendaciones y oportunidades; ordenado por prioridad.
 * Con `previousSnapshot`, incorpora señales de tendencia (ventas, gastos, caja).
 * Con `previousInsights` (p. ej. `getRecentCopilotInsights`), detecta títulos que ya
 * aparecieron varias veces en el historial y eleva una alerta de patrón recurrente.
 * Sin I/O; listo para combinar después con modelos de IA.
 */
export function generateCopilotInsights(
  currentSnapshot: DashboardSnapshot,
  previousSnapshot?: DashboardSnapshot,
  previousInsights?: CopilotInsightRecord[]
): CopilotInsight[] {
  const {
    cashAvailable,
    monthlySales,
    pendingCollections,
    monthlyExpenses,
    cashRiskDays,
    topClientsConcentration,
    expensesGrowthPercent,
  } = currentSnapshot;

  const insights: CopilotInsight[] = [];

  if (cashAvailable < monthlyExpenses) {
    insights.push({
      type: "alert",
      title: "Riesgo de caja inmediato",
      description:
        "La caja disponible no cubre un mes de gastos al ritmo actual. Priorizá diferir salidas no críticas y acelerar ingresos confirmados.",
      priority: "high",
      action:
        "Revisar cobranzas pendientes y reducir gastos en los próximos días.",
    });
  }

  if (cashRiskDays < 15) {
    insights.push({
      type: "alert",
      title: "Alerta crítica de liquidez",
      description: `Con ~${Math.round(cashRiskDays)} días de margen estimado, la empresa entra en zona de estrés de tesorería. Reuní proyección de caja a 7–14 días y definí acciones de cobro y gasto hoy.`,
      priority: "high",
    });
  }

  if (
    monthlySales > 0 &&
    pendingCollections > monthlySales * 0.4
  ) {
    insights.push({
      type: "recommendation",
      title: "Acelerar cobranzas",
      description:
        "Las cobranzas pendientes superan el 40% de las ventas del mes: elevá la presión comercial suave en deudores clave y cerrá fechas de pago concretas.",
      priority: "medium",
      action:
        "Contactar clientes con pagos pendientes y priorizar ingresos.",
    });
  }

  if (expensesGrowthPercent > 20) {
    insights.push({
      type: "alert",
      title: "Gastos descontrolados",
      description: `El crecimiento intermensual de gastos (${expensesGrowthPercent}%) está por encima de un rango sano. Auditá las partidas que más subieron y congelá discrecionales hasta normalizar el ratio.`,
      priority: "high",
      action: "Auditar gastos recientes e identificar recortes posibles.",
    });
  }

  if (clientConcentrationShare(topClientsConcentration) > 0.5) {
    insights.push({
      type: "alert",
      title: "Riesgo de dependencia de clientes",
      description:
        "Un pequeño grupo concentra más de la mitad de la exposición comercial. Diversificá ingresos y reforzá contratos o planes B con los principales deudores.",
      priority: "medium",
    });
  }

  // --- Oportunidades (se evalúan además de alertas / recomendaciones) ---

  if (cashRiskDays >= 30 && cashAvailable > monthlyExpenses) {
    insights.push({
      type: "opportunity",
      title: "Caja con margen para operar",
      description:
        "Tenés al menos un mes de gastos cubierto por caja y un horizonte de liquidez holgado: es un buen momento para planificar inversiones puntuales o acelerar iniciativas sin apretar tesorería.",
      priority: "medium",
    });
  }

  if (monthlySales > monthlyExpenses && expensesGrowthPercent <= 10) {
    insights.push({
      type: "opportunity",
      title: "Crecimiento con costos bajo control",
      description:
        "Las ventas del mes superan los gastos y la subida de costos se mantiene en un rango manejable: reforzá lo que ya funciona y escalá con foco en margen.",
      priority: "medium",
    });
  }

  if (clientConcentrationShare(topClientsConcentration) <= 0.4) {
    insights.push({
      type: "opportunity",
      title: "Cartera relativamente diversificada",
      description:
        "La concentración en pocos clientes está por debajo de un umbral elevado: menor dependencia comercial y más opciones para probar nuevos segmentos o canales.",
      priority: "low",
    });
  }

  if (monthlySales > 0 && pendingCollections <= monthlySales * 0.2) {
    insights.push({
      type: "opportunity",
      title: "Cobranzas al día",
      description:
        "Las cobranzas pendientes representan una parte acotada de las ventas del mes: el flujo ingresa con regularidad; podés dedicar energía a venta nueva en lugar de solo seguimiento de deuda.",
      priority: "low",
    });
  }

  if (previousSnapshot) {
    const trends = getSnapshotTrends(currentSnapshot, previousSnapshot);

    if (trends.salesTrend === "down") {
      insights.push({
        type: "recommendation",
        title: "Tendencia a la baja en ventas",
        description:
          "Respecto del período de referencia, las ventas del mes muestran una caída. Revisá pipeline, estacionalidad y descuentos; priorizá recuperar volumen antes de ajustar estructura de costos.",
        priority: "medium",
      });
    }

    if (trends.expensesTrend === "up") {
      insights.push({
        type: "alert",
        title: "Presión creciente de gastos",
        description:
          "Los gastos del mes subieron frente al período anterior. Cruzá con presupuesto y con partidas variables para evitar que el incremento se vuelva estructural.",
        priority: "medium",
      });
    }

    if (trends.cashTrend === "down") {
      insights.push({
        type: "alert",
        title: "Deterioro de caja vs período anterior",
        description:
          "La caja disponible es menor que en la referencia previa. Aunque el nivel absoluto pueda ser aceptable, conviene vigilar salidas y adelantar cobros para no acelerar una tendencia negativa.",
        priority: "medium",
      });
    }
  }

  if (previousInsights && previousInsights.length > 0) {
    const titleCounts = new Map<string, number>();
    for (const row of previousInsights) {
      const key = row.title.trim();
      titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
    }

    let maxRecurrenceInHistory = 0;
    for (const insight of insights) {
      const key = insight.title.trim();
      const past = titleCounts.get(key) ?? 0;
      if (past >= HISTORY_TITLE_RECURRENCE_MIN) {
        maxRecurrenceInHistory = Math.max(maxRecurrenceInHistory, past);
      }
    }

    const alreadyHasMeta = insights.some((i) => i.title === RECURRENT_META_TITLE);
    if (maxRecurrenceInHistory > 0 && !alreadyHasMeta) {
      const n = Math.min(maxRecurrenceInHistory, HISTORY_RECURRENCE_DISPLAY_MAX);
      const vecesText = n === 1 ? "1 vez" : `${n} veces`;
      const lecturasText = n === 1 ? "la última lectura del Copilot" : "las últimas lecturas del Copilot";
      insights.push({
        type: "alert",
        title: RECURRENT_META_TITLE,
        description: `Este problema se repitió ${vecesText} en ${lecturasText}. Requiere atención estructural.`,
        priority: "high",
        action:
          "Analizar la causa raíz del problema y definir una solución estructural.",
      });
    }
  }

  return insights.sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  );
}
