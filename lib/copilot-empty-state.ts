import type { FinancialSnapshot, FinancialSnapshotApiV1 } from "@/lib/copilot-financial-engine";
import {
  snapshotCashNet,
  snapshotExpectedOutflowsTotal,
  snapshotReceivablesRiskWeighted,
} from "@/lib/copilot-financial-snapshot-selectors";

/** ¿El snapshot financiero no aporta señal útil (caja y flujos ~0)? */
export function isFinancialSnapshotQuiet(s: FinancialSnapshot | null): boolean {
  if (!s) return true;
  const api = s as FinancialSnapshotApiV1;
  const q = (n: number) => Math.abs(Number(n)) < 0.01;
  return (
    q(snapshotCashNet(api)) &&
    q(snapshotReceivablesRiskWeighted(api)) &&
    q(snapshotExpectedOutflowsTotal(api))
  );
}

export type FiscalAlertPriorityCounts = {
  critical: number;
  high: number;
  medium: number;
};

export function totalFiscalAlerts(c: FiscalAlertPriorityCounts): number {
  return c.critical + c.high + c.medium;
}

/**
 * Vista ejecutiva del inicio: sin agenda fiscal, sin alertas fiscales y sin movimiento en snapshot.
 */
export function isCopilotHomeExecutiveEmpty(args: {
  taxAgendaLength: number;
  fiscalCounts: FiscalAlertPriorityCounts;
  snapshot: FinancialSnapshot | null;
  financialLoading: boolean;
  taxLoading: boolean;
  fiscalLoading: boolean;
}): boolean {
  if (
    args.financialLoading ||
    args.taxLoading ||
    args.fiscalLoading
  ) {
    return false;
  }
  if (args.taxAgendaLength > 0) return false;
  if (totalFiscalAlerts(args.fiscalCounts) > 0) return false;
  return isFinancialSnapshotQuiet(args.snapshot);
}

export const COPILOT_EMPTY_COPY = {
  homeBanner: {
    title: "Todavía no hay actividad suficiente para este panel",
    paragraphs: [
      "El Copilot lee tablas reales (`proto_companies`, facturas, recibos, pagos, obligaciones fiscales). Si están vacías, no vamos a inventar métricas ni alertas de ejemplo: solo verás lo que la base pueda calcular.",
      "Para que el inicio cobre sentido, cargá al menos empresas y movimiento comercial o fiscal. Ejemplo: una empresa, una factura emitida y un recibo — con eso ya aparecen señales de cartera y caja en Finanzas y, si hay vencimientos, alertas.",
    ],
    ctaHint:
      "Empezá por Datos (altas manuales) o por las migraciones SQL del prototipo en Supabase.",
  },
  homeAlertsWhenEmpty: {
    panelTitle: "Sin alertas en el radar",
    paragraphs: [
      "Las alertas aparecen cuando hay vencimientos fiscales próximos, deuda con saldo o presión de caja según las reglas del motor. Con tablas vacías el contador en cero es el resultado esperado.",
      "Cargá obligaciones en `proto_tax_obligations` y movimiento en facturas o recibos para que el sistema pueda señalar tensión de tesorería o cobranza.",
    ],
    example:
      "Un IVA próximo a vencer con saldo pendiente y poca caja suele disparar una alerta de prioridad alta o crítica.",
  },
  alertasPage: {
    title: "Sin alertas activas",
    paragraphs: [
      "No hay tensiones fiscales ni de caja detectadas con los datos actuales.",
    ],
    example: "Cuando haya vencimientos o presión de liquidez, aparecerán acá con un próximo paso.",
  },
  gestionIa: {
    title: "Todavía no hay acciones sugeridas para hoy",
    paragraphs: [
      "Esta pantalla se alimenta de señales reales sobre clientes, cobros y caja. Si aún no hay datos cargados o el motor no encontró candidatos, la lista queda en blanco: es lo esperado, no un error.",
      "Cuando haya movimiento en facturación, cobranzas o finanzas, vas a ver acá prioridades claras con un próximo paso para cada cuenta.",
    ],
    example:
      "Ejemplo: con facturas vencidas y saldo pendiente, suele aparecer primero un cliente en riesgo de cobro con un contacto sugerido para hoy.",
  },
  insights: {
    title: "Aún no hay insights que mostrar",
    paragraphs: [
      "Los insights se arman leyendo facturas, pagos y empresas en `proto_*`. Sin filas, el motor no encuentra patrones (deuda, vencimientos, caídas de cobro) y no muestra lecturas inventadas.",
      "Cargá datos mínimos de operación y volvé a esta pantalla: las tarjetas aparecerán solo cuando haya evidencia suficiente.",
    ],
    example:
      "Ejemplo: con facturas vencidas con saldo, suele generarse un insight de cobranza con prioridad alta.",
  },
  escenarios: {
    title: "Comparación de escenarios no disponible sin simulación conectada",
    paragraphs: [
      "Esta vista mostraba números de demostración. Con base vacía o sin motor de escenarios enlazado a tus datos, no mostramos cifras ficticias como si fueran reales.",
      "Cuando exista un modelo parametrizado sobre tu caja y ventas, acá podrás comparar estabilidad, riesgo y crecimiento con trazabilidad.",
    ],
    example:
      "Ejemplo futuro: tres escenarios con la misma fecha base y distintas hipótesis de gasto, todos leyendo los mismos `proto_*`.",
  },
} as const;
