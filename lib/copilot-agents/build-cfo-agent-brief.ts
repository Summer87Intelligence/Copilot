/**
 * Agente CFO / Finanzas — builder puro.
 * Sin LLM, sin Supabase, sin Zeta. Lee señales disponibles.
 *
 * Detecta (en orden de prioridad):
 * A) Liquidez crítica o caja en riesgo    → severity: critical | high
 * B) Datos que afectan la lectura         → severity: high | medium
 * C) Cartera vencida relevante            → severity: high | medium
 * D) Egresos próximos / compromisos       → severity: high | medium
 * E) Datos parciales del snapshot         → severity: medium
 *
 * NO modifica datos. NO toca pagos. NO inventa montos.
 * Solo lee señales y guía al usuario al módulo correcto.
 */

import type { CopilotNotification } from "@/lib/copilot-notifications/notification-types";
import type { FinancialSnapshotApiV1 } from "@/lib/copilot-financial-engine";
import {
  snapshotCoverageRatio,
  snapshotIsTruncated,
  snapshotLiquidityBalance,
  snapshotRiskBand,
} from "@/lib/copilot-financial-snapshot-selectors";
import type { CopilotAgentBrief, CopilotAgentPriority } from "./types";

// ─── Input ────────────────────────────────────────────────────────────────────

export type BuildCfoAgentBriefInput = {
  notifications?: CopilotNotification[];
  financialSnapshot?: FinancialSnapshotApiV1 | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function unread(notifications: CopilotNotification[], type: string): CopilotNotification[] {
  return notifications.filter((n) => n.type === type && !n.read_at);
}

function pickAmount(
  n: CopilotNotification
): { amount: number; currency: "UYU" | "USD" } | Record<never, never> {
  if (n.amount != null && n.currency) {
    return { amount: n.amount, currency: n.currency as "UYU" | "USD" };
  }
  return {};
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildCfoAgentBrief(
  input: BuildCfoAgentBriefInput = {}
): CopilotAgentBrief {
  const notifications = input.notifications ?? [];
  const snapshot = input.financialSnapshot ?? null;
  const priorities: CopilotAgentPriority[] = [];

  // A) Liquidez desde snapshot financiero
  if (snapshot) {
    const riskBand = snapshotRiskBand(snapshot);
    const liquidityBalance = snapshotLiquidityBalance(snapshot);
    const coverageRatio = snapshotCoverageRatio(snapshot);

    if (riskBand === "critical" || liquidityBalance < 0) {
      priorities.push({
        id: "cfo-liquidity-critical",
        agentId: "cfo",
        title: "Revisar liquidez",
        reason:
          liquidityBalance < 0
            ? "El balance proyectado es negativo. Revisá la cobertura antes de asumir nuevos compromisos."
            : "La caja o el balance proyectado requieren revisión antes de asumir nuevos compromisos.",
        severity: "critical",
        href: "/copilot/finanzas",
        ctaLabel: "Ver Finanzas",
      });
    } else if (riskBand === "high") {
      priorities.push({
        id: "cfo-liquidity-high",
        agentId: "cfo",
        title: "Revisar liquidez",
        reason:
          coverageRatio < 1.0
            ? "La cobertura de egresos es baja. Confirmá la disponibilidad de caja antes de nuevos compromisos."
            : "La liquidez requiere seguimiento esta semana.",
        severity: "high",
        href: "/copilot/finanzas",
        ctaLabel: "Ver Finanzas",
      });
    }
  }

  // A2) Cash risk desde notificaciones — solo si no hay prioridad de liquidez del snapshot
  const cashRisk = unread(notifications, "cash_risk_detected");
  const hasLiquidityPriority = priorities.some(
    (p) => p.id === "cfo-liquidity-critical" || p.id === "cfo-liquidity-high"
  );
  if (cashRisk.length > 0 && !hasLiquidityPriority) {
    priorities.push({
      id: "cfo-cash-risk",
      agentId: "cfo",
      title: "Revisar liquidez",
      reason:
        cashRisk[0].body ??
        "Los egresos próximos pueden superar la caja disponible.",
      severity: "critical",
      href: "/copilot/finanzas",
      ctaLabel: "Ver Finanzas",
    });
  }

  // B) Datos que afectan la lectura financiera
  const syncFailed = unread(notifications, "sync_failed");
  if (syncFailed.length > 0 && priorities.length < 5) {
    const hasCritical = syncFailed.some((n) => n.severity === "critical");
    priorities.push({
      id: "cfo-data-integrity",
      agentId: "cfo",
      title: "Validar datos antes de decidir",
      reason:
        "Hay señales de actualización de datos que pueden afectar la lectura financiera.",
      severity: hasCritical ? "high" : "medium",
      href: "/copilot/operacional",
      ctaLabel: "Ver Operacional",
    });
  }

  // C) Cartera vencida
  const overdueClients = unread(notifications, "client_overdue");
  if (overdueClients.length > 0 && priorities.length < 5) {
    const hasCritical = overdueClients.some((n) => n.severity === "critical");
    const count = overdueClients.length;
    priorities.push({
      id: "cfo-cartera-vencida",
      agentId: "cfo",
      title: "Revisar cartera vencida",
      reason:
        count === 1
          ? "Hay un cliente con saldo vencido que puede afectar la cobranza esperada."
          : `Hay ${count} clientes con saldo vencido que pueden afectar la cobranza esperada.`,
      severity: hasCritical ? "high" : "medium",
      href: "/copilot/cartera",
      ctaLabel: "Ver Cartera",
    });
  }

  // D) Egresos próximos — overdue primero, luego due
  const paymentOverdue = unread(notifications, "treasury_payment_overdue");
  const paymentDue = unread(notifications, "treasury_payment_due");
  if ((paymentOverdue.length > 0 || paymentDue.length > 0) && priorities.length < 5) {
    const count = paymentOverdue.length + paymentDue.length;
    const topNotif = paymentOverdue[0] ?? paymentDue[0];
    const amountEntry = pickAmount(topNotif);
    priorities.push({
      id: "cfo-egresos",
      agentId: "cfo",
      title: "Revisar egresos proyectados",
      reason:
        count === 1
          ? "Hay un compromiso de pago que puede impactar el flujo de caja."
          : `Hay ${count} compromisos de pago que pueden impactar el flujo de caja.`,
      severity: paymentOverdue.length > 0 ? "high" : "medium",
      ...amountEntry,
      href: "/copilot/tesoreria?section=pagos",
      ctaLabel: "Ver Tesorería",
    });
  }

  // E) Snapshot parcial — solo si hay espacio y el snapshot existe
  if (snapshot && snapshotIsTruncated(snapshot) && priorities.length < 5) {
    priorities.push({
      id: "cfo-data-partial",
      agentId: "cfo",
      title: "Validar datos antes de decidir",
      reason:
        "Los datos financieros pueden estar parciales. Confirmá en Finanzas antes de actuar.",
      severity: "medium",
      href: "/copilot/finanzas",
      ctaLabel: "Ver Finanzas",
    });
  }

  const topPriorities = priorities.slice(0, 5);

  const hasCritical = topPriorities.some((p) => p.severity === "critical");
  const hasHighOrMedium = topPriorities.some(
    (p) => p.severity === "high" || p.severity === "medium"
  );
  const status: CopilotAgentBrief["status"] = hasCritical
    ? "critical"
    : hasHighOrMedium
    ? "attention"
    : "stable";

  return {
    agentId: "cfo",
    title: "CFO / Finanzas",
    status,
    summary: buildCfoSummary(status, topPriorities),
    priorities: topPriorities,
    nextBestAction:
      topPriorities.length > 0
        ? { label: topPriorities[0].ctaLabel, href: topPriorities[0].href }
        : { label: "Ver Finanzas", href: "/copilot/finanzas" },
  };
}

// ─── Summary ──────────────────────────────────────────────────────────────────

function buildCfoSummary(
  status: CopilotAgentBrief["status"],
  priorities: CopilotAgentPriority[]
): string {
  if (status === "critical") {
    const hasLiquidity = priorities.some(
      (p) => p.id === "cfo-liquidity-critical" || p.id === "cfo-cash-risk"
    );
    if (hasLiquidity) {
      return "La situación financiera requiere revisión inmediata. La liquidez o la caja necesitan atención.";
    }
    return "La situación financiera requiere revisión inmediata por liquidez, deuda vencida o datos críticos.";
  }
  if (status === "attention") {
    const hasCartera = priorities.some((p) => p.id === "cfo-cartera-vencida");
    const hasEgresos = priorities.some((p) => p.id === "cfo-egresos");
    const hasData = priorities.some((p) => p.id === "cfo-data-integrity");
    if (hasCartera && hasEgresos) {
      return "La situación requiere atención: hay deuda vencida y compromisos de pago para revisar.";
    }
    if (hasCartera) {
      return "La situación requiere atención: hay deuda vencida que puede afectar la cobranza esperada.";
    }
    if (hasEgresos) {
      return "La situación requiere atención: hay compromisos próximos que pueden impactar el flujo de caja.";
    }
    if (hasData) {
      return "Hay señales de actualización que conviene validar antes de tomar decisiones financieras.";
    }
    return "La situación requiere atención: hay indicadores financieros para monitorear.";
  }
  return "La situación financiera se ve estable. No hay señales críticas de liquidez, cartera o datos.";
}
