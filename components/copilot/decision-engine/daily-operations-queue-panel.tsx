"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { CollectionAction } from "@/lib/copilot-collection-types";
import type {
  ClientOperationalSummary,
  DailyOperationsQueue,
  DECollectionAction,
  OperationalTask,
  QueueSection,
} from "@/lib/decision-engine/de-types";
import { collectCompanyIdsFromQueue } from "@/lib/decision-engine/client-operational-execution-context";
import type { WorkflowKind } from "@/lib/decision-engine/client-operational-workflow";
import {
  allSectionsWithTasks,
  clientSeenKey,
  countClientsInQueue,
  getSectionClientSummaries,
  isCacheStale,
  isQueueEmpty,
  sectionLabel,
  sliceVisibleSummaries,
} from "@/lib/decision-engine/daily-operations-queue-panel.helpers";
import { ClientOperationalSummaryCard } from "./client-operational-summary-card";

const SEEN_STORAGE_KEY = "copilot_de_queue_seen_v1";

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `hace ${secs} s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.floor(hrs / 24)} d`;
}

function loadSeenIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(SEEN_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveSeenIds(ids: Set<string>) {
  try {
    sessionStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

type BatchActionsResponse =
  | { ok: true; actionsByCompany: Record<string, CollectionAction[]> }
  | { ok: false; message?: string };

type QueueSectionBlockProps = {
  section: QueueSection;
  summaries: ClientOperationalSummary[];
  seenIds: Set<string>;
  actionsByCompany: Record<string, Array<CollectionAction | DECollectionAction>>;
  completedCustomerIds: Set<string>;
  loadingCustomerId: string | null;
  onExecuteWorkflow?: (task: OperationalTask, kind: WorkflowKind) => void;
  onMarkSeen: (customerId: string) => void;
};

function QueueSectionBlock({
  section,
  summaries,
  seenIds,
  actionsByCompany,
  completedCustomerIds,
  loadingCustomerId,
  onExecuteWorkflow,
  onMarkSeen,
}: QueueSectionBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const { visible, hiddenCount } = sliceVisibleSummaries(summaries, expanded);

  return (
    <section className="space-y-1.5">
      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)]">
        {sectionLabel(section)}
        <span className="ml-1.5 font-normal normal-case text-[var(--copilot-text-secondary)]">
          ({summaries.length})
        </span>
      </h3>
      <div className="space-y-2">
        {visible.map((summary) => (
          <ClientOperationalSummaryCard
            key={summary.customer_id}
            summary={summary}
            customerActions={actionsByCompany[summary.customer_id] ?? []}
            seen={seenIds.has(clientSeenKey(summary.customer_id))}
            completed={completedCustomerIds.has(summary.customer_id)}
            actionLoading={loadingCustomerId === summary.customer_id}
            onExecuteWorkflow={onExecuteWorkflow}
            onMarkSeen={onMarkSeen}
          />
        ))}
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--copilot-accent)] hover:underline"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" />
              Ver menos
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              Ver {hiddenCount} más
            </>
          )}
        </button>
      )}
    </section>
  );
}

export type DailyOperationsQueuePanelProps = {
  queue: DailyOperationsQueue | null;
  loading?: boolean;
  error?: string | null;
  stale?: boolean;
  cached?: boolean;
  generatedAt?: string | null;
  expiresAt?: string | null;
  refreshing?: boolean;
  recentActions?: DECollectionAction[];
  completedCustomerIds?: Set<string>;
  loadingCustomerId?: string | null;
  onRefresh?: (force?: boolean) => void;
  onExecuteWorkflow?: (task: OperationalTask, kind: WorkflowKind) => void;
};

export function DailyOperationsQueuePanel({
  queue,
  loading = false,
  error = null,
  stale = false,
  cached = false,
  generatedAt = null,
  expiresAt = null,
  refreshing = false,
  recentActions = [],
  completedCustomerIds = new Set(),
  loadingCustomerId = null,
  onRefresh,
  onExecuteWorkflow,
}: DailyOperationsQueuePanelProps) {
  const [seenIds, setSeenIds] = useState<Set<string>>(() => loadSeenIds());
  const [actionsByCompany, setActionsByCompany] = useState<
    Record<string, Array<CollectionAction | DECollectionAction>>
  >({});
  const [tick, setTick] = useState(0);

  const markSeen = useCallback((customerId: string) => {
    setSeenIds((prev) => {
      const next = new Set(prev);
      next.add(clientSeenKey(customerId));
      saveSeenIds(next);
      return next;
    });
  }, []);

  const sections = useMemo(() => {
    if (!queue) return [];
    return allSectionsWithTasks(queue);
  }, [queue]);

  const clientCount = queue ? countClientsInQueue(queue) : 0;
  const showStaleBanner = stale || (expiresAt != null && isCacheStale(expiresAt));

  const mergedActionsByCompany = useMemo(() => {
    const map: Record<string, Array<CollectionAction | DECollectionAction>> = {
      ...actionsByCompany,
    };
    for (const a of recentActions) {
      const list = map[a.company_id] ?? [];
      if (!list.some((x) => "id" in x && x.id === a.id)) {
        map[a.company_id] = [...list, a];
      }
    }
    return map;
  }, [actionsByCompany, recentActions]);

  useEffect(() => {
    if (!queue) return;
    const ids = collectCompanyIdsFromQueue(queue.sections);
    if (ids.length === 0) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await copilotApiFetch("/api/copilot/collection-actions/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company_ids: ids.slice(0, 100) }),
        });
        const json = (await res.json()) as BatchActionsResponse;
        if (cancelled || !json.ok) return;
        setActionsByCompany(json.actionsByCompany as Record<string, CollectionAction[]>);
      } catch {
        /* fallback: recentActions only */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [queue]);

  useEffect(() => {
    if (!generatedAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, [generatedAt]);

  void tick;

  if (loading && !queue) {
    return (
      <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-surface)] px-4 py-3">
        <div className="flex items-center gap-2 text-[var(--copilot-text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin opacity-70" />
          <p className="text-xs">Preparando cola operativa…</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-[var(--copilot-border)] bg-gradient-to-b from-[var(--copilot-surface)] to-[var(--copilot-surface-alt)]/20 overflow-hidden transition-opacity duration-300 ${
        refreshing ? "opacity-90" : "opacity-100"
      }`}
    >
      <div className="px-3 py-2.5 border-b border-[var(--copilot-border)] flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <div className="rounded-md bg-[var(--copilot-accent)]/10 p-1.5 shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-[var(--copilot-accent)]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[var(--copilot-text)]">Cola operativa del día</h2>
            <p className="text-[10px] text-[var(--copilot-text-muted)] mt-0.5 leading-snug">
              {generatedAt ? (
                <>
                  Actualizado {formatRelativeTime(generatedAt)}
                  {cached && <span className="opacity-60"> · caché</span>}
                </>
              ) : (
                "Sin datos"
              )}
              {queue && (
                <span>
                  {" "}
                  · {clientCount} clientes · {queue.stats.urgent_count} urgentes
                </span>
              )}
            </p>
          </div>
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={() => onRefresh(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--copilot-border)] px-2 py-0.5 text-[10px] font-medium text-[var(--copilot-text-muted)] hover:bg-[var(--copilot-surface)] disabled:opacity-50 shrink-0 transition-colors"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "…" : "Actualizar"}
          </button>
        )}
      </div>

      <div className="p-3 space-y-2">
        {error && (
          <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {showStaleBanner && !error && (
          <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-2 py-1">
            Cola posiblemente desactualizada — actualiza para ver cambios.
          </p>
        )}

        {!loading && queue && isQueueEmpty(queue) && (
          <div className="text-center py-4">
            <p className="text-sm font-medium text-[var(--copilot-text)]">Cola vacía</p>
            <p className="text-[11px] text-[var(--copilot-text-muted)] mt-0.5">
              No hay clientes con acciones pendientes.
            </p>
          </div>
        )}

        {queue &&
          sections.map((section) => (
            <QueueSectionBlock
              key={section}
              section={section}
              summaries={getSectionClientSummaries(queue, section)}
              seenIds={seenIds}
              actionsByCompany={mergedActionsByCompany}
              completedCustomerIds={completedCustomerIds}
              loadingCustomerId={loadingCustomerId}
              onExecuteWorkflow={onExecuteWorkflow}
              onMarkSeen={markSeen}
            />
          ))}
      </div>
    </div>
  );
}
