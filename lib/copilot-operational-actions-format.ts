import type {
  OperationalActionOrigin,
  OperationalActionPriority,
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
