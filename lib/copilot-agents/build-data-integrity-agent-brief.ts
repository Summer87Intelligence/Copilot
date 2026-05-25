/**
 * Agente de Integridad de Datos — builder puro.
 * Sin LLM, sin Supabase, sin Zeta. Lee señales disponibles.
 *
 * Detecta (en orden de prioridad):
 * A) sync_failed crítico                → severity: critical
 * B) sync_failed warning                → severity: high
 * C) Salud operacional crítica/degradada → severity: critical | high
 * D) Violaciones de datos abiertas      → severity: high | medium
 * E) sync_failed informativo            → severity: medium
 *
 * NO modifica datos. NO reinicia crons. NO toca Zeta.
 * Solo lee señales y guía al usuario a /copilot/operacional.
 */

import type { CopilotNotification } from "@/lib/copilot-notifications/notification-types";
import type { OicHealthDashboardData } from "@/lib/operacional/types";
import type { CopilotAgentBrief, CopilotAgentPriority } from "./types";

// ─── Input ────────────────────────────────────────────────────────────────────

export type BuildDataIntegrityAgentBriefInput = {
  notifications?: CopilotNotification[];
  operationalHealth?: OicHealthDashboardData | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function unread(notifications: CopilotNotification[], type: string): CopilotNotification[] {
  return notifications.filter((n) => n.type === type && !n.read_at);
}

function isExternalSignal(n: CopilotNotification): boolean {
  const text = ((n.body ?? "") + " " + (n.title ?? "")).toLowerCase();
  return (
    text.includes("zeta") ||
    text.includes("api") ||
    text.includes("externo") ||
    text.includes("externa") ||
    text.includes("http")
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildDataIntegrityAgentBrief(
  input: BuildDataIntegrityAgentBriefInput = {}
): CopilotAgentBrief {
  const notifications = input.notifications ?? [];
  const health = input.operationalHealth ?? null;
  const priorities: CopilotAgentPriority[] = [];

  // A+B+E) sync_failed → agrupadas en una sola prioridad (la más grave gana)
  const syncFailed = unread(notifications, "sync_failed");
  if (syncFailed.length > 0) {
    const hasCritical = syncFailed.some((n) => n.severity === "critical");
    const hasWarning = syncFailed.some((n) => n.severity === "warning");
    const severity = hasCritical ? "critical" : hasWarning ? "high" : "medium";
    const count = syncFailed.length;
    const hasExternal = syncFailed.some(isExternalSignal);

    const reason = hasExternal
      ? count > 1
        ? `Hay ${count} señales de actualización. Una fuente externa puede estar fallando. Copilot conserva los últimos datos disponibles.`
        : "La integración externa puede estar fallando. Copilot conserva los últimos datos disponibles."
      : count > 1
      ? `Hay ${count} señales de actualización que requieren revisión.`
      : "Hay señales de que una sincronización necesita revisión.";

    priorities.push({
      id: "data-integrity-sync-failed",
      agentId: "data_integrity",
      title:
        hasCritical
          ? "Revisar actualización de datos"
          : "Revisar datos pendientes de actualización",
      reason,
      severity,
      href: "/copilot/operacional",
      ctaLabel: "Ver operacional",
    });
  }

  // C) Salud operacional — solo si quedan slots y hay señal real
  if (health && priorities.length < 5) {
    const oicSev = health.severity;
    if (oicSev === "critical") {
      priorities.push({
        id: "data-integrity-health-critical",
        agentId: "data_integrity",
        title: "Revisar proceso de actualización",
        reason: "Una fuente de datos no se actualizó dentro de la ventana esperada.",
        severity: "critical",
        href: "/copilot/operacional",
        ctaLabel: "Ver operacional",
      });
    } else if (oicSev === "degraded") {
      priorities.push({
        id: "data-integrity-health-degraded",
        agentId: "data_integrity",
        title: "Revisar proceso de actualización",
        reason: "Una fuente de datos no se actualizó dentro de la ventana esperada.",
        severity: "high",
        href: "/copilot/operacional",
        ctaLabel: "Ver operacional",
      });
    } else if (oicSev === "warning") {
      priorities.push({
        id: "data-integrity-health-warning",
        agentId: "data_integrity",
        title: "Revisar datos pendientes de actualización",
        reason: "Algunas lecturas pueden estar usando la última información disponible.",
        severity: "medium",
        href: "/copilot/operacional",
        ctaLabel: "Ver operacional",
      });
    }
  }

  // D) Violaciones abiertas — sólo si quedan slots y no ya cubierto
  if (health && health.openViolations > 0 && priorities.length < 5) {
    const v = health.openViolations;
    priorities.push({
      id: "data-integrity-violations",
      agentId: "data_integrity",
      title: "Revisar inconsistencias detectadas",
      reason:
        v === 1
          ? "Hay una inconsistencia detectada en los datos."
          : `Hay ${v} inconsistencias detectadas en los datos.`,
      severity: v > 5 ? "high" : "medium",
      href: "/copilot/operacional",
      ctaLabel: "Ver operacional",
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
    agentId: "data_integrity",
    title: "Integridad de datos",
    status,
    summary: buildDataIntegritySummary(status, topPriorities),
    priorities: topPriorities,
    nextBestAction: { label: "Ver operacional", href: "/copilot/operacional" },
  };
}

// ─── Summary ──────────────────────────────────────────────────────────────────

function buildDataIntegritySummary(
  status: CopilotAgentBrief["status"],
  priorities: CopilotAgentPriority[]
): string {
  if (status === "critical") {
    const hasSyncFailed = priorities.some((p) => p.id === "data-integrity-sync-failed");
    const hasHealthCritical = priorities.some((p) => p.id === "data-integrity-health-critical");
    if (hasSyncFailed || hasHealthCritical) {
      return "Hay problemas de actualización de datos que requieren revisión en Operacional.";
    }
    return "Los datos pueden estar desactualizados. Revisá Operacional para ver el detalle.";
  }
  if (status === "attention") {
    const hasSyncFailed = priorities.some((p) => p.id === "data-integrity-sync-failed");
    if (hasSyncFailed) {
      return "Hay señales de actualización que conviene revisar en Operacional.";
    }
    return "Algunas lecturas pueden depender de la última sincronización disponible.";
  }
  return "Los datos principales se ven actualizados. Operacional no muestra señales críticas.";
}
