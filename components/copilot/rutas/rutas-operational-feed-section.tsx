"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  COPILOT_UI_STATE_KEYS,
  readCopilotUiBoolean,
  writeCopilotUiBoolean,
} from "@/lib/copilot-ui-state";
import type {
  OperationalFeedGroup,
  OperationalFeedItem,
} from "@/lib/copilot-operational-feed-types";
import type { OperationalTimelineItem } from "@/lib/copilot-operational-events-types";
import { mapOperationalSlaLabel } from "@/lib/copilot-operational-actions-format";
import type { OperationalActionSlaStatus } from "@/lib/copilot-operational-actions-types";

type OperatorMe = {
  id: string;
  full_name: string;
  email: string;
};

type OwnershipFilter = "all" | "mine" | "unassigned" | "blocked" | "overdue";

const OWNERSHIP_FILTERS: Array<{ id: OwnershipFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "mine", label: "Mías" },
  { id: "unassigned", label: "Sin dueño" },
  { id: "blocked", label: "Bloqueadas" },
  { id: "overdue", label: "Vencidas" },
];

const SOURCE_LABEL: Record<OperationalFeedItem["source"], string> = {
  alert: "Alerta",
  action: "Acción",
  insight: "Insight",
  treasury: "Tesorería",
  finance: "Finanzas",
  customer: "Cliente",
};

function severityTone(
  severity: OperationalFeedItem["severity"]
): "neutral" | "warning" | "danger" | "success" {
  if (severity === "critical") return "danger";
  if (severity === "high") return "warning";
  return "neutral";
}

function formatDueAt(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("es-AR", { dateStyle: "short" });
  } catch {
    return iso;
  }
}

function formatRelativeTime(iso: string): string {
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

function actionIdFromItem(item: OperationalFeedItem): string | null {
  const metadata = item.metadata ?? {};
  if (typeof metadata.actionId === "string") return metadata.actionId;
  if (item.id.startsWith("action:")) return item.id.slice("action:".length);
  return null;
}

function operatorLabels(operator: OperatorMe | null): string[] {
  if (!operator) return [];
  return [operator.full_name, operator.email]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value));
}

function matchesOwnershipFilter(
  group: OperationalFeedGroup,
  filter: OwnershipFilter,
  operator: OperatorMe | null
): boolean {
  if (filter === "all") return true;
  const item = group.primaryItem;
  const ownerLabel = item.owner?.label?.trim().toLowerCase() ?? "";
  const slaStatus =
    item.source === "action" && typeof item.metadata?.slaStatus === "string"
      ? item.metadata.slaStatus
      : null;

  if (filter === "mine") {
    const labels = operatorLabels(operator);
    return labels.length > 0 && labels.includes(ownerLabel);
  }
  if (filter === "unassigned") {
    return ownerLabel.length === 0;
  }
  if (filter === "blocked") {
    return item.blocked === true || item.status === "blocked";
  }
  if (filter === "overdue") {
    return slaStatus === "overdue";
  }
  return true;
}

function groupCountBadge(group: OperationalFeedGroup): string | null {
  if (group.itemCount <= 1) return null;
  if (group.source === "treasury") return `${group.itemCount} días afectados`;
  if (group.source === "action") return `${group.itemCount} seguimientos`;
  return `${group.itemCount} alertas relacionadas`;
}

function FeedQuickActions({
  item,
  busy,
  onAssignToMe,
  onResolve,
  onBlock,
  compact = false,
}: {
  item: OperationalFeedItem;
  busy: boolean;
  onAssignToMe: (item: OperationalFeedItem) => void;
  onResolve: (actionId: string) => void;
  onBlock: (actionId: string) => void;
  compact?: boolean;
}) {
  const actionId = actionIdFromItem(item);

  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? "mt-1.5" : "mt-2"}`}>
      {item.quickActions?.includes("assign_to_me") && actionId ? (
        <CopilotGhostButton
          type="button"
          disabled={busy}
          className="px-2 py-1 text-[11px]"
          onClick={() => onAssignToMe(item)}
        >
          Asignarme
        </CopilotGhostButton>
      ) : null}
      {item.quickActions?.includes("resolve") && actionId ? (
        <CopilotGhostButton
          type="button"
          disabled={busy}
          className="px-2 py-1 text-[11px]"
          onClick={() => onResolve(actionId)}
        >
          Resolver
        </CopilotGhostButton>
      ) : null}
      {item.quickActions?.includes("block") && actionId ? (
        <CopilotGhostButton
          type="button"
          disabled={busy}
          className="px-2 py-1 text-[11px]"
          onClick={() => onBlock(actionId)}
        >
          Bloquear
        </CopilotGhostButton>
      ) : null}
      {item.quickActions?.includes("open") && item.href ? (
        <Link
          href={item.href}
          className="rounded-md border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80 px-2 py-1 text-[11px] font-semibold text-[var(--copilot-ink)] transition hover:bg-[var(--copilot-panel-bg)]"
        >
          Abrir detalle
        </Link>
      ) : null}
    </div>
  );
}

function FeedItemMeta({ item }: { item: OperationalFeedItem }) {
  const slaStatus =
    item.source === "action" && typeof item.metadata?.slaStatus === "string"
      ? item.metadata.slaStatus
      : null;

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        <CopilotBadge tone={severityTone(item.severity)}>{item.severity}</CopilotBadge>
        <CopilotBadge tone="neutral">{SOURCE_LABEL[item.source]}</CopilotBadge>
        {item.blocked ? <CopilotBadge tone="danger">Bloqueada</CopilotBadge> : null}
        {slaStatus ? (
          <CopilotBadge tone="warning">
            {mapOperationalSlaLabel(slaStatus as OperationalActionSlaStatus)}
          </CopilotBadge>
        ) : null}
      </div>
      <p className="mt-1 text-[11px] text-[var(--copilot-ink-muted)]">
        {item.owner?.label ? `Responsable: ${item.owner.label}` : "Sin responsable"}
        {item.dueAt ? ` · Vence ${formatDueAt(item.dueAt)}` : ""}
      </p>
    </>
  );
}

function FeedGroupCard({
  group,
  expanded,
  busyActionId,
  onToggle,
  onAssignToMe,
  onResolve,
  onBlock,
  compact = false,
}: {
  group: OperationalFeedGroup;
  expanded: boolean;
  busyActionId: string | null;
  onToggle: () => void;
  onAssignToMe: (item: OperationalFeedItem) => void;
  onResolve: (actionId: string) => void;
  onBlock: (actionId: string) => void;
  compact?: boolean;
}) {
  const primary = group.primaryItem;
  const actionId = actionIdFromItem(primary);
  const busy = actionId != null && busyActionId === actionId;
  const canExpand = group.itemCount > 1;
  const countBadge = groupCountBadge(group);

  return (
    <CopilotCard className="border border-[var(--copilot-border)]/80 bg-[var(--copilot-card-bg)]/75 px-2.5 py-2 shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink)]">
              Ejecución
            </span>
            <CopilotBadge tone={severityTone(group.severity)}>{group.severity}</CopilotBadge>
            <CopilotBadge tone="neutral">{SOURCE_LABEL[group.source]}</CopilotBadge>
            {countBadge ? <CopilotBadge tone="neutral">{countBadge}</CopilotBadge> : null}
          </div>
          <p className="mt-1 text-[13px] font-medium leading-snug text-[var(--copilot-ink)]">
            {group.title}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-[var(--copilot-ink-muted)]">
            {group.summary}
          </p>
          {!compact ? <FeedItemMeta item={primary} /> : null}
        </div>
        {primary.href ? (
          <Link
            href={primary.href}
            className="shrink-0 text-[10px] font-medium text-[var(--copilot-ink-muted)] underline-offset-2 transition hover:text-[var(--copilot-ink)] hover:underline"
          >
            {group.cta?.label ?? "Resolver primero"}
          </Link>
        ) : null}
      </div>

      <FeedQuickActions
        item={primary}
        busy={busy}
        compact={compact}
        onAssignToMe={onAssignToMe}
        onResolve={onResolve}
        onBlock={onBlock}
      />

      {canExpand ? (
        <CopilotGhostButton type="button" className="mt-1 px-0 py-0 text-[10px]" onClick={onToggle}>
          {expanded ? "Ocultar detalle" : "Ver detalle"}
        </CopilotGhostButton>
      ) : null}

      {expanded && canExpand ? (
        <ul className="mt-2 space-y-1 border-t border-[var(--copilot-border)]/70 pt-2">
          {group.items.map((item) => (
            <li
              key={item.id}
              className="rounded-md border border-[var(--copilot-border)]/70 bg-[var(--copilot-card-bg)]/70 px-2 py-1.5"
            >
              <p className="text-[11px] font-semibold text-[var(--copilot-ink)]">{item.title}</p>
              {item.summary ? (
                <p className="mt-0.5 text-[10px] text-[var(--copilot-ink-muted)]">{item.summary}</p>
              ) : null}
              {item.href ? (
                <Link
                  href={item.href}
                  className="mt-1 inline-flex text-[10px] font-semibold text-[var(--copilot-ink)] underline-offset-2 hover:underline"
                >
                  Abrir
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </CopilotCard>
  );
}

function TimelineRow({ event }: { event: OperationalTimelineItem }) {
  return (
    <li className="grid grid-cols-[minmax(4.5rem,auto)_1fr_auto] items-baseline gap-x-2 gap-y-0.5 border-b border-[var(--copilot-border)]/40 py-1 text-[11px] last:border-b-0">
      <span className="font-semibold tabular-nums text-[var(--copilot-ink)]">
        {formatRelativeTime(event.occurredAt)}
      </span>
      <span className="min-w-0 text-[var(--copilot-ink-muted)]">
        <span className="mr-1 inline-flex align-middle">
          <CopilotBadge tone={event.severity === "danger" ? "danger" : event.severity === "success" ? "success" : "neutral"}>
            {event.typeLabel}
          </CopilotBadge>
        </span>
        <span className="align-middle text-[var(--copilot-ink)]">{event.entityLabel}</span>
        <span className="align-middle text-[var(--copilot-ink-muted)]">
          {" "}
          · {event.actorLabel ?? "Sistema"}
        </span>
        {event.contextLabel ? (
          <span className="block text-[10px] text-[var(--copilot-ink-muted)]">{event.contextLabel}</span>
        ) : null}
        {event.detail ? (
          <span className="block text-[10px] text-[var(--copilot-ink-muted)]">{event.detail}</span>
        ) : null}
      </span>
      {event.href ? (
        <Link
          href={event.href}
          className="shrink-0 text-[10px] font-medium text-[var(--copilot-ink-muted)] underline-offset-2 hover:text-[var(--copilot-ink)] hover:underline"
        >
          Abrir
        </Link>
      ) : (
        <span />
      )}
    </li>
  );
}

function EmptyOperationalCenter() {
  return (
    <CopilotCard className="border border-[var(--copilot-border)]/70 bg-[var(--copilot-card-bg)]/70 px-2.5 py-2 shadow-none">
      <p className="text-[13px] font-medium text-[var(--copilot-ink)]">Sin seguimientos activos</p>
      <p className="mt-0.5 text-[11px] text-[var(--copilot-ink-muted)]">
        No hay prioridades abiertas en el centro operativo.
      </p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <CopilotGhostLink
          href="/copilot/alertas"
          className="border-transparent bg-transparent px-0 py-0 text-[11px] font-medium text-[var(--copilot-ink-muted)] shadow-none hover:bg-transparent hover:text-[var(--copilot-ink)] hover:underline"
        >
          Ir a Alertas
        </CopilotGhostLink>
        <CopilotGhostLink
          href="/copilot/tesoreria"
          className="border-transparent bg-transparent px-0 py-0 text-[11px] font-medium text-[var(--copilot-ink-muted)] shadow-none hover:bg-transparent hover:text-[var(--copilot-ink)] hover:underline"
        >
          Revisar Tesorería
        </CopilotGhostLink>
        <CopilotGhostLink
          href="/copilot/acciones"
          className="border-transparent bg-transparent px-0 py-0 text-[11px] font-medium text-[var(--copilot-ink-muted)] shadow-none hover:bg-transparent hover:text-[var(--copilot-ink)] hover:underline"
        >
          Abrir cola
        </CopilotGhostLink>
      </div>
    </CopilotCard>
  );
}

export function RutasOperationalFeedSection() {
  const {
    groups,
    loading,
    error,
    actionFeedback,
    refresh,
    applyOptimisticActionPatch,
    restoreOptimisticSnapshot,
    setActionFeedback,
    operationalEvents,
  } = useRutasOperationalFeedSnapshot();
  const [operator, setOperator] = useState<OperatorMe | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>("all");
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    setCompact(readCopilotUiBoolean(COPILOT_UI_STATE_KEYS.rutasOperationalFeedCompact, false));
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await copilotApiFetch("/api/copilot/me");
        const json = (await res.json()) as { appUser?: OperatorMe };
        if (res.ok && json.appUser) setOperator(json.appUser);
      } catch {
        /* asignación opcional */
      }
    })();
  }, []);

  const patchAction = async (
    actionId: string,
    body: Record<string, unknown>,
    optimistic: RutasOptimisticActionPatch,
    successMessage: string
  ) => {
    setBusyActionId(actionId);
    setMutationError(null);
    setActionFeedback(null);
    applyOptimisticActionPatch(optimistic);
    setActionFeedback({ tone: "success", message: successMessage });
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
        setMutationError(json.error ?? "No se pudo actualizar la acción.");
        return;
      }
      await refresh({ fresh: true, silent: true });
    } catch {
      restoreOptimisticSnapshot();
      setActionFeedback(null);
      setMutationError("Error de red al actualizar la acción.");
    } finally {
      setBusyActionId(null);
    }
  };

  const assignToMe = (item: OperationalFeedItem) => {
    const actionId = actionIdFromItem(item);
    if (!actionId) return;
    const label = operator?.full_name?.trim() || operator?.email;
    if (!label) {
      setMutationError("No se pudo resolver el usuario actual para asignar.");
      return;
    }
    void patchAction(
      actionId,
      {
        assigned_to: label,
        owner_id: operator?.id ?? null,
      },
      {
        actionId,
        assignedTo: label,
        ownerLabel: label,
      },
      "Asignación actualizada."
    );
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const toggleCompact = () => {
    setCompact((prev) => {
      const next = !prev;
      writeCopilotUiBoolean(COPILOT_UI_STATE_KEYS.rutasOperationalFeedCompact, next);
      return next;
    });
  };

  const isExpanded = (group: OperationalFeedGroup) =>
    expandedGroupIds.has(group.id) || !group.collapsedByDefault;

  const hasSignal = groups.length > 0 || operationalEvents.length > 0 || loading;
  const filteredGroups = useMemo(
    () => groups.filter((group) => matchesOwnershipFilter(group, ownershipFilter, operator)),
    [groups, operator, ownershipFilter]
  );
  const timelinePreview = useMemo(() => operationalEvents.slice(0, 10), [operationalEvents]);

  return (
    <section className={`border-t border-[var(--copilot-border)]/50 ${hasSignal || loading ? "pt-2.5" : "pt-1.5"}`}>
      <CopilotSectionTitle
        title="Centro operativo"
        subtitle="Ejecución y cierre de prioridades abiertas."
        action={
          <div className="flex items-center gap-2">
            <CopilotGhostButton
              type="button"
              className="px-0 py-0 text-[10px]"
              onClick={toggleCompact}
            >
              {compact ? "Vista detallada" : "Vista compacta"}
            </CopilotGhostButton>
            <CopilotGhostLink
              href="/copilot/acciones"
              className="border-transparent bg-transparent px-0 py-0 text-[11px] font-medium text-[var(--copilot-ink-muted)] shadow-none hover:bg-transparent hover:text-[var(--copilot-ink)] hover:underline"
            >
              Abrir cola
            </CopilotGhostLink>
          </div>
        }
      />

      {error ? (
        <p className="text-[11px] text-rose-800" role="alert">
          {error}
        </p>
      ) : null}

      {actionFeedback ? (
        <p
          className={`text-[11px] ${actionFeedback.tone === "success" ? "text-emerald-900" : "text-rose-800"}`}
          role="status"
        >
          {actionFeedback.message}
        </p>
      ) : null}

      {mutationError ? (
        <p className="text-[11px] text-rose-800" role="alert">
          {mutationError}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--copilot-ink-muted)]">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          Cargando centro operativo…
        </div>
      ) : !hasSignal ? (
        <EmptyOperationalCenter />
      ) : (
        <div className="space-y-2">
          {groups.length > 0 ? (
            <div>
              <div className="flex flex-wrap gap-1.5">
                {OWNERSHIP_FILTERS.map((filter) => (
                  <CopilotGhostButton
                    key={filter.id}
                    type="button"
                    className={`px-2 py-0.5 text-[10px] ${
                      ownershipFilter === filter.id
                        ? "border-[var(--copilot-ink)] text-[var(--copilot-ink)]"
                        : ""
                    }`}
                    onClick={() => setOwnershipFilter(filter.id)}
                  >
                    {filter.label}
                  </CopilotGhostButton>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Seguimiento operativo
              </p>
              {filteredGroups.length === 0 ? (
                <p className="mt-1 text-[11px] text-[var(--copilot-ink-muted)]">
                  Sin seguimientos para este filtro.
                </p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {filteredGroups.map((group) => (
                    <li key={group.id}>
                      <FeedGroupCard
                        group={group}
                        expanded={isExpanded(group)}
                        busyActionId={busyActionId}
                        compact={compact}
                        onToggle={() => toggleGroup(group.id)}
                        onAssignToMe={assignToMe}
                        onResolve={(actionId) =>
                          void patchAction(
                            actionId,
                            { operational_status: "resolved" },
                            {
                              actionId,
                              operationalStatus: "resolved",
                              blocked: false,
                            },
                            "Seguimiento resuelto."
                          )
                        }
                        onBlock={(actionId) =>
                          void patchAction(
                            actionId,
                            { operational_status: "blocked" },
                            {
                              actionId,
                              operationalStatus: "blocked",
                              blocked: true,
                            },
                            "Seguimiento bloqueado."
                          )
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {loading ? (
            <CopilotCard className="border border-[var(--copilot-border)]/70 bg-[var(--copilot-card-bg)]/60 px-2.5 py-1.5 shadow-none">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Actividad reciente
              </p>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--copilot-ink-muted)]">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Cargando actividad…
              </div>
            </CopilotCard>
          ) : timelinePreview.length > 0 ? (
            <CopilotCard className="border border-[var(--copilot-border)]/70 bg-[var(--copilot-card-bg)]/60 px-2.5 py-1.5 shadow-none">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Actividad reciente
              </p>
              <ul className="mt-1">
                {timelinePreview.map((event) => (
                  <TimelineRow key={event.id} event={event} />
                ))}
              </ul>
            </CopilotCard>
          ) : null}
        </div>
      )}
    </section>
  );
}
