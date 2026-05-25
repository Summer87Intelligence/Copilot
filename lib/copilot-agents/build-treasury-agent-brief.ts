/**
 * Agente de Tesorería — builder puro.
 * Sin LLM, sin Supabase, sin Zeta. Solo reglas determinísticas sobre notificaciones.
 *
 * Detecta (en orden de prioridad):
 * A) Pagos vencidos              → severity: critical
 * B) Riesgo de caja              → severity: critical
 * C) Pago que vence hoy          → severity: high
 * D) Pagos en próximos 1-3 días  → severity: high (1d) | medium (3d)
 * E) Pagos en próximos 7 días    → severity: medium (solo si hay espacio)
 *
 * NO modifica pagos. NO toca caja. NO ejecuta acciones.
 * Solo lee notificaciones y guía al usuario al módulo correcto.
 */

import type { CopilotNotification } from "@/lib/copilot-notifications/notification-types";
import type { CopilotAgentBrief, CopilotAgentPriority } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

type DueMilestone = "today" | "1d" | "3d" | "7d";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function unread(notifications: CopilotNotification[], type: string): CopilotNotification[] {
  return notifications.filter((n) => n.type === type && !n.read_at);
}

function getMilestone(n: CopilotNotification): DueMilestone | null {
  if (n.dedup_key) {
    if (n.dedup_key.endsWith(":today")) return "today";
    if (n.dedup_key.endsWith(":1d")) return "1d";
    if (n.dedup_key.endsWith(":3d")) return "3d";
    if (n.dedup_key.endsWith(":7d")) return "7d";
  }
  // Fallback: parse body
  const body = n.body ?? "";
  if (body.includes("vence hoy")) return "today";
  if (body.includes("vence mañana")) return "1d";
  if (body.includes("vence en")) return "3d";
  return null;
}

function pickAmount(
  notifications: CopilotNotification[]
): { amount: number; currency: "UYU" | "USD" } | Record<never, never> {
  const sorted = [...notifications].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
  const top = sorted[0];
  if (top?.amount != null && top?.currency) {
    return { amount: top.amount, currency: top.currency as "UYU" | "USD" };
  }
  return {};
}

function plural(n: number, sing: string, plur: string): string {
  return n === 1 ? `un ${sing}` : `${n} ${plur}`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildTreasuryAgentBrief(
  notifications: CopilotNotification[]
): CopilotAgentBrief {
  const priorities: CopilotAgentPriority[] = [];

  // A) Pagos vencidos → critical
  const overduePayments = unread(notifications, "treasury_payment_overdue");
  if (overduePayments.length > 0) {
    const count = overduePayments.length;
    priorities.push({
      id: "treasury-overdue",
      agentId: "treasury",
      title: count === 1 ? "Revisar pago vencido" : `Revisar ${count} pagos vencidos`,
      reason:
        overduePayments[0].body ??
        `Hay ${plural(count, "pago vencido", "pagos vencidos")} que requiere${count !== 1 ? "n" : ""} revisión.`,
      severity: "critical",
      ...pickAmount(overduePayments),
      href: "/copilot/tesoreria?section=pagos",
      ctaLabel: "Ver pagos",
    });
  }

  // B) Riesgo de caja → critical
  const cashRisk = unread(notifications, "cash_risk_detected");
  if (cashRisk.length > 0 && priorities.length < 5) {
    priorities.push({
      id: "treasury-cash-risk",
      agentId: "treasury",
      title: "Revisar caja después de compromisos",
      reason:
        cashRisk[0].body ??
        "La caja puede quedar ajustada después de los pagos próximos.",
      severity: "critical",
      ...pickAmount(cashRisk),
      href: "/copilot/tesoreria",
      ctaLabel: "Ver tesorería",
    });
  }

  const duePayments = unread(notifications, "treasury_payment_due");

  // C) Pago que vence hoy → high
  const dueToday = duePayments.filter((n) => getMilestone(n) === "today");
  if (dueToday.length > 0 && priorities.length < 5) {
    const count = dueToday.length;
    priorities.push({
      id: "treasury-due-today",
      agentId: "treasury",
      title:
        count === 1
          ? "Confirmar pago que vence hoy"
          : `Confirmar ${count} pagos que vencen hoy`,
      reason: dueToday[0].body ?? "Hay un pago programado para hoy.",
      severity: "high",
      ...pickAmount(dueToday),
      href: "/copilot/tesoreria?section=pagos",
      ctaLabel: "Ver pagos",
    });
  }

  // D) Pagos en próximos 1-3 días → high (1d) | medium (3d)
  const dueNear = duePayments.filter((n) => {
    const m = getMilestone(n);
    return m === "1d" || m === "3d";
  });
  if (dueNear.length > 0 && priorities.length < 5) {
    const count = dueNear.length;
    const has1d = dueNear.some((n) => getMilestone(n) === "1d");
    priorities.push({
      id: "treasury-due-near",
      agentId: "treasury",
      title: "Revisar pagos próximos",
      reason:
        dueNear[0].body ??
        `Hay ${plural(count, "compromiso de caja", "compromisos de caja")} en los próximos días.`,
      severity: has1d ? "high" : "medium",
      ...pickAmount(dueNear),
      href: "/copilot/tesoreria?section=pagos",
      ctaLabel: "Ver pagos",
    });
  }

  // E) Pagos en próximos 7 días → medium (solo si hay espacio)
  const due7d = duePayments.filter((n) => getMilestone(n) === "7d");
  if (due7d.length > 0 && priorities.length < 5) {
    const count = due7d.length;
    priorities.push({
      id: "treasury-due-week",
      agentId: "treasury",
      title: "Revisar obligaciones de la semana",
      reason: `Hay ${plural(count, "compromiso", "compromisos")} de pago en los próximos 7 días.`,
      severity: "medium",
      ...pickAmount(due7d),
      href: "/copilot/tesoreria?section=pagos",
      ctaLabel: "Ver pagos",
    });
  }

  const topPriorities = priorities.slice(0, 5);

  const hasCritical = topPriorities.some((p) => p.severity === "critical");
  const hasHigh = topPriorities.some((p) => p.severity === "high");
  const status: CopilotAgentBrief["status"] =
    hasCritical
      ? "critical"
      : hasHigh || topPriorities.length > 0
      ? "attention"
      : "stable";

  return {
    agentId: "treasury",
    title: "Tesorería",
    status,
    summary: buildTreasurySummary(status, topPriorities),
    priorities: topPriorities,
    nextBestAction:
      topPriorities.length > 0
        ? { label: topPriorities[0].ctaLabel, href: topPriorities[0].href }
        : { label: "Ver tesorería", href: "/copilot/tesoreria" },
  };
}

// ─── Summary ──────────────────────────────────────────────────────────────────

function buildTreasurySummary(
  status: CopilotAgentBrief["status"],
  priorities: CopilotAgentPriority[]
): string {
  if (status === "critical") {
    const hasCashRisk = priorities.some((p) => p.id === "treasury-cash-risk");
    const hasOverdue = priorities.some((p) => p.id === "treasury-overdue");
    if (hasCashRisk && hasOverdue) {
      return "Hay pagos vencidos y riesgo de caja. Revisá Tesorería hoy.";
    }
    if (hasCashRisk) {
      return "La caja puede quedar ajustada después de los pagos próximos.";
    }
    return "Hay pagos vencidos que requieren revisión urgente.";
  }
  if (status === "attention") {
    const hasDueToday = priorities.some((p) => p.id === "treasury-due-today");
    const hasNear = priorities.some((p) => p.id === "treasury-due-near");
    if (hasDueToday) {
      return "Hay pagos programados para hoy. Confirmá antes de cerrar el día.";
    }
    if (hasNear) {
      return "Hay compromisos de pago en los próximos días para revisar.";
    }
    return "Hay compromisos de caja para revisar esta semana.";
  }
  return "Sin pagos críticos detectados. Revisá Tesorería para ver el detalle de caja y compromisos.";
}
