"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { CopilotOperationalEmptyState } from "@/components/copilot/copilot-operational-empty-state";
import { CopilotSkeletonKpiRow } from "@/components/copilot/copilot-loading-skeleton";
import {
  CopilotBadge,
  CopilotCard,
  CopilotGhostButton,
  CopilotPrimaryLink,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import type { CopilotActionProvenanceQuery } from "@/lib/copilot-alert-ops-mapper";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import {
  formatOperationalEventDetail,
  mapOperationalActionTypeLabel,
  mapOperationalEventLabel,
  mapOperationalOriginLabel,
  mapOperationalPriorityLabel,
  mapOperationalSlaLabel,
  mapOperationalStatusLabel,
  operationalPriorityTone,
  operationalSlaTone,
  operationalStatusTone,
} from "@/lib/copilot-operational-actions-format";
import {
  getActionSlaStatus,
  sortOperationalActionsForQueue,
} from "@/lib/copilot-operational-actions-sla";
import type {
  OperationalActionEventRow,
  OperationalActionListItem,
  OperationalActionOrigin,
  OperationalActionPriority,
  OperationalActionQueueSummary,
  OperationalActionSlaSummary,
  OperationalActionSlaStatus,
  OperationalActionStatus,
} from "@/lib/copilot-operational-actions-types";

type Props = {
  provenance?: CopilotActionProvenanceQuery;
  highlightActionId?: string | null;
  onError?: (message: string | null) => void;
};

type OperatorMe = {
  id: string;
  full_name: string;
  email: string;
};

const EMPTY_SUMMARY: OperationalActionQueueSummary = {
  pending: 0,
  inProgress: 0,
  blocked: 0,
  resolvedToday: 0,
};

const EMPTY_SLA: OperationalActionSlaSummary = {
  overdue: 0,
  dueToday: 0,
  dueSoon: 0,
  noDueDate: 0,
  blockedCritical: 0,
};

const OPEN_STATUSES: OperationalActionStatus[] = ["pending", "in_progress", "blocked"];

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function dueAtToInputValue(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function inputValueToDueAtIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return `${trimmed}T12:00:00.000Z`;
}

function contextHref(action: OperationalActionListItem): string | null {
  const deepLink = action.context?.deepLink;
  if (typeof deepLink === "string" && deepLink.trim()) return deepLink;
  if (action.origin === "alert") return "/copilot/alertas";
  if (action.origin === "treasury") return "/copilot/tesoreria";
  if (action.origin === "finance") return "/copilot/finanzas";
  if (action.origin === "customer") return "/copilot/clientes";
  if (action.origin === "insight") return "/copilot/insights";
  return null;
}

export function CopilotOperationalActionsPanel({
  provenance,
  highlightActionId,
  onError,
}: Props) {
  const [actions, setActions] = useState<OperationalActionListItem[]>([]);
  const [summary, setSummary] = useState<OperationalActionQueueSummary>(EMPTY_SUMMARY);
  const [slaSummary, setSlaSummary] = useState<OperationalActionSlaSummary>(EMPTY_SLA);
  const [loading, setLoading] = useState(true);
  const [bootstrapMessage, setBootstrapMessage] = useState<string | null>(null);
  const [patchingId, setPatchingId] = useState<string | null>(null);
  const [timelineId, setTimelineId] = useState<string | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState<OperationalActionEventRow[]>([]);
  const [operator, setOperator] = useState<OperatorMe | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | OperationalActionStatus>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | OperationalActionPriority>("all");
  const [originFilter, setOriginFilter] = useState<"all" | OperationalActionOrigin>("all");
  const [slaFilter, setSlaFilter] = useState<"all" | OperationalActionSlaStatus>("all");
  const [dueDrafts, setDueDrafts] = useState<Record<string, string>>({});
  const bootstrapRef = useRef(false);

  const refresh = useCallback(async (opts?: { soft?: boolean }) => {
    if (!opts?.soft) setLoading(true);
    onError?.(null);
    try {
      const res = await copilotApiFetch("/api/copilot/operational-actions?limit=120");
      const json = (await res.json()) as {
        actions?: OperationalActionListItem[];
        summary?: OperationalActionQueueSummary;
        sla_summary?: OperationalActionSlaSummary;
        error?: string;
      };
      if (!res.ok) {
        onError?.(json.error ?? "No se pudo cargar la cola operativa.");
        setActions([]);
        setSummary(EMPTY_SUMMARY);
        setSlaSummary(EMPTY_SLA);
        return;
      }
      const nextActions = json.actions ?? [];
      setActions(nextActions);
      setSummary(json.summary ?? EMPTY_SUMMARY);
      setSlaSummary(json.sla_summary ?? EMPTY_SLA);
      setDueDrafts((prev) => {
        const next = { ...prev };
        for (const action of nextActions) {
          next[action.id] = dueAtToInputValue(action.due_at);
        }
        return next;
      });
    } catch {
      onError?.("Error de red al cargar la cola operativa.");
      setActions([]);
      setSummary(EMPTY_SUMMARY);
      setSlaSummary(EMPTY_SLA);
    } finally {
      if (!opts?.soft) setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await copilotApiFetch("/api/copilot/me");
        const json = (await res.json()) as { appUser?: OperatorMe };
        if (res.ok && json.appUser) setOperator(json.appUser);
      } catch {
        /* fallback: asignación manual sigue disponible vía API */
      }
    })();
  }, []);

  useEffect(() => {
    if (bootstrapRef.current) return;
    if (provenance?.source !== "alert") return;
    if (
      !provenance.alertId ||
      !provenance.alertTitle ||
      !provenance.priority ||
      !provenance.alertType
    ) {
      return;
    }
    bootstrapRef.current = true;
    void (async () => {
      try {
        const res = await copilotApiFetch("/api/copilot/operational-actions/from-alert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            alert_id: provenance.alertId,
            title: provenance.alertTitle,
            summary: provenance.alertTitle,
            priority: provenance.priority,
            alert_type: provenance.alertType,
            obligation_id: provenance.obligationId,
          }),
        });
        const json = (await res.json()) as { error?: string; message?: string };
        if (!res.ok) {
          onError?.(json.error ?? "No se pudo crear el seguimiento desde la alerta.");
          return;
        }
        setBootstrapMessage(json.message ?? "Seguimiento operativo registrado.");
        await refresh({ soft: true });
      } catch {
        onError?.("Error de red al crear seguimiento desde alerta.");
      }
    })();
  }, [provenance, onError, refresh]);

  const openActions = useMemo(
    () => actions.filter((action) => OPEN_STATUSES.includes(action.operational_status)),
    [actions]
  );

  const filteredOpenActions = useMemo(() => {
    const filtered = openActions.filter((action) => {
      if (statusFilter !== "all" && action.operational_status !== statusFilter) return false;
      if (priorityFilter !== "all" && action.priority !== priorityFilter) return false;
      if (originFilter !== "all" && action.origin !== originFilter) return false;
      if (slaFilter !== "all" && getActionSlaStatus(action) !== slaFilter) return false;
      return true;
    });
    return sortOperationalActionsForQueue(filtered);
  }, [openActions, originFilter, priorityFilter, slaFilter, statusFilter]);

  const resolvedToday = useMemo(() => {
    const today = new Date().toDateString();
    return actions.filter((action) => {
      if (action.operational_status !== "resolved" || !action.resolved_at) return false;
      try {
        return new Date(action.resolved_at).toDateString() === today;
      } catch {
        return false;
      }
    });
  }, [actions]);

  const patchAction = async (
    actionId: string,
    body: Record<string, unknown>
  ) => {
    setPatchingId(actionId);
    onError?.(null);
    try {
      const res = await copilotApiFetch(`/api/copilot/operational-actions/${actionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        onError?.(json.error ?? "No se pudo actualizar la acción.");
        return;
      }
      if (timelineId === actionId) {
        void loadTimeline(actionId);
      }
      await refresh({ soft: true });
    } catch {
      onError?.("Error de red al actualizar la acción.");
    } finally {
      setPatchingId(null);
    }
  };

  const loadTimeline = useCallback(async (actionId: string) => {
    setTimelineLoading(true);
    try {
      const res = await copilotApiFetch(
        `/api/copilot/operational-actions/${actionId}/events?limit=40`
      );
      const json = (await res.json()) as {
        events?: OperationalActionEventRow[];
        error?: string;
      };
      if (!res.ok) {
        onError?.(json.error ?? "No se pudo cargar el historial.");
        setTimelineEvents([]);
        return;
      }
      setTimelineEvents(json.events ?? []);
    } catch {
      onError?.("Error de red al cargar el historial.");
      setTimelineEvents([]);
    } finally {
      setTimelineLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    if (!highlightActionId) return;
    const node = document.getElementById(`operational-action-${highlightActionId}`);
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimelineId(highlightActionId);
    void loadTimeline(highlightActionId);
  }, [highlightActionId, actions, loadTimeline]);

  const toggleTimeline = (actionId: string) => {
    if (timelineId === actionId) {
      setTimelineId(null);
      setTimelineEvents([]);
      return;
    }
    setTimelineId(actionId);
    void loadTimeline(actionId);
  };

  const assignToMe = (action: OperationalActionListItem) => {
    const label = operator?.full_name?.trim() || operator?.email;
    if (!label) {
      onError?.("No se pudo resolver el usuario actual para asignar.");
      return;
    }
    void patchAction(action.id, {
      assigned_to: label,
      owner_id: operator?.id ?? null,
    });
  };

  const saveDueDate = (actionId: string) => {
    const draft = dueDrafts[actionId] ?? "";
    void patchAction(actionId, { due_at: inputValueToDueAtIso(draft) });
  };

  return (
    <CopilotCard>
      <CopilotSectionTitle
        title="Cola operativa"
        subtitle="Responsable, vencimiento y SLA sobre acciones persistidas."
      />
      {bootstrapMessage ? (
        <p className="mb-3 text-sm text-[var(--copilot-ink-muted)]">{bootstrapMessage}</p>
      ) : null}
      {loading ? (
        <CopilotSkeletonKpiRow count={4} className="py-1" />
      ) : openActions.length === 0 && resolvedToday.length === 0 ? (
        <CopilotOperationalEmptyState
          title="Cola operativa"
          status="Sin acciones abiertas en esta carga"
          statusTone="info"
          metrics={[
            { label: "Pendientes", value: summary.pending },
            { label: "En seguimiento", value: summary.inProgress },
            { label: "Bloqueadas", value: summary.blocked },
            { label: "Resueltas hoy", value: summary.resolvedToday },
          ]}
          footnote="Creá seguimiento desde alertas o registrá una acción manual cuando el flujo lo requiera."
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-4">
            {[
              { label: "Pendientes", value: summary.pending },
              { label: "En seguimiento", value: summary.inProgress },
              { label: "Bloqueadas", value: summary.blocked },
              { label: "Resueltas hoy", value: summary.resolvedToday },
            ].map((metric) => (
              <div
                key={metric.label}
                className="rounded-xl border border-[var(--copilot-border)] bg-white/75 px-3 py-2"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  {metric.label}
                </p>
                <p className="mt-1 text-lg font-semibold text-[var(--copilot-ink)]">
                  {metric.value}
                </p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            {[
              { label: "Vencidas", value: slaSummary.overdue },
              { label: "Para hoy", value: slaSummary.dueToday },
              { label: "Esta semana", value: slaSummary.dueSoon },
              { label: "Críticas bloqueadas", value: slaSummary.blockedCritical },
            ].map((chip) => (
              <span
                key={chip.label}
                className="rounded-full border border-[var(--copilot-border)] bg-white/80 px-2.5 py-1 font-semibold text-[var(--copilot-ink-muted)]"
              >
                {chip.label}: {chip.value}
              </span>
            ))}
          </div>

          <div className="grid gap-2 md:grid-cols-4">
            <label className="text-xs font-medium text-[var(--copilot-ink-muted)]">
              Estado
              <select
                className="mt-1 w-full rounded-lg border border-[var(--copilot-border)] bg-white px-2 py-1.5 text-sm"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as typeof statusFilter)
                }
              >
                <option value="all">Todos</option>
                <option value="pending">Pendiente</option>
                <option value="in_progress">En seguimiento</option>
                <option value="blocked">Bloqueada</option>
              </select>
            </label>
            <label className="text-xs font-medium text-[var(--copilot-ink-muted)]">
              Prioridad
              <select
                className="mt-1 w-full rounded-lg border border-[var(--copilot-border)] bg-white px-2 py-1.5 text-sm"
                value={priorityFilter}
                onChange={(event) =>
                  setPriorityFilter(event.target.value as typeof priorityFilter)
                }
              >
                <option value="all">Todas</option>
                <option value="critical">Crítica</option>
                <option value="high">Alta</option>
                <option value="medium">Media</option>
                <option value="low">Baja</option>
              </select>
            </label>
            <label className="text-xs font-medium text-[var(--copilot-ink-muted)]">
              Origen
              <select
                className="mt-1 w-full rounded-lg border border-[var(--copilot-border)] bg-white px-2 py-1.5 text-sm"
                value={originFilter}
                onChange={(event) =>
                  setOriginFilter(event.target.value as typeof originFilter)
                }
              >
                <option value="all">Todos</option>
                <option value="alert">Alerta</option>
                <option value="treasury">Tesorería</option>
                <option value="finance">Finanzas</option>
                <option value="customer">Cliente</option>
                <option value="insight">Insight</option>
                <option value="manual">Manual</option>
              </select>
            </label>
            <label className="text-xs font-medium text-[var(--copilot-ink-muted)]">
              Vencimiento
              <select
                className="mt-1 w-full rounded-lg border border-[var(--copilot-border)] bg-white px-2 py-1.5 text-sm"
                value={slaFilter}
                onChange={(event) => setSlaFilter(event.target.value as typeof slaFilter)}
              >
                <option value="all">Todos</option>
                <option value="overdue">Vencidas</option>
                <option value="due_today">Vencen hoy</option>
                <option value="due_soon">Esta semana</option>
                <option value="no_due_date">Sin fecha</option>
                <option value="ok">En plazo</option>
              </select>
            </label>
          </div>

          {filteredOpenActions.length > 0 ? (
            <ul className="space-y-3">
              {filteredOpenActions.map((action) => {
                const busy = patchingId === action.id;
                const href = contextHref(action);
                const timelineOpen = timelineId === action.id;
                const sla = getActionSlaStatus(action);
                const highlighted = highlightActionId === action.id;
                return (
                  <li
                    key={action.id}
                    id={`operational-action-${action.id}`}
                    className={`rounded-2xl border border-[var(--copilot-border)] bg-white/85 px-3.5 py-3 shadow-sm ${
                      highlighted ? "ring-2 ring-[rgba(31,107,74,0.22)]" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[var(--copilot-ink)]">
                          {action.title}
                        </p>
                        {action.summary ? (
                          <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
                            {action.summary}
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <CopilotBadge tone={operationalPriorityTone(action.priority)}>
                            {mapOperationalPriorityLabel(action.priority)}
                          </CopilotBadge>
                          <CopilotBadge tone="neutral">
                            {mapOperationalOriginLabel(action.origin)}
                          </CopilotBadge>
                          <CopilotBadge tone={operationalStatusTone(action.operational_status)}>
                            {mapOperationalStatusLabel(action.operational_status)}
                          </CopilotBadge>
                          <CopilotBadge tone={operationalSlaTone(sla)}>
                            {mapOperationalSlaLabel(sla)}
                          </CopilotBadge>
                        </div>
                        <p className="mt-2 text-xs text-[var(--copilot-ink-muted)]">
                          {mapOperationalActionTypeLabel(action.action_type)}
                          {action.related_entity_id
                            ? ` · ${action.related_entity_type ?? "entidad"} ${action.related_entity_id}`
                            : ""}
                        </p>
                        <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
                          Vence {formatDateTime(action.due_at)} · Responsable{" "}
                          {action.assigned_to?.trim() || "sin asignar"}
                        </p>
                      </div>
                      {href ? (
                        <CopilotPrimaryLink href={href} className="shrink-0 text-xs">
                          Abrir contexto
                        </CopilotPrimaryLink>
                      ) : null}
                    </div>

                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <CopilotGhostButton
                        type="button"
                        disabled={busy}
                        className="text-xs"
                        onClick={() => assignToMe(action)}
                      >
                        Asignarme
                      </CopilotGhostButton>
                      <CopilotGhostButton
                        type="button"
                        disabled={busy || action.operational_status === "in_progress"}
                        className="text-xs"
                        onClick={() => void patchAction(action.id, { operational_status: "in_progress" })}
                      >
                        Tomar
                      </CopilotGhostButton>
                      <CopilotGhostButton
                        type="button"
                        disabled={busy}
                        className="text-xs"
                        onClick={() => void patchAction(action.id, { operational_status: "resolved" })}
                      >
                        Resolver
                      </CopilotGhostButton>
                      <label className="inline-flex min-w-[9rem] flex-col gap-1 text-xs text-[var(--copilot-ink-muted)]">
                        Fecha objetivo
                        <span className="flex items-center gap-2">
                          <input
                            type="date"
                            className="rounded-lg border border-[var(--copilot-border)] bg-white px-2 py-1 text-sm text-[var(--copilot-ink)]"
                            value={dueDrafts[action.id] ?? ""}
                            onChange={(event) =>
                              setDueDrafts((prev) => ({
                                ...prev,
                                [action.id]: event.target.value,
                              }))
                            }
                          />
                          <CopilotGhostButton
                            type="button"
                            disabled={busy}
                            className="text-xs"
                            onClick={() => saveDueDate(action.id)}
                          >
                            Guardar
                          </CopilotGhostButton>
                        </span>
                      </label>
                      <details className="text-xs">
                        <summary className="cursor-pointer font-semibold text-[var(--copilot-ink-muted)]">
                          Más
                        </summary>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <CopilotGhostButton
                            type="button"
                            disabled={busy || action.operational_status === "blocked"}
                            className="text-xs"
                            onClick={() => void patchAction(action.id, { operational_status: "blocked" })}
                          >
                            Bloquear
                          </CopilotGhostButton>
                          <CopilotGhostButton
                            type="button"
                            className="text-xs"
                            onClick={() => toggleTimeline(action.id)}
                          >
                            {timelineOpen ? "Ocultar historial" : "Ver historial"}
                          </CopilotGhostButton>
                        </div>
                      </details>
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin text-[var(--copilot-ink-muted)]" aria-hidden />
                      ) : null}
                    </div>

                    {timelineOpen ? (
                      <div className="mt-3 rounded-xl border border-[var(--copilot-border)]/90 bg-white/70 px-3 py-3">
                        {timelineLoading ? (
                          <p className="text-xs text-[var(--copilot-ink-muted)]">
                            Cargando historial…
                          </p>
                        ) : timelineEvents.length === 0 ? (
                          <p className="text-xs text-[var(--copilot-ink-muted)]">
                            Sin eventos registrados.
                          </p>
                        ) : (
                          <ul className="space-y-2">
                            {timelineEvents.map((event) => {
                              const detail = formatOperationalEventDetail(event.detail);
                              return (
                                <li
                                  key={event.id}
                                  className="border-b border-[var(--copilot-border)]/60 pb-2 last:border-b-0 last:pb-0"
                                >
                                  <p className="text-xs font-semibold text-[var(--copilot-ink)]">
                                    {mapOperationalEventLabel(event.event_type)}
                                  </p>
                                  <p className="text-[11px] text-[var(--copilot-ink-muted)]">
                                    {formatDateTime(event.created_at)}
                                    {event.actor_label ? ` · ${event.actor_label}` : ""}
                                  </p>
                                  {detail ? (
                                    <p className="mt-1 text-[11px] text-[var(--copilot-ink-muted)]">
                                      {detail}
                                    </p>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-[var(--copilot-ink-muted)]">
              No hay acciones abiertas con estos filtros.
            </p>
          )}

          {resolvedToday.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Resueltas hoy
              </p>
              <ul className="mt-2 space-y-2">
                {resolvedToday.map((action) => (
                  <li
                    key={action.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200/70 bg-emerald-50/50 px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-[var(--copilot-ink)]">{action.title}</span>
                    <span className="text-xs text-[var(--copilot-ink-muted)]">
                      {formatDateTime(action.resolved_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </CopilotCard>
  );
}
