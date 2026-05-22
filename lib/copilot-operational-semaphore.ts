/**
 * Semáforo operacional global del header Copilot — derivación UI (v1).
 */

import type { FiscalAlertItem } from "@/lib/copilot-tax-alerts";
import type { CarteraCurrencyTotals } from "@/lib/copilot-cartera-aging-totals";
import type { TodayBusinessPulse } from "@/lib/copilot-today-business-pulse";

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
  criticalItems: string[];
  highItems: string[];
  mediumItems: string[];
  ctaHref: string;
  ctaLabel: string;
};

function sumTotals(t: CarteraCurrencyTotals | undefined): number {
  if (!t) return 0;
  return (t.UYU ?? 0) + (t.USD ?? 0);
}

function hasCashDeficitAfterPayments(pulse: TodayBusinessPulse): boolean {
  return pulse.projection30dBlocks.some(
    (b) => b.hasConfiguredPayments && b.safeCash30d < 0
  );
}

function hasRelevantUpcomingPayments(pulse: TodayBusinessPulse): boolean {
  return pulse.projection30dBlocks.some(
    (b) => b.hasConfiguredPayments && b.scheduledPayments > 0
  );
}

function hasOverdue30(pulse: TodayBusinessPulse, overdueCritical?: CarteraCurrencyTotals): number {
  const fromBlocks = pulse.currentStateBlocks.reduce((s, b) => s + (b.overdue30 ?? 0), 0);
  if (fromBlocks > 0) return fromBlocks;
  return sumTotals(overdueCritical);
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
  const attentionClients = pulse?.clientCounts.attentionClients ?? 0;
  const overdue30 = pulse ? hasOverdue30(pulse, input.carteraAgingOverdue) : 0;
  const upcomingPayments = pulse ? hasRelevantUpcomingPayments(pulse) : false;
  const dataPending = Boolean(pulse?.dataWarning);

  const criticalItems: string[] = criticalAlerts.map((a) => a.title);
  if (cashDeficit) {
    criticalItems.push("Caja después de pagos en negativo");
  }

  const highItems: string[] = highAlerts.map((a) => a.title);
  if (attentionClients > 0) {
    highItems.push(
      `${attentionClients} ${attentionClients === 1 ? "cliente" : "clientes"} con atraso o señales de demora`
    );
  }

  const mediumItems: string[] = mediumAlerts.map((a) => a.title);
  if (overdue30 > 0 && attentionClients === 0) {
    mediumItems.push("Saldo vencido mayor a 30 días");
  }
  if (upcomingPayments) {
    mediumItems.push("Pagos programados en los próximos 30 días");
  }
  if (dataPending) {
    mediumItems.push("Datos secundarios pendientes de actualización");
  }

  let level: OperationalSemaphoreLevel = "ok";
  if (criticalAlerts.length > 0 || cashDeficit) {
    level = "critical";
  } else if (
    attentionClients > 0 ||
    overdue30 > 0 ||
    upcomingPayments ||
    dataPending ||
    highAlerts.length > 0 ||
    mediumAlerts.length > 0
  ) {
    level = "attention";
  }

  const criticalCount = criticalAlerts.length;
  let highCount = highAlerts.length;
  if (attentionClients > 0 && highCount === 0) {
    highCount = 1;
  }

  const mediumCount = mediumAlerts.length;

  const statusLabel =
    level === "critical" ? "Crítico" : level === "attention" ? "Atención" : "OK";

  const counterLine = `${criticalCount} crítica${criticalCount === 1 ? "" : "s"} · ${highCount} alta${highCount === 1 ? "" : "s"}`;

  let primaryReason: string;
  if (level === "critical") {
    if (cashDeficit && criticalAlerts.length === 0) {
      primaryReason = "La caja proyectada queda en negativo después de los pagos programados.";
    } else if (criticalAlerts.length > 0) {
      primaryReason = criticalAlerts[0]!.title;
    } else {
      primaryReason = "Hay señales críticas que requieren acción inmediata.";
    }
  } else if (level === "attention") {
    if (attentionClients > 0 && !cashDeficit) {
      primaryReason =
        "No hay riesgo de caja inmediato, pero hay clientes con atraso.";
    } else if (upcomingPayments) {
      primaryReason = "Hay pagos próximos que conviene revisar en Tesorería.";
    } else if (dataPending) {
      primaryReason = "Los saldos principales están disponibles; algunos datos secundarios siguen actualizándose.";
    } else if (highAlerts.length > 0) {
      primaryReason = highAlerts[0]!.title;
    } else {
      primaryReason = "Hay señales operativas que conviene revisar hoy.";
    }
  } else {
    primaryReason = "No hay alertas críticas ni altas. Podés arrancar tranquilo.";
  }

  const ctaHref =
    level === "ok" ? "/copilot/hoy" : "/copilot/alertas?source=operational";

  const ctaLabel = level === "ok" ? "Ver Hoy" : "Ver alertas";

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
    ctaHref,
    ctaLabel,
  };
}
