import {
  getSnapshotSignals,
  type DashboardSnapshot,
} from "@/lib/dashboard-data";

export type DashboardPriorityOfTheDay = {
  title: string;
  description: string;
};

export function getPriorityOfTheDay(
  snapshot: DashboardSnapshot
): DashboardPriorityOfTheDay {
  const sig = getSnapshotSignals(snapshot);

  if (sig.cashStress) {
    return {
      title: "Liquidez y cobranzas primero",
      description: `Hoy el foco es la caja: con ${snapshot.cashRiskDays} días de margen, priorizá ingresos confirmados y postergá salidas que no sean críticas.`,
    };
  }

  if (sig.collectionDrag) {
    return {
      title: "Acelerar cobranza",
      description:
        "Las cobranzas pendientes están altas frente a las ventas del mes; dedicá el día a cerrar acuerdos de pago y seguimiento firme con clientes deudores.",
    };
  }

  if (sig.concentrationRisk) {
    return {
      title: "Diversificar cartera",
      description: `Casi el ${snapshot.topClientsConcentration}% recae en pocos clientes; avanzá conversaciones para nuevos ingresos y reducí la dependencia comercial.`,
    };
  }

  if (sig.expensePressure) {
    return {
      title: "Controlar gastos",
      description: `Los gastos subieron ${snapshot.expensesGrowthPercent}%: usá el día para revisar partidas, frenar discrecionales y alinear costos con el plan.`,
    };
  }

  if (sig.isCalmPeriod) {
    return {
      title: "Monitoreo preventivo",
      description:
        "Indicadores equilibrados: aprovechá para revisar proyecciones, checklist de riesgos y próximos hitos comerciales sin urgencias de caja.",
    };
  }

  return {
    title: "Seguimiento de cartera y caja",
    description:
      "Mantené el foco en el calendario de cobros y en clientes con mayor exposición; afiná la proyección semanal de efectivo.",
  };
}
