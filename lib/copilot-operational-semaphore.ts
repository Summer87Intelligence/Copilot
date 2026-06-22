/**
 * Semáforo operacional global del header Copilot — derivación UI (v1).
 */

import type { FiscalAlertItem } from "@/lib/copilot-tax-alerts";
import type { CarteraCurrencyTotals } from "@/lib/copilot-cartera-aging-totals";
import type { TodayBusinessPulse } from "@/lib/copilot-today-business-pulse";
import { DEFAULT_DISPLAY_FX_RATE_UYU_PER_USD } from "@/lib/currency-display-mode";

export type OperationalSemaphoreLevel = "ok" | "attention" | "critical";

export type OperationalSemaphoreAlert = {
  id: string;
  title: string;
  severity: FiscalAlertItem["priority"];
};

export type OperationalSemaphoreView = {
  level: OperationalSemaphoreLevel;
  statusLabel: string;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  counterLine: string;
  primaryReason: string;
  /** Titles of real critical alerts only. */
  criticalItems: string[];
  /** Titles of real high-priority alerts only. */
  highItems: string[];
  /** Titles of real medium-priority alerts only. */
  mediumItems: string[];
  /** Operational/business signals that are not formal alerts (clients with arrears, upcoming payments, etc.). */
  operativeItems: string[];
  ctaHref: string;
  ctaLabel: string;
};

function hasPositiveAmount(t: CarteraCurrencyTotals | undefined): boolean {
  if (!t) return false;
  return (t.UYU ?? 0) > 0 || (t.USD ?? 0) > 0;
}

function hasCashDeficitAfterPayments(pulse: TodayBusinessPulse): boolean {
  return pulse.projection30dBlocks.some(
    (b) => b.hasConfiguredPayments && b.safeCash30d < 0
  );
}

/**
 * Retorna la caja proyectada neta en USD equivalente sumando todos los bloques
 * que tienen pagos configurados. UYU se convierte a tasa 40.
 * Retorna null si no hay bloques con pagos configurados.
 */
function consolidatedSafeCash30dUsd(pulse: TodayBusinessPulse): number | null {
  const blocks = pulse.projection30dBlocks.filter((b) => b.hasConfiguredPayments);
  if (blocks.length === 0) return null;
  let totalUsd = 0;
  for (const b of blocks) {
    if (b.currency === "USD") {
      totalUsd += b.safeCash30d;
    } else {
      totalUsd += b.safeCash30d / DEFAULT_DISPLAY_FX_RATE_UYU_PER_USD;
    }
  }
  return totalUsd;
}

function hasRelevantUpcomingPayments(pulse: TodayBusinessPulse): boolean {
  return pulse.projection30dBlocks.some(
    (b) => b.hasConfiguredPayments && b.scheduledPayments > 0
  );
}

function hasOverdue30(pulse: TodayBusinessPulse, overdueCritical?: CarteraCurrencyTotals): boolean {
  const fromBlocks = pulse.currentStateBlocks.some((b) => (b.overdue30 ?? 0) > 0);
  if (fromBlocks) return true;
  return hasPositiveAmount(overdueCritical);
}

export function deriveOperationalSemaphore(input: {
  alerts: OperationalSemaphoreAlert[];
  pulse: TodayBusinessPulse | null;
  carteraAgingOverdue?: CarteraCurrencyTotals;
}): OperationalSemaphoreView {
  const alerts = input.alerts;
  const pulse = input.pulse;

  const criticalAlerts = alerts.filter((a) => a.severity === "critical");
  const highAlerts = alerts.filter((a) => a.severity === "high");
  const mediumAlerts = alerts.filter((a) => a.severity === "medium");

  const cashDeficit = pulse ? hasCashDeficitAfterPayments(pulse) : false;
  const consolidatedCashUsd = pulse ? consolidatedSafeCash30dUsd(pulse) : null;
  // Déficit real: alguna moneda en negativo Y el consolidado USD también es negativo
  const consolidatedDeficit =
    cashDeficit && (consolidatedCashUsd === null || consolidatedCashUsd < 0);
  // Cubierto consolidado: alguna moneda en negativo pero el consolidado es positivo
  const consolidatedCovered =
    cashDeficit && consolidatedCashUsd !== null && consolidatedCashUsd >= 0;

  const attentionClients = pulse?.clientCounts.attentionClients ?? 0;
  const overdue30 = pulse ? hasOverdue30(pulse, input.carteraAgingOverdue) : false;
  const upcomingPayments = pulse ? hasRelevantUpcomingPayments(pulse) : false;
  const dataPending = Boolean(pulse?.dataWarning);

  const criticalItems: string[] = criticalAlerts.map((a) => a.title);
  if (consolidatedDeficit) {
    criticalItems.push("Caja proyectada en negativo");
  }

  // Real alert items — no business signals mixed in.
  const highItems: string[] = highAlerts.map((a) => a.title);
  const mediumItems: string[] = mediumAlerts.map((a) => a.title);

  // Business/operative signals — separate from formal alerts.
  const operativeItems: string[] = [];
  if (consolidatedCovered) {
    operativeItems.push("Caja consolidada cubierta en USD equivalente");
  }
  if (attentionClients > 0) {
    operativeItems.push(
      `${attentionClients} ${attentionClients === 1 ? "cliente" : "clientes"} con atraso o señales de demora`
    );
  }
  if (overdue30 && attentionClients === 0) {
    operativeItems.push("Deuda atrasada mayor a 30 días");
  }
  if (upcomingPayments) {
    operativeItems.push("Pagos programados en los próximos 30 días");
  }
  if (dataPending) {
    operativeItems.push("Datos secundarios pendientes de actualización");
  }

  let level: OperationalSemaphoreLevel = "ok";
  if (criticalAlerts.length > 0 || consolidatedDeficit) {
    level = "critical";
  } else if (
    consolidatedCovered ||
    attentionClients > 0 ||
    overdue30 ||
    upcomingPayments ||
    dataPending ||
    highAlerts.length > 0 ||
    mediumAlerts.length > 0
  ) {
    level = "attention";
  }

  const criticalCount = criticalAlerts.length;
  const highCount = highAlerts.length;
  const mediumCount = mediumAlerts.length;

  // attentionClients ya aparece como item descriptivo en highItems.
  // No se infla el contador numérico.
  const attentionSignals =
    (attentionClients > 0 ? 1 : 0) +
    (overdue30 && attentionClients === 0 ? 1 : 0) +
    (upcomingPayments ? 1 : 0) +
    (dataPending ? 1 : 0);
  const totalSignals = highCount + mediumCount + attentionSignals;

  const statusLabel =
    level === "critical" ? "Crítico" : level === "attention" ? "Atención" : "OK";

  const counterLine =
    level === "ok"
      ? "Sin alertas activas"
      : criticalCount > 0
        ? `${criticalCount} crítica${criticalCount === 1 ? "" : "s"} · ${highCount} alta${highCount === 1 ? "" : "s"} · ${mediumCount} media${mediumCount === 1 ? "" : "s"}`
        : `${totalSignals} señal${totalSignals === 1 ? "" : "es"} de atención`;

  let primaryReason: string;
  if (level === "critical") {
    primaryReason = "Déficit de caja proyectado. Revisá pagos programados y tesorería.";
  } else if (level === "attention") {
    if (consolidatedCovered && attentionClients === 0 && !overdue30 && !dataPending && highAlerts.length === 0 && mediumAlerts.length === 0) {
      primaryReason = "Caja consolidada cubierta en USD equivalente.";
    } else {
      primaryReason =
        "No hay déficit de caja, pero hay señales que conviene revisar.";
    }
  } else {
    primaryReason = "No hay señales críticas para resolver ahora.";
  }

  // CTA points to the most relevant destination given the primary cause.
  let ctaHref: string;
  let ctaLabel: string;
  if (level === "ok") {
    ctaHref = "/copilot/hoy";
    ctaLabel = "Ver Hoy";
  } else if (criticalAlerts.length > 0 || highAlerts.length > 0 || mediumAlerts.length > 0) {
    ctaHref = "/copilot/alertas?source=operational";
    ctaLabel = "Ver alertas";
  } else if (attentionClients > 0) {
    ctaHref = "/copilot/clientes";
    ctaLabel = "Ver cartera de clientes";
  } else if (cashDeficit || upcomingPayments) {
    ctaHref = "/copilot/tesoreria";
    ctaLabel = "Ver tesorería";
  } else {
    ctaHref = "/copilot/alertas";
    ctaLabel = "Ver alertas";
  }

  return {
    level,
    statusLabel,
    criticalCount,
    highCount,
    mediumCount,
    counterLine,
    primaryReason,
    criticalItems,
    highItems,
    mediumItems,
    operativeItems,
    ctaHref,
    ctaLabel,
  };
}
