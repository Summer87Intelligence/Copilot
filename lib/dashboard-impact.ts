import {
  getSnapshotSignals,
  type DashboardSnapshot,
} from "@/lib/dashboard-data";

export type EstimatedImpact = {
  title: string;
  description: string;
};

export function getEstimatedImpact(snapshot: DashboardSnapshot): EstimatedImpact {
  const sig = getSnapshotSignals(snapshot);

  if (sig.cashStress) {
    return {
      title: "Mejorar liquidez y evitar estrés financiero",
      description:
        "Si ejecutás la prioridad del día con foco en cobros y caja, podés ganar días de oxígeno, evitar cortes con proveedores y tomar decisiones sin apuro. El impacto se nota en menos tensiones operativas y en una curva de caja más predecible.",
    };
  }

  if (sig.collectionDrag) {
    return {
      title: "Mejorar el flujo de caja en el corto plazo",
      description:
        "Acelerar cobranzas libera efectivo antes de que se complique el calendario de pagos. En la práctica, es menos necesidad de financiación cara y más margen para invertir o absorber imprevistos.",
    };
  }

  if (sig.concentrationRisk) {
    return {
      title: "Reducir riesgo comercial",
      description:
        "Diversificar ingresos amortigua golpes si un cliente reduce compras o demora pagos. El beneficio es un negocio menos expuesto a decisiones ajenas y con más opciones de negociación futura.",
    };
  }

  if (sig.expensePressure) {
    return {
      title: "Estabilizar márgenes",
      description:
        "Contener el crecimiento de gastos alinea costos con ingresos y protege el resultado. Sostenelo unas semanas y ganás previsibilidad para precios, inversiones y remuneraciones.",
    };
  }

  if (sig.isCalmPeriod) {
    return {
      title: "Sostener un crecimiento ordenado",
      description:
        "Con indicadores equilibrados, el impacto de actuar con disciplina es mantener la senda sin sorpresas: seguís creciendo o consolidando sin quemar caja ni descuidar clientes clave.",
    };
  }

  return {
    title: "Equilibrio entre ingresos, cobros y costos",
    description:
      "Refinar cobranzas y costos en paralelo mejora la resiliencia del negocio: más efectivo disponible y decisiones con mejor información, sin depender de un solo palanca.",
  };
}
