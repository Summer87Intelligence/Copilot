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
  mapOperationalActionTypeLabel,
  mapOperationalOriginLabel,
  mapOperationalPriorityLabel,
  mapOperationalStatusLabel,
  operationalPriorityTone,
  operationalStatusTone,
} from "@/lib/copilot-operational-actions-format";
import type {
  OperationalActionEventRow,
  OperationalActionListItem,
  OperationalActionQueueSummary,
  OperationalActionStatus,
} from "@/lib/copilot-operational-actions-types";

type Props = {
  provenance?: CopilotActionProvenanceQuery;
  onError?: (message: string | null) => void;
};

const EMPTY_SUMMARY: OperationalActionQueueSummary = {
  pending: 0,
  inProgress: 0,
  blocked: 0,
  resolvedToday: 0,
};

function formatDate(iso: string | null) {
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

function eventLabel(eventType: string): string {
  switch (eventType) {
    case "created":
      return "Creada";
    case "updated":
      return "Actualizada";
    case "status_changed":
      return "Estado actualizado";
    case "reassigned":
      return "Reasignada";
    case "resolved":
      return "Resuelta";
    case "dismissed":
      return "Descartada";
    case "blocked":
      return "Bloqueada";
    default:
      return eventType;
  }
}

export function CopilotOperationalActionsPanel({ provenance, onError }: Props) {
  const [actions, setActions] = useState<OperationalActionListItem[]>([]);
  const [summary, setSummary] = useState<OperationalActionQueueSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [bootstrapMessage, setBootstrapMessage] = useState<string | null>(null);
  const [patchingId, setPatchingId] = useState<string | null>(null);
  const [timelineId, setTimelineId] = useState<string | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState<OperationalActionEventRow[]>([]);
  const bootstrapRef = useRef(false);

  const refresh = useCallback(async (opts?: { soft?: boolean }) => {
    if (!opts?.soft) setLoading(true);
    onError?.(null);
    try {
      const res = await copilotApiFetch("/api/copilot/operational-actions?limit=120");
      const json = (await res.json()) as {
        actions?: OperationalActionListItem[];
        summary?: OperationalActionQueueSummary;
        error?: string;
      };
      if (!res.ok) {
        onError?.(json.error ?? "No se pudo cargar la cola operativa.");
        setActions([]);
        setSummary(EMPTY_SUMMARY);
        return;
      }
      setActions(json.actions ?? []);
      setSummary(json.summary ?? EMPTY_SUMMARY);
    } catch {
      onError?.("Error de red al cargar la cola operativa.");
      setActions([]);
      setSummary(EMPTY_SUMMARY);
    } finally {
      if (!opts?.soft) setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
    () =>
      actions.filter((action) =>
        ["pending", "in_progress", "blocked"].includes(action.operational_status)
      ),
    [actions]
  );

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

  const patchStatus = async (actionId: string, operationalStatus: OperationalActionStatus) => {
    setPatchingId(actionId);
    onError?.(null);
    try {
      const res = await copilotApiFetch(`/api/copilot/operational-actions/${actionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operational_status: operationalStatus }),
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

  const loadTimeline = async (actionId: string) => {
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
  };

  const toggleTimeline = (actionId: string) => {
    if (timelineId === actionId) {
      setTimelineId(null);
      setTimelineEvents([]);
      return;
    }
    setTimelineId(actionId);
    void loadTimeline(actionId);
  };

  return (
    <CopilotCard>
      <CopilotSectionTitle
        title="Cola operativa"
        subtitle="Seguimiento persistido: alerta → decisión → acción → responsable → resolución."
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

          {openActions.length > 0 ? (
            <ul className="space-y-3">
              {openActions.map((action) => {
                const busy = patchingId === action.id;
                const href = contextHref(action);
                const timelineOpen = timelineId === action.id;
                return (
                  <li
                    key={action.id}
                    className="rounded-2xl border border-[var(--copilot-border)] bg-white/85 px-3.5 py-3 shadow-sm"
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
                        </div>
                        <p className="mt-2 text-xs text-[var(--copilot-ink-muted)]">
                          {mapOperationalActionTypeLabel(action.action_type)}
                          {action.related_entity_id
                            ? ` · ${action.related_entity_type ?? "entidad"} ${action.related_entity_id}`
                            : ""}
                        </p>
                        <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
                          Vence {formatDate(action.due_at)} · Responsable{" "}
                          {action.assigned_to?.trim() || "sin asignar"}
                        </p>
                      </div>
                      {href ? (
                        <CopilotPrimaryLink href={href} className="shrink-0 text-xs">
                          Abrir contexto
                        </CopilotPrimaryLink>
                      ) : null}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <CopilotGhostButton
                        type="button"
                        disabled={busy || action.operational_status === "in_progress"}
                        className="text-xs"
                        onClick={() => void patchStatus(action.id, "in_progress")}
                      >
                        {busy ? (
                          <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : null}
                        Tomar acción
                      </CopilotGhostButton>
                      <CopilotGhostButton
                        type="button"
                        disabled={busy}
                        className="text-xs"
                        onClick={() => void patchStatus(action.id, "resolved")}
                      >
                        Marcar resuelta
                      </CopilotGhostButton>
                      <CopilotGhostButton
                        type="button"
                        disabled={busy || action.operational_status === "blocked"}
                        className="text-xs"
                        onClick={() => void patchStatus(action.id, "blocked")}
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
                            {timelineEvents.map((event) => (
                              <li
                                key={event.id}
                                className="border-b border-[var(--copilot-border)]/60 pb-2 last:border-b-0 last:pb-0"
                              >
                                <p className="text-xs font-semibold text-[var(--copilot-ink)]">
                                  {eventLabel(event.event_type)}
                                </p>
                                <p className="text-[11px] text-[var(--copilot-ink-muted)]">
                                  {formatDate(event.created_at)}
                                  {event.actor_label ? ` · ${event.actor_label}` : ""}
                                </p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}

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
                      {formatDate(action.resolved_at)}
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
