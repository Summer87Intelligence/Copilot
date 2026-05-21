/**
 * Presentación de alertas de proyección 30d — solo UX, sin cambiar cálculos.
 */

import type { CarteraCurrencyTotals } from "@/lib/copilot-cartera-aging-totals";
import type { HoyProjection30dBlock, HoyTreasuryAlert } from "@/lib/copilot-hoy-treasury";

/** Una línea de resumen por moneda dentro de la card (sustituye lista de alertas duplicadas). */
export function projectionCurrencySummaryLine(block: HoyProjection30dBlock): string | null {
  if (!block.hasConfiguredPayments) return null;
  if (block.safeCash30d < 0 && block.expectedCash30d >= 0) {
    return "Sin cobrar deuda pendiente, la caja no alcanza; si se cobra, sí cubre pagos 30d.";
  }
  if (block.safeCash30d < 0) {
    return "Sin cobrar deuda pendiente, la caja no cubre los pagos programados 30d.";
  }
  return "La caja disponible cubre los pagos programados de los próximos 30 días.";
}

/** Máximo: aviso sin egresos + 1 alerta general de mora + 1 resumen global de cobertura. */
export function selectHoyProjectionUiAlerts(
  alerts: readonly HoyTreasuryAlert[],
  blocks: readonly HoyProjection30dBlock[],
  overdueCritical30: CarteraCurrencyTotals
): HoyTreasuryAlert[] {
  const out: HoyTreasuryAlert[] = [];
  const noOutflows = alerts.find((a) => a.id === "treasury_no_outflows");
  if (noOutflows) out.push(noOutflows);

  const hasOverdue = overdueCritical30.UYU > 0 || overdueCritical30.USD > 0;
  if (hasOverdue) {
    out.push({
      id: "treasury_overdue_general",
      tone: "attention",
      message:
        "Hay deuda con más de 30 días de atraso. No cuenta como caja disponible hasta cobrarla.",
    });
  }

  const configured = blocks.filter((b) => b.hasConfiguredPayments);
  if (configured.length === 0) return out;

  const anyDepends = configured.some((b) => b.expectedCash30d >= 0 && b.safeCash30d < 0);
  const anyDeficit = configured.some((b) => b.safeCash30d < 0);
  const allCover = configured.every((b) => b.safeCash30d >= 0);

  if (anyDepends) {
    out.push({
      id: "treasury_depends_collection_general",
      tone: "attention",
      message: "Dependés de cobrar deuda pendiente para cubrir los próximos pagos.",
    });
  } else if (anyDeficit) {
    out.push({
      id: "treasury_safe_deficit_general",
      tone: "critical",
      message:
        "Sin cobrar deuda pendiente, la caja no cubre los pagos programados de los próximos 30 días.",
    });
  } else if (allCover) {
    out.push({
      id: "treasury_safe_covers_general",
      tone: "healthy",
      message: "La caja disponible cubre los pagos programados de los próximos 30 días.",
    });
  }

  return out.slice(0, 3);
}
