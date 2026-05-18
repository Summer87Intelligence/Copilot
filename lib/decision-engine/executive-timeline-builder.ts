/**
 * Phase 5C — Executive Timeline Builder.
 * Construye una línea de tiempo ejecutiva a partir de eventos del sistema.
 * Puro: sin imports de DB.
 */

import type {
  AutomationActionRow,
  DECollectionAction,
  DECompany,
  DEOperationalStateRow,
  DEFollowUpRow,
} from "@/lib/decision-engine/de-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExecutiveTimelineEventKind =
  | "action_registered"
  | "followup_created"
  | "automation_executed"
  | "state_changed"
  | "sla_breach"
  | "recovery_detected";

export const EXECUTIVE_TIMELINE_KIND_LABELS: Record<ExecutiveTimelineEventKind, string> = {
  action_registered:  "Acción registrada",
  followup_created:   "Follow-up creado",
  automation_executed: "Automatización ejecutada",
  state_changed:       "Estado actualizado",
  sla_breach:         "SLA incumplido",
  recovery_detected:  "Recuperación detectada",
};

export type ExecutiveTimelineEvent = {
  id: string;
  kind: ExecutiveTimelineEventKind;
  at: string;
  label: string;
  customer_id?: string;
  customer_name?: string;
};

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function eventsFromActions(
  actions: DECollectionAction[],
  companies: DECompany[]
): ExecutiveTimelineEvent[] {
  const companyIndex = new Map(companies.map((c) => [c.id, c.name]));
  return actions.map((a) => ({
    id: `action:${a.id}`,
    kind: "action_registered" as const,
    at: a.created_at,
    label: `${ACTION_TYPE_LABELS[a.action_type] ?? a.action_type} — ${companyIndex.get(a.company_id) ?? "Cliente"}`,
    customer_id: a.company_id,
    customer_name: companyIndex.get(a.company_id),
  }));
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  call:                "Llamada",
  email:               "Email",
  whatsapp:            "WhatsApp",
  promise:             "Promesa de pago",
  escalation:          "Escalación",
  payment_confirmation: "Confirmación de pago",
  note:                "Nota",
};

function eventsFromFollowUps(
  followUps: DEFollowUpRow[],
  companies: DECompany[]
): ExecutiveTimelineEvent[] {
  const companyIndex = new Map(companies.map((c) => [c.id, c.name]));
  return followUps
    .filter((f) => f.status === "pending" || f.status === "in_progress")
    .map((f) => ({
      id: `followup:${f.id}`,
      kind: "followup_created" as const,
      at: f.scheduled_for,
      label: `Seguimiento programado — ${companyIndex.get(f.customer_id) ?? "Cliente"}`,
      customer_id: f.customer_id,
      customer_name: companyIndex.get(f.customer_id),
    }));
}

function eventsFromAutomation(
  automationActions: AutomationActionRow[]
): ExecutiveTimelineEvent[] {
  return automationActions
    .filter((a) => a.executed && a.executed_at != null)
    .map((a) => ({
      id: `auto:${a.id}`,
      kind: "automation_executed" as const,
      at: a.executed_at!,
      label: `Auto: ${AUTOMATION_ACTION_LABELS[a.action_type] ?? a.action_type}`,
      customer_id: a.customer_id,
    }));
}

const AUTOMATION_ACTION_LABELS: Record<string, string> = {
  create_follow_up:        "Seguimiento creado",
  escalate_case:           "Caso escalado",
  auto_assign:             "Asignación automática",
  increase_priority:       "Prioridad aumentada",
  create_operational_alert: "Alerta operacional",
  mark_overdue:            "Marcado como vencido",
  suggest_payment_plan:    "Plan de pago sugerido",
  trigger_manual_review:   "Revisión manual requerida",
};

function eventsFromStateChanges(
  states: DEOperationalStateRow[],
  companies: DECompany[]
): ExecutiveTimelineEvent[] {
  const companyIndex = new Map(companies.map((c) => [c.id, c.name]));
  return states
    .filter((s) => s.transitioned_at != null && s.previous_state != null)
    .map((s) => ({
      id: `state:${s.customer_id}`,
      kind: "state_changed" as const,
      at: s.transitioned_at!,
      label: `${companyIndex.get(s.customer_id) ?? "Cliente"}: ${s.previous_state} → ${s.machine_state}`,
      customer_id: s.customer_id,
      customer_name: companyIndex.get(s.customer_id),
    }));
}

function eventsFromSlaBreaches(
  states: DEOperationalStateRow[],
  companies: DECompany[]
): ExecutiveTimelineEvent[] {
  const companyIndex = new Map(companies.map((c) => [c.id, c.name]));
  return states
    .filter((s) => s.breached_sla && s.updated_at)
    .map((s) => ({
      id: `sla:${s.customer_id}`,
      kind: "sla_breach" as const,
      at: s.updated_at,
      label: `SLA incumplido — ${companyIndex.get(s.customer_id) ?? "Cliente"}`,
      customer_id: s.customer_id,
      customer_name: companyIndex.get(s.customer_id),
    }));
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export type ExecutiveTimelineInput = {
  actions: DECollectionAction[];
  followUps: DEFollowUpRow[];
  automationActions: AutomationActionRow[];
  operationalStates: DEOperationalStateRow[];
  companies: DECompany[];
  limit?: number;
};

export function buildExecutiveTimeline(
  input: ExecutiveTimelineInput
): ExecutiveTimelineEvent[] {
  const limit = input.limit ?? 5;

  const events: ExecutiveTimelineEvent[] = [
    ...eventsFromActions(input.actions, input.companies),
    ...eventsFromFollowUps(input.followUps, input.companies),
    ...eventsFromAutomation(input.automationActions),
    ...eventsFromStateChanges(input.operationalStates, input.companies),
    ...eventsFromSlaBreaches(input.operationalStates, input.companies),
  ];

  // Deduplicate by id then sort descending by `at`
  const seen = new Set<string>();
  const unique = events.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  return unique
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}
