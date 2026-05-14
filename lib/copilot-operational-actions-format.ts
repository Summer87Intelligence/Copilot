import type {
  OperationalActionOrigin,
  OperationalActionPriority,
  OperationalActionSlaStatus,
  OperationalActionStatus,
} from "@/lib/copilot-operational-actions-types";

const STATUS_LABELS: Record<OperationalActionStatus, string> = {
  pending: "Pendiente",
  in_progress: "En seguimiento",
  blocked: "Bloqueada",
  resolved: "Resuelta",
  dismissed: "Descartada",
};

const ORIGIN_LABELS: Record<OperationalActionOrigin, string> = {
  alert: "Alerta",
  treasury: "Tesorería",
  finance: "Finanzas",
  customer: "Cliente",
  insight: "Insight",
  manual: "Manual",
};

const PRIORITY_LABELS: Record<OperationalActionPriority, string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  follow_up: "Seguimiento",
  review_liquidity: "Revisar liquidez",
  review_coverage: "Revisar cobertura",
  reconcile_movement: "Revisar conciliación",
  register_payment: "Registrar pago",
  contact_customer: "Contactar cliente",
};

export function mapOperationalStatusLabel(status: OperationalActionStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function mapOperationalOriginLabel(origin: OperationalActionOrigin): string {
  return ORIGIN_LABELS[origin] ?? origin;
}

export function mapOperationalPriorityLabel(priority: OperationalActionPriority): string {
  return PRIORITY_LABELS[priority] ?? priority;
}

export function mapOperationalActionTypeLabel(actionType: string): string {
  const key = actionType.trim().toLowerCase();
  return ACTION_TYPE_LABELS[key] ?? actionType;
}

export function operationalStatusTone(
  status: OperationalActionStatus
): "neutral" | "warning" | "danger" | "success" {
  if (status === "pending") return "neutral";
  if (status === "in_progress") return "warning";
  if (status === "blocked") return "danger";
  if (status === "resolved") return "success";
  return "neutral";
}

export function operationalPriorityTone(
  priority: OperationalActionPriority
): "neutral" | "warning" | "danger" {
  if (priority === "critical") return "danger";
  if (priority === "high") return "warning";
  return "neutral";
}

const SLA_LABELS: Record<OperationalActionSlaStatus, string> = {
  overdue: "Vencida",
  due_today: "Vence hoy",
  due_soon: "Vence esta semana",
  no_due_date: "Sin fecha",
  ok: "En plazo",
};

export function mapOperationalSlaLabel(status: OperationalActionSlaStatus): string {
  return SLA_LABELS[status] ?? status;
}

export function operationalSlaTone(
  status: OperationalActionSlaStatus
): "neutral" | "warning" | "danger" | "success" {
  if (status === "overdue") return "danger";
  if (status === "due_today") return "warning";
  if (status === "due_soon") return "warning";
  if (status === "no_due_date") return "neutral";
  return "success";
}

export function mapOperationalEventLabel(eventType: string): string {
  switch (eventType) {
    case "created":
      return "Creada";
    case "assigned":
      return "Asignada";
    case "reassigned":
      return "Reasignada";
    case "due_date_changed":
      return "Vencimiento actualizado";
    case "status_changed":
      return "Estado actualizado";
    case "resolved":
      return "Resuelta";
    case "dismissed":
      return "Descartada";
    case "blocked":
      return "Bloqueada";
    case "updated":
      return "Actualizada";
    default:
      return eventType;
  }
}

export function formatOperationalEventDetail(detail: Record<string, unknown>): string | null {
  const parts: string[] = [];
  if (detail.from_status && detail.to_status) {
    parts.push(`${String(detail.from_status)} → ${String(detail.to_status)}`);
  }
  if (detail.assigned_to) {
    parts.push(`Responsable: ${String(detail.assigned_to)}`);
  }
  if (detail.from_assigned_to && detail.assigned_to) {
    parts.push(`${String(detail.from_assigned_to)} → ${String(detail.assigned_to)}`);
  }
  if (detail.due_at) {
    parts.push(`Nuevo vencimiento: ${String(detail.due_at)}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
