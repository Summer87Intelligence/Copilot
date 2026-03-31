import type { DashboardSnapshot } from "@/lib/dashboard-data";

function lowerFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function buildBodyFromChunks(chunks: string[]): string {
  if (chunks.length === 0) {
    return "Los indicadores clave se mantienen en rangos prudentes.";
  }
  if (chunks.length === 1) {
    return chunks[0];
  }
  if (chunks.length === 2) {
    return `${chunks[0]} Además, ${lowerFirst(chunks[1])}`;
  }
  return `${chunks[0]} Además, ${lowerFirst(chunks[1])} y ${lowerFirst(
    chunks[2]
  )}`;
}

export function getExecutiveInsight(snapshot: DashboardSnapshot): string {
  const { cashRiskDays, topClientsConcentration, expensesGrowthPercent } =
    snapshot;

  const chunks: string[] = [];

  if (cashRiskDays < 15) {
    chunks.push(
      "Tu caja podría entrar en estrés en menos de dos semanas."
    );
  }

  if (topClientsConcentration > 60) {
    chunks.push("Tenés una alta dependencia de pocos clientes.");
  }

  if (expensesGrowthPercent > 15) {
    chunks.push("Los gastos vienen creciendo por encima de lo esperado.");
  }

  const body = buildBodyFromChunks(chunks);
  const closing =
    "Es clave que priorices cobranzas y revises la estructura de costos en el corto plazo.";

  return `${body} ${closing}`;
}
