import type { SupabaseClient } from "@supabase/supabase-js";

import type { FiscalAlertItem } from "@/lib/copilot-tax-alerts";
import {
  OPERATIONAL_ACTION_ORIGINS,
  OPERATIONAL_ACTION_PRIORITIES,
  OPERATIONAL_ACTION_STATUSES,
  type OperationalActionCreateInput,
  type OperationalActionListItem,
  type OperationalActionPatchInput,
  type OperationalActionPriority,
  type OperationalActionQueueSummary,
  type OperationalActionStatus,
} from "@/lib/copilot-operational-actions-types";
import { buildAccionesHrefFromAlert } from "@/lib/copilot-alert-ops-mapper";
import { recordOperationalActionPatchEvents } from "@/lib/copilot-operational-events";
import { summarizeOperationalSla } from "@/lib/copilot-operational-actions-sla";
import {
  insertOperationalAction,
  insertOperationalActionEvent,
  mapOperationalActionRow,
  selectOpenOperationalActionByOriginEntity,
  selectOperationalActionById,
  selectOperationalActionsOrdered,
  selectOperationalActionEvents,
  updateOperationalActionById,
} from "@/lib/data/operational-actions-repository";
import { protoCrudResult, type ProtoCrudResult } from "@/lib/copilot-proto-crud-types";

const MSG_DB = "Error de base de datos. Intentá de nuevo.";

type Actor = {
  id: string;
  label: string;
};

function str(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function allowedEnum<T extends string>(
  value: string,
  allowed: readonly T[],
  fallback: T
): T {
  const normalized = value.trim().toLowerCase() as T;
  return (allowed as readonly string[]).includes(normalized) ? normalized : fallback;
}

function defaultDueAt(priority: OperationalActionPriority): string {
  const days =
    priority === "critical" ? 1 : priority === "high" ? 3 : priority === "medium" ? 7 : 14;
  const due = new Date();
  due.setDate(due.getDate() + days);
  return due.toISOString();
}

function mapAlertPriority(priority: FiscalAlertItem["priority"]): OperationalActionPriority {
  if (priority === "critical") return "critical";
  if (priority === "high") return "high";
  return "medium";
}

function actionTypeFromAlert(alert: FiscalAlertItem): string {
  switch (alert.type) {
    case "fiscalidad":
      return alert.obligationId ? "register_payment" : "follow_up";
    case "liquidez":
      return "review_liquidity";
    case "cobertura":
      return "review_coverage";
    case "conciliacion":
      return "reconcile_movement";
    default:
      return "follow_up";
  }
}

async function appendEvent(
  client: SupabaseClient,
  workspaceCompanyId: string,
  actionId: string,
  eventType: string,
  actor: Actor,
  detail: Record<string, unknown>
): Promise<ProtoCrudResult<null>> {
  const { error } = await insertOperationalActionEvent(client, {
    workspace_company_id: workspaceCompanyId,
    action_id: actionId,
    event_type: eventType,
    actor_id: actor.id,
    actor_label: actor.label,
    detail,
  });
  if (error) {
    return protoCrudResult.fail("DATABASE", MSG_DB);
  }
  return protoCrudResult.ok(null, "Evento registrado.");
}

export function summarizeOperationalQueue(
  actions: OperationalActionListItem[]
): OperationalActionQueueSummary {
  const today = new Date().toDateString();
  return actions.reduce<OperationalActionQueueSummary>(
    (acc, action) => {
      if (action.operational_status === "pending") acc.pending += 1;
      if (action.operational_status === "in_progress") acc.inProgress += 1;
      if (action.operational_status === "blocked") acc.blocked += 1;
      if (action.operational_status === "resolved" && action.resolved_at) {
        try {
          if (new Date(action.resolved_at).toDateString() === today) {
            acc.resolvedToday += 1;
          }
        } catch {
          /* ignore invalid date */
        }
      }
      return acc;
    },
    { pending: 0, inProgress: 0, blocked: 0, resolvedToday: 0 }
  );
}

export { summarizeOperationalSla };

export async function listOperationalActions(
  client: SupabaseClient,
  workspaceCompanyId: string,
  limit = 120
): Promise<ProtoCrudResult<OperationalActionListItem[]>> {
  const wid = str(workspaceCompanyId);
  if (!wid) return protoCrudResult.fail("VALIDATION", "Falta workspace.");

  const { data, error } = await selectOperationalActionsOrdered(client, wid, limit);
  if (error) return protoCrudResult.fail("DATABASE", MSG_DB);
  return protoCrudResult.ok(
    (data ?? []).map((row) => mapOperationalActionRow(row)),
    "Acciones operativas cargadas."
  );
}

export async function createOperationalAction(
  client: SupabaseClient,
  workspaceCompanyId: string,
  input: OperationalActionCreateInput,
  actor: Actor
): Promise<ProtoCrudResult<OperationalActionListItem>> {
  const wid = str(workspaceCompanyId);
  if (!wid) return protoCrudResult.fail("VALIDATION", "Falta workspace.");
  if (!str(input.title)) return protoCrudResult.fail("VALIDATION", "Falta título.");
  if (!OPERATIONAL_ACTION_ORIGINS.includes(input.origin)) {
    return protoCrudResult.fail("VALIDATION", "Origen inválido.");
  }

  const priority = allowedEnum(
    str(input.priority ?? "medium"),
    OPERATIONAL_ACTION_PRIORITIES,
    "medium"
  );

  const relatedEntityId = str(input.relatedEntityId ?? "");
  if (relatedEntityId) {
    const { data: existing, error: existingError } =
      await selectOpenOperationalActionByOriginEntity(
        client,
        wid,
        input.origin,
        relatedEntityId
      );
    if (existingError) return protoCrudResult.fail("DATABASE", MSG_DB);
    if (existing) {
      return protoCrudResult.ok(
        mapOperationalActionRow(existing),
        "Seguimiento ya abierto para esta entidad."
      );
    }
  }

  const row = {
    workspace_company_id: wid,
    origin: input.origin,
    action_type: str(input.actionType) || "follow_up",
    priority,
    operational_status: "pending" as OperationalActionStatus,
    owner_id: input.ownerId ?? actor.id,
    assigned_to: input.assignedTo ?? actor.label,
    created_by: actor.label,
    related_entity_type: input.relatedEntityType ?? null,
    related_entity_id: relatedEntityId || null,
    title: str(input.title),
    summary: input.summary ?? null,
    context: input.context ?? {},
    metadata: input.metadata ?? {},
    due_at: input.dueAt ?? defaultDueAt(priority),
    resolved_at: null,
    resolution_notes: null,
  };

  const { data, error } = await insertOperationalAction(client, row);
  if (error) return protoCrudResult.fail("DATABASE", MSG_DB);
  const created = mapOperationalActionRow(data as Record<string, unknown>);

  const eventResult = await appendEvent(client, wid, created.id, "created", actor, {
    origin: created.origin,
    action_type: created.action_type,
    priority: created.priority,
    related_entity_id: created.related_entity_id,
  });
  if (!eventResult.ok) return eventResult as ProtoCrudResult<OperationalActionListItem>;

  return protoCrudResult.ok(created, "Acción operativa creada.");
}

export async function createOperationalActionFromAlert(
  client: SupabaseClient,
  workspaceCompanyId: string,
  alert: FiscalAlertItem,
  actor: Actor
): Promise<ProtoCrudResult<OperationalActionListItem>> {
  return createOperationalAction(client, workspaceCompanyId, {
    origin: "alert",
    actionType: actionTypeFromAlert(alert),
    priority: mapAlertPriority(alert.priority),
    title: alert.title,
    summary: alert.summary,
    relatedEntityType: "fiscal_alert",
    relatedEntityId: alert.id,
    context: {
      alertType: alert.type,
      alertPriority: alert.priority,
      obligationId: alert.obligationId,
      deepLink: buildAccionesHrefFromAlert(alert),
    },
    metadata: {
      alertDetail: alert.detail,
    },
  }, actor);
}

export async function patchOperationalAction(
  client: SupabaseClient,
  workspaceCompanyId: string,
  actionId: string,
  input: OperationalActionPatchInput,
  actor: Actor
): Promise<ProtoCrudResult<OperationalActionListItem>> {
  const wid = str(workspaceCompanyId);
  if (!wid) return protoCrudResult.fail("VALIDATION", "Falta workspace.");
  if (!str(actionId)) return protoCrudResult.fail("VALIDATION", "Falta acción.");

  const { data: current, error: currentError } = await selectOperationalActionById(
    client,
    wid,
    actionId
  );
  if (currentError) return protoCrudResult.fail("DATABASE", MSG_DB);
  if (!current) return protoCrudResult.fail("NOT_FOUND", "Acción no encontrada.");

  const patch: Record<string, unknown> = {};
  const events: Array<{ eventType: string; detail: Record<string, unknown> }> = [];

  if (input.operationalStatus !== undefined) {
    const nextStatus = allowedEnum(
      str(input.operationalStatus),
      OPERATIONAL_ACTION_STATUSES,
      "pending"
    );
    patch.operational_status = nextStatus;
    const statusDetail = {
      from_status: current.operational_status,
      to_status: nextStatus,
    };
    if (nextStatus === "resolved" || nextStatus === "dismissed") {
      patch.resolved_at = new Date().toISOString();
      events.push({
        eventType: nextStatus === "resolved" ? "resolved" : "dismissed",
        detail: statusDetail,
      });
    } else if (nextStatus === "blocked") {
      events.push({ eventType: "blocked", detail: statusDetail });
    } else {
      events.push({ eventType: "status_changed", detail: statusDetail });
    }
  }

  if (input.assignedTo !== undefined) {
    patch.assigned_to = input.assignedTo;
    events.push({
      eventType: str(current.assigned_to) ? "reassigned" : "assigned",
      detail: {
        from_assigned_to: current.assigned_to,
        assigned_to: input.assignedTo,
      },
    });
  }
  if (input.ownerId !== undefined) patch.owner_id = input.ownerId;
  if (input.dueAt !== undefined) {
    patch.due_at = input.dueAt;
    events.push({
      eventType: "due_date_changed",
      detail: {
        from_due_at: current.due_at,
        due_at: input.dueAt,
      },
    });
  }
  if (input.resolutionNotes !== undefined) patch.resolution_notes = input.resolutionNotes;
  if (input.summary !== undefined) patch.summary = input.summary;

  if (Object.keys(patch).length === 0) {
    return protoCrudResult.fail("VALIDATION", "Sin cambios para aplicar.");
  }

  const { data, error } = await updateOperationalActionById(client, wid, actionId, patch);
  if (error) return protoCrudResult.fail("DATABASE", MSG_DB);
  if (!data) return protoCrudResult.fail("NOT_FOUND", "Acción no encontrada.");

  for (const event of events) {
    const eventResult = await appendEvent(
      client,
      wid,
      actionId,
      event.eventType,
      actor,
      event.detail
    );
    if (!eventResult.ok) return eventResult as ProtoCrudResult<OperationalActionListItem>;
  }

  const updatedAction = mapOperationalActionRow(data);
  await recordOperationalActionPatchEvents(client, wid, updatedAction, events, {
    userId: actor.id,
    label: actor.label,
  });

  return protoCrudResult.ok(updatedAction, "Acción actualizada.");
}

export async function listOperationalActionEvents(
  client: SupabaseClient,
  workspaceCompanyId: string,
  actionId: string,
  limit = 40
) {
  const wid = str(workspaceCompanyId);
  if (!wid) return protoCrudResult.fail("VALIDATION", "Falta workspace.");
  const { data, error } = await selectOperationalActionEvents(client, wid, actionId, limit);
  if (error) return protoCrudResult.fail("DATABASE", MSG_DB);
  return protoCrudResult.ok(data ?? [], "Eventos cargados.");
}
