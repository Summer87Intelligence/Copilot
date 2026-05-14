"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  CopilotBadge,
  CopilotCard,
  CopilotGhostButton,
  CopilotGhostLink,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { buildOperationalActionHref } from "@/lib/copilot-alert-ops-mapper";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import { buildGroupedOperationalFeed } from "@/lib/copilot-operational-feed-groups";
import type {
  OperationalFeedGroup,
  OperationalFeedItem,
  OperationalFeedTimelineItem,
} from "@/lib/copilot-operational-feed-types";
import {
  mapOperationalEventLabel,
  mapOperationalSlaLabel,
} from "@/lib/copilot-operational-actions-format";
import type { OperationalActionSlaStatus } from "@/lib/copilot-operational-actions-types";

type OperatorMe = {
  id: string;
  full_name: string;
  email: string;
};

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
}: {
  item: OperationalFeedItem;
  busy: boolean;
  onAssignToMe: (item: OperationalFeedItem) => void;
  onResolve: (actionId: string) => void;
  onBlock: (actionId: string) => void;
}) {
  const actionId = actionIdFromItem(item);

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {item.quickActions?.includes("assign_to_me") && actionId ? (
        <CopilotGhostButton
          type="button"
          disabled={busy}
          className="text-xs"
          onClick={() => onAssignToMe(item)}
        >
          Asignarme
        </CopilotGhostButton>
      ) : null}
      {item.quickActions?.includes("resolve") && actionId ? (
        <CopilotGhostButton
          type="button"
          disabled={busy}
          className="text-xs"
          onClick={() => onResolve(actionId)}
        >
          Resolver
        </CopilotGhostButton>
      ) : null}
      {item.quickActions?.includes("block") && actionId ? (
        <CopilotGhostButton
          type="button"
          disabled={busy}
          className="text-xs"
          onClick={() => onBlock(actionId)}
        >
          Bloquear
        </CopilotGhostButton>
      ) : null}
      {item.quickActions?.includes("open") && item.href ? (
        <Link
          href={item.href}
          className="rounded-lg border border-[var(--copilot-border)] bg-white/80 px-3 py-1.5 text-xs font-semibold text-[var(--copilot-ink)] transition hover:bg-white"
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
      <div className="flex flex-wrap gap-2">
        <CopilotBadge tone={severityTone(item.severity)}>{item.severity}</CopilotBadge>
        <CopilotBadge tone="neutral">{SOURCE_LABEL[item.source]}</CopilotBadge>
        {item.blocked ? <CopilotBadge tone="danger">Bloqueada</CopilotBadge> : null}
        {slaStatus ? (
          <CopilotBadge tone="warning">
            {mapOperationalSlaLabel(slaStatus as OperationalActionSlaStatus)}
          </CopilotBadge>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-[var(--copilot-ink-muted)]">
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
    <CopilotCard
      className={
        compact
          ? "border-[var(--copilot-border)]/70 bg-white/70 px-3 py-2.5 shadow-none"
          : "border-[var(--copilot-border)]/70 bg-white/65 px-3 py-2.5 shadow-none"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <CopilotBadge tone={severityTone(group.severity)}>{group.severity}</CopilotBadge>
            <CopilotBadge tone="neutral">{SOURCE_LABEL[group.source]}</CopilotBadge>
            {countBadge ? <CopilotBadge tone="neutral">{countBadge}</CopilotBadge> : null}
          </div>
          <p className="mt-1.5 text-sm font-medium text-[var(--copilot-ink)]">{group.title}</p>
          <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">{group.summary}</p>
          {!compact ? <FeedItemMeta item={primary} /> : null}
        </div>
        {primary.href ? (
          <Link
            href={primary.href}
            className="shrink-0 text-xs font-medium text-[var(--copilot-ink-muted)] underline-offset-2 transition hover:text-[var(--copilot-ink)] hover:underline"
          >
            {group.cta?.label ?? "Resolver primero"}
          </Link>
        ) : null}
      </div>

      <FeedQuickActions
        item={primary}
        busy={busy}
        onAssignToMe={onAssignToMe}
        onResolve={onResolve}
        onBlock={onBlock}
      />

      {canExpand ? (
        <CopilotGhostButton type="button" className="mt-2 text-xs" onClick={onToggle}>
          {expanded ? "Ocultar detalle" : "Ver detalle"}
        </CopilotGhostButton>
      ) : null}

      {expanded && canExpand ? (
        <ul className="mt-3 space-y-2 border-t border-[var(--copilot-border)]/70 pt-3">
          {group.items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-[var(--copilot-border)]/70 bg-white/70 px-3 py-2"
            >
              <p className="text-xs font-semibold text-[var(--copilot-ink)]">{item.title}</p>
              {item.summary ? (
                <p className="mt-1 text-[11px] text-[var(--copilot-ink-muted)]">{item.summary}</p>
              ) : null}
              {item.href ? (
                <Link
                  href={item.href}
                  className="mt-2 inline-flex text-[11px] font-semibold text-[var(--copilot-ink)] underline-offset-2 hover:underline"
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

export function RutasOperationalFeedSection() {
  const [groups, setGroups] = useState<OperationalFeedGroup[]>([]);
  const [timeline, setTimeline] = useState<OperationalFeedTimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [operator, setOperator] = useState<OperatorMe | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [feedRes, timelineRes] = await Promise.all([
        copilotApiFetch("/api/copilot/operational-feed"),
        copilotApiFetch("/api/copilot/operational-feed/timeline?limit=5"),
      ]);
      const feedJson = (await feedRes.json()) as {
        items?: OperationalFeedItem[];
        groups?: OperationalFeedGroup[];
        priorities?: OperationalFeedGroup[];
        error?: string;
      };
      const timelineJson = (await timelineRes.json()) as {
        events?: OperationalFeedTimelineItem[];
      };
      if (!feedRes.ok) {
        setGroups([]);
        setError(feedJson.error ?? "No se pudo cargar el centro operativo.");
      } else {
        const items = feedJson.items ?? [];
        const grouped =
          feedJson.groups && feedJson.priorities
            ? { groups: feedJson.groups, priorities: feedJson.priorities }
            : buildGroupedOperationalFeed(items);
        setGroups(grouped.groups);
      }
      setTimeline(timelineJson.events ?? []);
    } catch {
      setGroups([]);
      setTimeline([]);
      setError("Error de red al cargar el centro operativo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  const patchAction = async (actionId: string, body: Record<string, unknown>) => {
    setBusyActionId(actionId);
    setError(null);
    try {
      const res = await copilotApiFetch(`/api/copilot/operational-actions/${actionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "No se pudo actualizar la acción.");
        return;
      }
      await load();
    } catch {
      setError("Error de red al actualizar la acción.");
    } finally {
      setBusyActionId(null);
    }
  };

  const assignToMe = (item: OperationalFeedItem) => {
    const actionId = actionIdFromItem(item);
    if (!actionId) return;
    const label = operator?.full_name?.trim() || operator?.email;
    if (!label) {
      setError("No se pudo resolver el usuario actual para asignar.");
      return;
    }
    void patchAction(actionId, {
      assigned_to: label,
      owner_id: operator?.id ?? null,
    });
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const isExpanded = (group: OperationalFeedGroup) =>
    expandedGroupIds.has(group.id) || !group.collapsedByDefault;

  const hasSignal = groups.length > 0 || timeline.length > 0;
  const timelinePreview = useMemo(() => timeline.slice(0, 5), [timeline]);

  return (
    <section className={`border-t border-[var(--copilot-border)]/50 ${hasSignal || loading ? "pt-4" : "pt-2"}`}>
      <CopilotSectionTitle
        title="Centro operativo"
        subtitle="Seguimiento y cierre de prioridades abiertas."
        action={
          <CopilotGhostLink
            href="/copilot/acciones"
            className="border-transparent bg-transparent px-0 py-0 text-xs font-medium text-[var(--copilot-ink-muted)] shadow-none hover:bg-transparent hover:text-[var(--copilot-ink)] hover:underline"
          >
            Abrir cola
          </CopilotGhostLink>
        }
      />

      {error ? (
        <p className="mt-3 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="mt-1 flex items-center gap-2 text-xs text-[var(--copilot-ink-muted)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Cargando centro operativo…
        </div>
      ) : !hasSignal ? (
        <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
          Sin señales operativas abiertas.{" "}
          <CopilotGhostLink
            href="/copilot/acciones"
            className="inline-flex border-transparent bg-transparent px-0 py-0 text-xs font-medium text-[var(--copilot-ink-muted)] shadow-none hover:bg-transparent hover:text-[var(--copilot-ink)] hover:underline"
          >
            Abrir cola
          </CopilotGhostLink>
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {groups.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Seguimiento operativo
              </p>
              <ul className="mt-2 space-y-2">
                {groups.map((group) => (
                  <li key={group.id}>
                    <FeedGroupCard
                      group={group}
                      expanded={isExpanded(group)}
                      busyActionId={busyActionId}
                      onToggle={() => toggleGroup(group.id)}
                      onAssignToMe={assignToMe}
                      onResolve={(actionId) =>
                        void patchAction(actionId, { operational_status: "resolved" })
                      }
                      onBlock={(actionId) =>
                        void patchAction(actionId, { operational_status: "blocked" })
                      }
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {timelinePreview.length > 0 ? (
            <CopilotCard className="border-[var(--copilot-border)]/70 bg-white/60 px-3 py-2 shadow-none">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Actividad reciente
              </p>
              <ul className="mt-1.5 space-y-1">
                {timelinePreview.map((event) => (
                  <li
                    key={event.id}
                    className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 border-b border-[var(--copilot-border)]/40 py-1 text-xs last:border-b-0"
                  >
                    <span className="shrink-0 font-semibold tabular-nums text-[var(--copilot-ink)]">
                      {formatRelativeTime(event.createdAt)}
                    </span>
                    <span className="min-w-0 text-[var(--copilot-ink-muted)]">
                      {event.actorLabel ?? "Sistema"} · {mapOperationalEventLabel(event.eventType)}
                      {event.actionTitle ? ` · ${event.actionTitle}` : ""}
                    </span>
                    {event.actionId ? (
                      <Link
                        href={buildOperationalActionHref(event.actionId)}
                        className="shrink-0 text-[11px] font-medium text-[var(--copilot-ink-muted)] underline-offset-2 hover:text-[var(--copilot-ink)] hover:underline"
                      >
                        Abrir
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CopilotCard>
          ) : null}
        </div>
      )}
    </section>
  );
}
