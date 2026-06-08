"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  CopilotBadge,
  CopilotCard,
  CopilotGhostButton,
  CopilotGhostLink,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { useRutasOperationalFeedSnapshot } from "@/components/copilot/rutas/rutas-operational-feed-context";
import type { RutasOptimisticActionPatch } from "@/components/copilot/rutas/rutas-operational-feed-context";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import {
  buildCommandCenterQueue,
  commandCenterPreviewItems,
  filterCommandCenterItems,
  moveCommandCenterSelection,
  selectCommandCenterItem,
} from "@/lib/copilot-command-center-queue";
import type { CommandCenterFilter, CommandCenterItem } from "@/lib/copilot-command-center-types";
import {
  COPILOT_UI_STATE_KEYS,
  readCopilotUiString,
  writeCopilotUiString,
} from "@/lib/copilot-ui-state";

type OperatorMe = {
  id: string;
  full_name: string;
  email: string;
};

const FILTERS: Array<{ id: CommandCenterFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "critical", label: "Críticos" },
  { id: "blocked", label: "Bloqueados" },
  { id: "overdue", label: "Vencidos" },
  { id: "mine", label: "Míos" },
  { id: "unassigned", label: "Sin dueño" },
  { id: "recurring", label: "Recurrentes" },
];

function isCommandCenterFilter(value: string): value is CommandCenterFilter {
  return FILTERS.some((filter) => filter.id === value);
}

function severityTone(
  severity: CommandCenterItem["severity"]
): "neutral" | "warning" | "danger" | "success" {
  if (severity === "critical") return "danger";
  if (severity === "high") return "warning";
  return "neutral";
}

function runtimeHealthLabel(status: string | undefined): string {
  if (status === "partial") return "Parcial";
  if (status === "degraded") return "Degradado";
  if (status === "stale") return "Cacheado";
  if (status === "error") return "Error";
  return "OK";
}

function runtimeHealthTone(
  status: string | undefined
): "neutral" | "warning" | "danger" | "success" {
  if (status === "ok") return "success";
  if (status === "stale") return "neutral";
  if (status === "partial") return "warning";
  return "danger";
}

function formatRelativeTime(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    const deltaMs = Date.now() - new Date(iso).getTime();
    const minutes = Math.round(deltaMs / 60_000);
    if (minutes < 1) return "ahora";
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.round(hours / 24);
    return `hace ${days} d`;
  } catch {
    return iso;
  }
}

function CommandCenterRow({
  item,
  selected,
  onSelect,
}: {
  item: CommandCenterItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-md border px-2 py-1.5 text-left transition ${
        selected
          ? "border-[var(--copilot-ink)]/30 bg-[var(--copilot-card-bg)] shadow-sm"
          : "border-[var(--copilot-border)]/70 bg-[var(--copilot-card-bg)]/70 hover:bg-[var(--copilot-panel-bg)]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <CopilotBadge tone={severityTone(item.severity)}>
          {item.severity === "critical" ? "Crítico" : item.severity === "high" ? "Alto" : "Normal"}
        </CopilotBadge>
        {item.status === "blocked" ? <CopilotBadge tone="danger">Bloqueado</CopilotBadge> : null}
        {item.status === "overdue" ? <CopilotBadge tone="warning">Vencido</CopilotBadge> : null}
        {!item.ownerLabel ? (
          <CopilotBadge tone="neutral">Sin responsable</CopilotBadge>
        ) : null}
      </div>
      <p className="mt-1 text-[12px] font-semibold text-[var(--copilot-ink)]">{item.title}</p>
      <p className="mt-0.5 text-[11px] text-[var(--copilot-ink-muted)]">{item.summary}</p>
    </button>
  );
}

function CommandCenterDetail({
  item,
  relatedEvents,
  busy,
  onAssignMe,
  onCompleteStep,
  onBlock,
  onUnblock,
  onCancel,
  onResolve,
}: {
  item: CommandCenterItem;
  relatedEvents: Array<{ id: string; typeLabel: string; occurredAt: string; detail?: string | null }>;
  busy: boolean;
  onAssignMe: () => void;
  onCompleteStep: () => void;
  onBlock: () => void;
  onUnblock: () => void;
  onCancel: () => void;
  onResolve: () => void;
}) {
  return (
    <CopilotCard className="border border-[var(--copilot-border)]/80 bg-[var(--copilot-card-bg)]/85 px-2.5 py-2 shadow-none">
      <p className="text-[12px] font-semibold text-[var(--copilot-ink)]">{item.title}</p>
      <p className="mt-0.5 text-[11px] text-[var(--copilot-ink-muted)]">{item.summary}</p>
      <p className="mt-1 text-[11px] text-[var(--copilot-ink-muted)]">
        {item.ownerLabel ? item.ownerLabel : "Sin responsable"}
        {item.dueLabel ? ` · ${item.dueLabel}` : ""}
      </p>
      {relatedEvents.length > 0 ? (
        <ul className="mt-1 space-y-0.5 text-[10px] text-[var(--copilot-ink-muted)]">
          {relatedEvents.slice(0, 3).map((event) => (
            <li key={event.id}>
              {event.typeLabel} · {formatRelativeTime(event.occurredAt)}
              {event.detail ? ` · ${event.detail}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {item.type === "workflow" ? (
          <>
            <CopilotGhostButton type="button" disabled={busy} className="px-2 py-1 text-[10px]" onClick={onAssignMe}>
              Asignarme
            </CopilotGhostButton>
            <CopilotGhostButton
              type="button"
              disabled={busy}
              className="px-2 py-1 text-[10px]"
              onClick={onCompleteStep}
            >
              Completar paso
            </CopilotGhostButton>
            {item.status === "blocked" ? (
              <CopilotGhostButton type="button" disabled={busy} className="px-2 py-1 text-[10px]" onClick={onUnblock}>
                Desbloquear
              </CopilotGhostButton>
            ) : (
              <CopilotGhostButton type="button" disabled={busy} className="px-2 py-1 text-[10px]" onClick={onBlock}>
                Bloquear
              </CopilotGhostButton>
            )}
            <CopilotGhostButton type="button" disabled={busy} className="px-2 py-1 text-[10px]" onClick={onCancel}>
              Cancelar
            </CopilotGhostButton>
          </>
        ) : null}
        {item.type === "action" ? (
          <>
            <CopilotGhostButton type="button" disabled={busy} className="px-2 py-1 text-[10px]" onClick={onAssignMe}>
              Asignarme
            </CopilotGhostButton>
            <CopilotGhostButton type="button" disabled={busy} className="px-2 py-1 text-[10px]" onClick={onResolve}>
              Resolver
            </CopilotGhostButton>
            <CopilotGhostButton type="button" disabled={busy} className="px-2 py-1 text-[10px]" onClick={onBlock}>
              Bloquear
            </CopilotGhostButton>
          </>
        ) : null}
        {item.cta.href ? (
          <Link
            href={item.cta.href}
            className="inline-flex items-center px-2 py-1 text-[10px] font-medium text-[var(--copilot-ink-muted)] underline-offset-2 hover:text-[var(--copilot-ink)] hover:underline"
          >
            {item.cta.label}
          </Link>
        ) : null}
        <CopilotGhostLink
          href="/copilot/acciones"
          className="border-transparent bg-transparent px-2 py-1 text-[10px] font-medium text-[var(--copilot-ink-muted)] shadow-none hover:bg-transparent hover:text-[var(--copilot-ink)] hover:underline"
        >
          Abrir cola
        </CopilotGhostLink>
      </div>
    </CopilotCard>
  );
}

export function RutasOperationalCommandCenterSection() {
  const {
    items: feedItems,
    memorySignals,
    workflows,
    operationalEvents,
    operationalAutomation,
    health,
    loading,
    refresh,
    applyOptimisticActionPatch,
    restoreOptimisticSnapshot,
    setActionFeedback,
  } = useRutasOperationalFeedSnapshot();
  const [operator, setOperator] = useState<OperatorMe | null>(null);
  const [filter, setFilter] = useState<CommandCenterFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await copilotApiFetch("/api/copilot/me");
        const json = (await res.json()) as { appUser?: OperatorMe };
        if (res.ok && json.appUser) setOperator(json.appUser);
      } catch {
        /* opcional */
      }
    })();
  }, []);

  useEffect(() => {
    const stored = readCopilotUiString(COPILOT_UI_STATE_KEYS.rutasCommandCenterFilter, "all");
    if (isCommandCenterFilter(stored)) {
      setFilter(stored);
    }
  }, []);

  const currentUser = useMemo(
    () => ({
      id: operator?.id,
      label: operator?.full_name?.trim() || operator?.email,
    }),
    [operator]
  );

  const queue = useMemo(
    () =>
      buildCommandCenterQueue({
        workflows,
        feedItems,
        memorySignals,
        events: operationalEvents,
        currentUser,
        automation: operationalAutomation ?? undefined,
      }),
    [currentUser, feedItems, memorySignals, operationalAutomation, operationalEvents, workflows]
  );

  const filteredItems = useMemo(
    () => filterCommandCenterItems(queue.items, filter, currentUser),
    [currentUser, filter, queue.items]
  );

  const previewItems = useMemo(() => commandCenterPreviewItems(filteredItems, 8), [filteredItems]);
  const selectedItem = useMemo(
    () => selectCommandCenterItem(previewItems, selectedId),
    [previewItems, selectedId]
  );

  const relatedEvents = useMemo(() => {
    if (!selectedItem) return [];
    if (selectedItem.type === "workflow") {
      const workflowId = String(selectedItem.metadata?.workflowId ?? "");
      return operationalEvents.filter(
        (event) => event.entityId === workflowId || event.href === "/copilot/rutas"
      );
    }
    if (selectedItem.type === "action") {
      const actionId = String(selectedItem.metadata?.actionId ?? "");
      return operationalEvents.filter((event) => event.entityId === actionId);
    }
    return operationalEvents.slice(0, 3);
  }, [operationalEvents, selectedItem]);

  const setFilterPersisted = useCallback((next: CommandCenterFilter) => {
    setFilter(next);
    writeCopilotUiString(COPILOT_UI_STATE_KEYS.rutasCommandCenterFilter, next);
  }, []);

  const patchAction = useCallback(
    async (actionId: string, body: Record<string, unknown>, optimistic: RutasOptimisticActionPatch) => {
      setBusyItemId(`action:${actionId}`);
      setError(null);
      applyOptimisticActionPatch(optimistic);
      setActionFeedback({ tone: "success", message: "Actualización enviada." });
      try {
        const res = await copilotApiFetch(`/api/copilot/operational-actions/${actionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) {
          restoreOptimisticSnapshot();
          setActionFeedback(null);
          setError(json.error ?? "No se pudo actualizar la acción.");
          return;
        }
        await refresh({ fresh: true, silent: true });
      } catch {
        restoreOptimisticSnapshot();
        setActionFeedback(null);
        setError("Error de red al actualizar la acción.");
      } finally {
        setBusyItemId(null);
      }
    },
    [applyOptimisticActionPatch, refresh, restoreOptimisticSnapshot, setActionFeedback]
  );

  const patchWorkflow = useCallback(
    async (workflowId: string, body: Record<string, unknown>) => {
      setBusyItemId(`workflow:${workflowId}`);
      setError(null);
      try {
        const res = await copilotApiFetch(`/api/copilot/operational-workflows/${workflowId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as { ok?: boolean; message?: string };
        if (!res.ok || json.ok === false) {
          setError(json.message ?? "No se pudo actualizar el workflow.");
          return;
        }
        await refresh({ fresh: true, silent: true });
      } catch {
        setError("Error de red al actualizar el workflow.");
      } finally {
        setBusyItemId(null);
      }
    },
    [refresh]
  );

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "j") {
        event.preventDefault();
        setSelectedId((current) => moveCommandCenterSelection(previewItems, current, "next"));
      }
      if (event.key === "k") {
        event.preventDefault();
        setSelectedId((current) => moveCommandCenterSelection(previewItems, current, "prev"));
      }
      if (event.key === "Enter") {
        event.preventDefault();
        setSelectedId((current) => current ?? previewItems[0]?.id ?? null);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedId(null);
      }
    };
    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
  }, [previewItems]);

  if (!loading && previewItems.length === 0 && filter === "all") {
    return (
      <section
        ref={sectionRef}
        tabIndex={-1}
        data-testid="rutas-command-center"
        className="space-y-1 outline-none"
      >
        <CopilotSectionTitle
          title="Comando operativo"
          subtitle="Cola priorizada para resolver el día."
          action={
            <CopilotBadge tone={runtimeHealthTone(health?.status)}>
              {runtimeHealthLabel(health?.status)}
            </CopilotBadge>
          }
        />
        <CopilotCard className="border border-[var(--copilot-border)]/70 bg-[var(--copilot-card-bg)]/70 px-2.5 py-2 shadow-none">
          <p className="text-[11px] text-[var(--copilot-ink-muted)]">{queue.emptyMessage}</p>
        </CopilotCard>
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      data-testid="rutas-command-center"
      className="space-y-1 outline-none"
    >
      <CopilotSectionTitle
        title="Pendientes importantes"
        subtitle="Lo que necesita atención hoy."
        action={
          <CopilotBadge tone={runtimeHealthTone(health?.status)}>
            {runtimeHealthLabel(health?.status)}
          </CopilotBadge>
        }
      />

      {operationalAutomation?.recommendations?.length ? (
        <CopilotCard className="border border-[var(--copilot-border)]/70 bg-[var(--copilot-card-bg)]/70 px-2.5 py-2 shadow-none">
          <p className="text-[11px] font-semibold text-[var(--copilot-ink)]">Recomendaciones automáticas</p>
          <ul className="mt-1 space-y-1">
            {operationalAutomation.recommendations.slice(0, 4).map((recommendation) => (
              <li key={recommendation.id} className="text-[10px] text-[var(--copilot-ink-muted)]">
                <span className="font-medium text-[var(--copilot-ink)]">{recommendation.title}</span>
                {" · "}
                {recommendation.summary}
              </li>
            ))}
          </ul>
        </CopilotCard>
      ) : null}

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((entry) => (
          <CopilotGhostButton
            key={entry.id}
            type="button"
            className={`px-2 py-1 text-[10px] ${filter === entry.id ? "bg-[var(--copilot-card-bg)]" : ""}`}
            onClick={() => setFilterPersisted(entry.id)}
          >
            {entry.label}
          </CopilotGhostButton>
        ))}
      </div>

      {error ? (
        <p className="text-[11px] text-rose-800" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--copilot-ink-muted)]">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          Preparando comando operativo…
        </div>
      ) : (
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <ul className="space-y-1">
            {previewItems.map((item) => (
              <li key={item.id}>
                <CommandCenterRow
                  item={item}
                  selected={selectedId === item.id}
                  onSelect={() => setSelectedId(item.id)}
                />
              </li>
            ))}
          </ul>
          {selectedItem ? (
            <CommandCenterDetail
              item={selectedItem}
              relatedEvents={relatedEvents}
              busy={busyItemId === selectedItem.id}
              onAssignMe={() => {
                const label = operator?.full_name?.trim() || operator?.email;
                if (!label) {
                  setError("No se pudo resolver el usuario actual para asignar.");
                  return;
                }
                if (selectedItem.type === "workflow") {
                  void patchWorkflow(String(selectedItem.metadata?.workflowId), {
                    action: "assign",
                    assigned_to: label,
                    owner_label: label,
                    assigned_user_id: operator?.id ?? null,
                  });
                  return;
                }
                if (selectedItem.type === "action") {
                  void patchAction(
                    String(selectedItem.metadata?.actionId),
                    { assigned_to: label, owner_id: operator?.id ?? null },
                    {
                      actionId: String(selectedItem.metadata?.actionId),
                      assignedTo: label,
                      ownerLabel: label,
                    }
                  );
                }
              }}
              onCompleteStep={() => {
                if (selectedItem.type !== "workflow") return;
                const stepId = selectedItem.metadata?.currentStepId;
                if (typeof stepId !== "string") return;
                void patchWorkflow(String(selectedItem.metadata?.workflowId), {
                  action: "complete_step",
                  stepId,
                });
              }}
              onBlock={() => {
                if (selectedItem.type === "workflow") {
                  void patchWorkflow(String(selectedItem.metadata?.workflowId), { action: "block" });
                  return;
                }
                if (selectedItem.type === "action") {
                  void patchAction(
                    String(selectedItem.metadata?.actionId),
                    { operational_status: "blocked" },
                    {
                      actionId: String(selectedItem.metadata?.actionId),
                      operationalStatus: "blocked",
                      blocked: true,
                    }
                  );
                }
              }}
              onUnblock={() => {
                if (selectedItem.type !== "workflow") return;
                void patchWorkflow(String(selectedItem.metadata?.workflowId), { action: "unblock" });
              }}
              onCancel={() => {
                if (selectedItem.type !== "workflow") return;
                void patchWorkflow(String(selectedItem.metadata?.workflowId), { action: "cancel" });
              }}
              onResolve={() => {
                if (selectedItem.type !== "action") return;
                void patchAction(
                  String(selectedItem.metadata?.actionId),
                  { operational_status: "resolved" },
                  {
                    actionId: String(selectedItem.metadata?.actionId),
                    operationalStatus: "resolved",
                    blocked: false,
                  }
                );
              }}
            />
          ) : (
            <CopilotCard className="border border-dashed border-[var(--copilot-border)]/70 bg-[var(--copilot-card-bg)]/50 px-2.5 py-2 shadow-none">
              <p className="text-[11px] text-[var(--copilot-ink-muted)]">
                Seleccioná un ítem para ver contexto y acciones rápidas.
              </p>
            </CopilotCard>
          )}
        </div>
      )}
    </section>
  );
}
