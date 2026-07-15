import type { ModuleKey } from "@/lib/auth/module-permissions";
import type { ClientPortfolioRow } from "@/lib/copilot-clients-portfolio";
import type { PipelineHealthSummary } from "@/lib/data/zeta-pipeline-health";
import type { CopilotNotification } from "@/lib/copilot-notifications/notification-types";
import { getOperatingDelayBucket } from "@/lib/copilot/operating-aging";
import type { TaskRecommendation } from "@/lib/tasks/unified-task-feed";

function clampTitle(value: string): string {
  return value.trim().slice(0, 180);
}

function maxOverdueDays(row: Pick<ClientPortfolioRow, "overdue_days_uyu" | "overdue_days_usd">): number {
  return Math.max(0, row.overdue_days_uyu ?? 0, row.overdue_days_usd ?? 0);
}

function impactBucketByDays(days: number): "low" | "medium" | "high" {
  if (days >= 30) return "high";
  if (days >= 15) return "medium";
  return "low";
}

function priorityByDays(days: number): "medium" | "high" {
  return days >= 15 ? "high" : "medium";
}

function moneyImpact(row: Pick<ClientPortfolioRow, "overdue_uyu" | "overdue_usd">) {
  const currencies: Partial<Record<"UYU" | "USD", number>> = {};
  if ((row.overdue_uyu ?? 0) > 0) currencies.UYU = row.overdue_uyu ?? 0;
  if ((row.overdue_usd ?? 0) > 0) currencies.USD = row.overdue_usd ?? 0;
  return currencies;
}

function daysText(days: number): string {
  return `${days} día${days === 1 ? "" : "s"}`;
}

export function buildCobranzaRecommendations(input: {
  workspaceId: string;
  rows: readonly ClientPortfolioRow[];
  generatedAt: string;
  businessDate: string;
}): TaskRecommendation[] {
  return input.rows
    .filter((row) => (row.overdue_uyu ?? 0) > 0 || (row.overdue_usd ?? 0) > 0)
    .map((row) => {
      const days = maxOverdueDays(row);
      const bucket = getOperatingDelayBucket(days);
      const reason =
        days > 0
          ? `Presenta saldo con ${daysText(days)} de atraso y conviene registrar el próximo paso.`
          : "Presenta saldo atrasado y conviene registrar el próximo paso.";
      return {
        stableKey: `collection:client:${row.company_id}:overdue:${bucket}`,
        workspaceId: input.workspaceId,
        moduleKey: "cobranza" as ModuleKey,
        title: clampTitle(`Contactar a ${row.name}`),
        description: reason,
        reason,
        priority: priorityByDays(days),
        dueDate: input.businessDate,
        sourceType: "client",
        sourceId: row.company_id,
        actionUrl: `/copilot/clientes/${row.company_id}#gestion-cobranza`,
        suggestedAssigneeUserId: null,
        generatedAt: input.generatedAt,
        businessDate: input.businessDate,
        originLabel: "Cobranza",
        entityLabel: row.name,
        confidence: 0.86,
        impact: {
          bucket: impactBucketByDays(days),
          currencies: moneyImpact(row),
          overdueDays: days,
        },
      } satisfies TaskRecommendation;
    })
    .sort((a, b) => (b.impact?.overdueDays ?? 0) - (a.impact?.overdueDays ?? 0))
    .slice(0, 20);
}

export function buildClientesRecommendations(input: {
  workspaceId: string;
  rows: readonly ClientPortfolioRow[];
  generatedAt: string;
  businessDate: string;
}): TaskRecommendation[] {
  return input.rows
    .filter((row) => !row.has_contact_data)
    .slice(0, 20)
    .map((row) => {
      const hasDebt = (row.debt_uyu ?? 0) > 0 || (row.debt_usd ?? 0) > 0;
      return {
        stableKey: `client:${row.company_id}:missing-contact`,
        workspaceId: input.workspaceId,
        moduleKey: "clientes" as ModuleKey,
        title: clampTitle(`Completar datos de contacto de ${row.name}`),
        description: "El cliente no tiene datos de contacto suficientes para coordinar gestiones.",
        reason: "Falta información de contacto real en la ficha del cliente.",
        priority: hasDebt ? "medium" : "low",
        dueDate: input.businessDate,
        sourceType: "client",
        sourceId: row.company_id,
        actionUrl: `/copilot/clientes/${row.company_id}#contactos`,
        suggestedAssigneeUserId: null,
        generatedAt: input.generatedAt,
        businessDate: input.businessDate,
        originLabel: "Clientes",
        entityLabel: row.name,
        confidence: 0.78,
        impact: { bucket: hasDebt ? "medium" : "low" },
      };
    });
}

export function buildAlertRecommendations(input: {
  workspaceId: string;
  notifications: readonly CopilotNotification[];
  generatedAt: string;
  businessDate: string;
}): TaskRecommendation[] {
  return input.notifications
    .filter((n) => !n.read_at && (n.severity === "critical" || n.severity === "warning"))
    .slice(0, 20)
    .map((n) => ({
      stableKey: `alert:${n.id}:review:${n.severity}`,
      workspaceId: input.workspaceId,
      moduleKey: "hoy" as ModuleKey,
      title: clampTitle(`Revisar alerta: ${n.title}`),
      description: n.body ?? "Hay una alerta pendiente que requiere revisión.",
      reason:
        n.severity === "critical"
          ? "La alerta está marcada como crítica y sigue pendiente."
          : "La alerta sigue pendiente y conviene revisarla.",
      priority: n.severity === "critical" ? "high" : "medium",
      dueDate: input.businessDate,
      sourceType: "alert",
      sourceId: n.id,
      actionUrl: n.action_href ?? "/copilot/alertas",
      suggestedAssigneeUserId: null,
      generatedAt: input.generatedAt,
      businessDate: input.businessDate,
      originLabel: "Alertas",
      entityLabel: n.entity_type === "client" && n.entity_id ? "Cliente relacionado" : "Alerta",
      confidence: n.severity === "critical" ? 0.9 : 0.75,
      impact: { bucket: n.severity === "critical" ? "high" : "medium" },
    }));
}

export function buildDataRecommendations(input: {
  workspaceId: string;
  health: readonly PipelineHealthSummary[];
  generatedAt: string;
  businessDate: string;
}): TaskRecommendation[] {
  return input.health
    .filter((h) => h.status === "degraded" || h.status === "stalled" || h.consecutive_failures > 0)
    .slice(0, 12)
    .map((h) => ({
      stableKey: `data:pipeline:${h.pipeline_name}:review:${h.status}`,
      workspaceId: input.workspaceId,
      moduleKey: "datos" as ModuleKey,
      title: `Revisar actualización de datos de ${h.pipeline_name}`,
      description: "Una fuente de datos necesita revisión para mantener la información actualizada.",
      reason:
        h.status === "stalled"
          ? "La última actualización correcta está fuera del intervalo esperado."
          : "La fuente tuvo fallos recientes o quedó degradada.",
      priority: h.status === "stalled" ? "high" : "medium",
      dueDate: input.businessDate,
      sourceType: "data_pipeline",
      sourceId: null,
      actionUrl: "/copilot/datos",
      suggestedAssigneeUserId: null,
      generatedAt: input.generatedAt,
      businessDate: input.businessDate,
      originLabel: "Datos",
      entityLabel: h.pipeline_name,
      confidence: 0.82,
      impact: { bucket: h.status === "stalled" ? "high" : "medium" },
    }));
}
