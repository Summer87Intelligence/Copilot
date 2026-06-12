"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type {
  ClientOperationalHydrationRecord,
  DailyBriefing,
  DailyOperationsQueue,
  DECollectionAction,
  DEOperationalStateRow,
  OperationalAnalyticsSnapshot,
  OperationalOwnershipStats,
  OperationalTask,
  RankedClient,
} from "@/lib/decision-engine/de-types";
import type { CollectionActionType, CollectionStatus } from "@/lib/copilot-collection-types";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import { rankedClientFromOperationalTask } from "@/lib/decision-engine/operational-task-adapters";
import {
  resolvePrimaryWorkflow,
} from "@/lib/decision-engine/client-operational-workflow";
import {
  buildExecutiveTimeline,
} from "@/lib/decision-engine/executive-timeline-builder";
import { PortfolioScoreCard } from "./portfolio-score-card";
import { RiskAlertList } from "./risk-alert-list";
import { CollectionActionModal } from "./collection-action-modal";
import { DailyOperationsQueuePanel } from "./daily-operations-queue-panel";
import { OperationalAnalyticsDashboard } from "./operational-analytics-dashboard";
import { OperationalAutomationPanel } from "./operational-automation-panel";
import { OperationalIntelligencePanel } from "./operational-intelligence-panel";
import { PredictiveIntelligencePanel } from "./predictive-intelligence-panel";
import { ExecutiveCommandCenter } from "./executive-command-center";
import { StrategicLearningPanel } from "./strategic-learning-panel";

// ---------------------------------------------------------------------------
// Collapsible wrapper
// ---------------------------------------------------------------------------

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-[var(--copilot-border)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-[var(--copilot-surface)] hover:bg-[var(--copilot-surface-alt)]/60 transition-colors"
      >
        <span className="text-xs font-medium text-[var(--copilot-text-secondary)]">{title}</span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-[var(--copilot-text-muted)]" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-[var(--copilot-text-muted)]" />
        )}
      </button>
      {open && <div className="border-t border-[var(--copilot-border)]/60">{children}</div>}
    </div>
  );
}

type QuickActionDefaults = {
  actionType?: CollectionActionType;
  status?: CollectionStatus;
  notes?: string;
};

type DailyQueueResponse =
  | {
      ok: true;
      queue: DailyOperationsQueue;
      hydration_by_customer: Record<string, ClientOperationalHydrationRecord>;
      cached: boolean;
      stale: boolean;
      generated_at: string;
      expires_at: string | null;
      generation_ms: number;
    }
  | { ok: false; code: string; message: string };

type Props = {
  briefing: DailyBriefing;
  recentActions: DECollectionAction[];
  generatedAt: string;
  cached: boolean;
  onRefresh: () => void;
  refreshing: boolean;
};

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "hace menos de un minuto";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.floor(hrs / 24)} d`;
}

export function DailyBriefingCard({
  briefing,
  recentActions,
  generatedAt,
  cached,
  onRefresh,
  refreshing,
}: Props) {
  const [actionClient, setActionClient] = useState<RankedClient | null>(null);
  const [actionDefaults, setActionDefaults] = useState<QuickActionDefaults | undefined>(undefined);
  const [actionSuccess, setActionSuccess] = useState(false);
  const [completedCustomerIds, setCompletedCustomerIds] = useState<Set<string>>(new Set());
  const [loadingCustomerId, setLoadingCustomerId] = useState<string | null>(null);

  const [dailyQueue, setDailyQueue] = useState<DailyOperationsQueue | null>(null);
  const [hydrationByCustomer, setHydrationByCustomer] = useState<
    Record<string, ClientOperationalHydrationRecord>
  >({});
  const [queueGeneratedAt, setQueueGeneratedAt] = useState<string | null>(null);
  const [queueExpiresAt, setQueueExpiresAt] = useState<string | null>(null);
  const [queueCached, setQueueCached] = useState(false);
  const [queueStale, setQueueStale] = useState(false);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueRefreshing, setQueueRefreshing] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [ownershipStats, setOwnershipStats] = useState<OperationalOwnershipStats | null>(null);
  const [ownershipLoadingCustomerId, setOwnershipLoadingCustomerId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<OperationalAnalyticsSnapshot | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async (force = false) => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const url = force
        ? "/api/copilot/decision-engine/analytics?force=true"
        : "/api/copilot/decision-engine/analytics";
      const res = await copilotApiFetch(url);
      const json = (await res.json()) as
        | { ok: true; analytics: OperationalAnalyticsSnapshot }
        | { ok: false; message?: string };
      if (!json.ok) {
        setAnalyticsError(json.message ?? "No se pudo cargar analytics");
        return;
      }
      setAnalytics(json.analytics);
    } catch (err) {
      setAnalyticsError(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  const fetchOwnershipStats = useCallback(async () => {
    try {
      const res = await copilotApiFetch("/api/copilot/decision-engine/ownership-stats");
      const json = (await res.json()) as
        | { ok: true; stats: OperationalOwnershipStats }
        | { ok: false; message?: string };
      if (json.ok) setOwnershipStats(json.stats);
    } catch {
      /* non-fatal */
    }
  }, []);

  const applyStateToHydration = useCallback((state: DEOperationalStateRow) => {
    setHydrationByCustomer((prev) => {
      const existing = prev[state.customer_id];
      return {
        ...prev,
        [state.customer_id]: {
          ...(existing ?? {
            customer_id: state.customer_id,
            machine_state: state.machine_state,
            previous_state: state.previous_state,
            transitioned_at: state.transitioned_at,
            transition_reason: state.transition_reason,
            breached_sla: state.breached_sla,
            next_follow_up_at: state.next_follow_up_at,
            pending_follow_up_id: null,
            pending_follow_up_reason: null,
            last_action_at: state.last_contact_at,
            last_action_type: null,
            last_action_summary: null,
            timeline_preview: [],
          }),
          assigned_user_id: state.assigned_user_id,
          assigned_at: state.assigned_at,
          assigned_by: state.assigned_by,
          assignment_note: state.assignment_note,
        },
      };
    });
  }, []);

  const fetchDailyQueue = useCallback(async (force = false) => {
    if (force) setQueueRefreshing(true);
    else setQueueLoading(true);
    setQueueError(null);
    try {
      const url = force
        ? "/api/copilot/decision-engine/daily-queue?force=true"
        : "/api/copilot/decision-engine/daily-queue";
      const res = await copilotApiFetch(url);
      const json = (await res.json()) as DailyQueueResponse;
      if (!json.ok) {
        setQueueError(json.message ?? "No se pudo cargar la cola operativa");
        return;
      }
      setDailyQueue(json.queue);
      setHydrationByCustomer(json.hydration_by_customer ?? {});
      setQueueGeneratedAt(json.generated_at);
      setQueueExpiresAt(json.expires_at);
      setQueueCached(json.cached);
      setQueueStale(json.stale);
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setQueueLoading(false);
      setQueueRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchDailyQueue(false);
    void fetchAnalytics(false);
    void fetchOwnershipStats();
    void (async () => {
      try {
        const res = await copilotApiFetch("/api/copilot/me");
        const json = (await res.json()) as { appUser?: { id: string } };
        if (json.appUser?.id) setCurrentUserId(json.appUser.id);
      } catch {
        /* non-fatal */
      }
    })();
  }, [fetchDailyQueue, fetchAnalytics, fetchOwnershipStats]);

  const postOwnership = useCallback(
    async (
      path: string,
      body: Record<string, unknown>,
      customerId: string
    ): Promise<boolean> => {
      setOwnershipLoadingCustomerId(customerId);
      try {
        const res = await copilotApiFetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as
          | { ok: true; state?: DEOperationalStateRow }
          | { ok: false; message?: string };
        if (!json.ok) return false;
        if (json.state) applyStateToHydration(json.state);
        void fetchOwnershipStats();
        void fetchAnalytics(true);
        void fetchDailyQueue(true);
        return true;
      } catch {
        return false;
      } finally {
        setOwnershipLoadingCustomerId(null);
      }
    },
    [applyStateToHydration, fetchAnalytics, fetchDailyQueue, fetchOwnershipStats]
  );

  const handleTakeOwnership = useCallback(
    (customerId: string) => {
      if (!currentUserId) return;
      void postOwnership(
        "/api/copilot/decision-engine/assign",
        { customer_id: customerId, assigned_user_id: currentUserId },
        customerId
      );
    },
    [currentUserId, postOwnership]
  );

  const handleReleaseOwnership = useCallback(
    (customerId: string) => {
      void postOwnership(
        "/api/copilot/decision-engine/unassign",
        { customer_id: customerId },
        customerId
      );
    },
    [postOwnership]
  );

  const handleAutoAssign = useCallback(
    (customerId: string) => {
      setOwnershipLoadingCustomerId(customerId);
      void (async () => {
        try {
          const res = await copilotApiFetch("/api/copilot/decision-engine/auto-assign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ customer_ids: [customerId] }),
          });
          const json = (await res.json()) as
            | { ok: true; assigned: DEOperationalStateRow[] }
            | { ok: false };
          if (json.ok && json.assigned[0]) applyStateToHydration(json.assigned[0]);
          void fetchOwnershipStats();
          void fetchAnalytics(true);
          void fetchDailyQueue(true);
        } finally {
          setOwnershipLoadingCustomerId(null);
        }
      })();
    },
    [applyStateToHydration, fetchAnalytics, fetchDailyQueue, fetchOwnershipStats]
  );

  function handleExecuteWorkflow(task: OperationalTask) {
    const workflow = resolvePrimaryWorkflow(task);
    setLoadingCustomerId(task.customer_id);
    setActionClient(rankedClientFromOperationalTask(task));
    setActionDefaults({
      actionType: workflow.actionType,
      status: workflow.status,
      notes: "",
    });
  }

  function handleActionSuccess() {
    const customerId = actionClient?.company_id;
    if (customerId) {
      setCompletedCustomerIds((prev) => new Set(prev).add(customerId));
      setTimeout(() => {
        setCompletedCustomerIds((prev) => {
          const next = new Set(prev);
          next.delete(customerId);
          return next;
        });
      }, 4000);
    }
    setLoadingCustomerId(null);
    setActionClient(null);
    setActionDefaults(undefined);
    setActionSuccess(true);
    setTimeout(() => setActionSuccess(false), 3000);
    onRefresh();
    void fetchDailyQueue(true);
  }

  function handleBriefingRefresh() {
    onRefresh();
    void fetchDailyQueue(true);
    void fetchAnalytics(true);
    void fetchOwnershipStats();
  }

  // Build executive timeline from available actions (lightweight, no extra fetch)
  const timelineEvents = useMemo(
    () =>
      buildExecutiveTimeline({
        actions: recentActions.slice(0, 10),
        followUps: [],
        automationActions: [],
        operationalStates: [],
        companies: [],
        limit: 5,
      }),
    [recentActions]
  );

  const queueRef = useCallback((el: HTMLDivElement | null) => {
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const [queueFocused, setQueueFocused] = useState(false);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--copilot-text)]">Centro operacional</h2>
          <p className="text-xs text-[var(--copilot-text-muted)] mt-0.5">
            Actualizado {formatRelativeTime(generatedAt)}
            {cached && <span className="ml-1 opacity-60">(caché)</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={handleBriefingRefresh}
          disabled={refreshing || queueRefreshing}
          className="text-xs font-medium text-[var(--copilot-accent)] hover:underline disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]"
        >
          {refreshing || queueRefreshing ? "Actualizando…" : "Recalcular"}
        </button>
      </div>

      {actionSuccess && (
        <div className="text-xs text-[var(--copilot-success-text-strong)] bg-[var(--copilot-tone-positive-bg)] border border-[var(--copilot-success-border)] rounded-lg px-3 py-2 transition-opacity">
          Acción registrada correctamente.
        </div>
      )}

      {/* 1. Score + alertas */}
      <PortfolioScoreCard score={briefing.portfolio_score} />
      {briefing.alerts.length > 0 && <RiskAlertList alerts={briefing.alerts} />}

      {/* 2. Executive Command Center */}
      <ExecutiveCommandCenter
        timelineEvents={timelineEvents}
        onGoToQueue={() => setQueueFocused(true)}
      />

      {/* 3. Inteligencia operacional (colapsable) */}
      <CollapsibleSection title="Inteligencia operacional" defaultOpen={true}>
        <div className="p-0">
          <OperationalIntelligencePanel />
        </div>
      </CollapsibleSection>

      {/* 4. Forecast predictivo (colapsable) */}
      <CollapsibleSection title="Forecast predictivo" defaultOpen={true}>
        <div className="p-0">
          <PredictiveIntelligencePanel />
        </div>
      </CollapsibleSection>

      {/* 5. Estado operacional (analytics compacto) */}
      <OperationalAnalyticsDashboard
        analytics={analytics}
        loading={analyticsLoading}
        error={analyticsError}
      />

      {/* 6. Aprendizaje estratégico (colapsado por defecto) */}
      <CollapsibleSection title="Aprendizaje estratégico" defaultOpen={false}>
        <div className="p-4">
          <StrategicLearningPanel />
        </div>
      </CollapsibleSection>

      {/* 7. Automatizaciones (colapsado por defecto) */}
      <CollapsibleSection title="Automatizaciones" defaultOpen={false}>
        <div className="p-0">
          <OperationalAutomationPanel />
        </div>
      </CollapsibleSection>

      {/* 8. Cola operativa (principal) */}
      <div ref={queueFocused ? queueRef : undefined}>
        <DailyOperationsQueuePanel
          queue={dailyQueue}
          hydrationByCustomer={hydrationByCustomer}
          ownershipStats={ownershipStats}
          queueSignals={analytics?.queue_signals ?? null}
          currentUserId={currentUserId}
          loading={queueLoading}
          error={queueError}
          stale={queueStale}
          cached={queueCached}
          generatedAt={queueGeneratedAt}
          expiresAt={queueExpiresAt}
          refreshing={queueRefreshing}
          completedCustomerIds={completedCustomerIds}
          loadingCustomerId={loadingCustomerId}
          ownershipLoadingCustomerId={ownershipLoadingCustomerId}
          onRefresh={(force) => void fetchDailyQueue(force ?? false)}
          onExecuteWorkflow={handleExecuteWorkflow}
          onTakeOwnership={handleTakeOwnership}
          onReleaseOwnership={handleReleaseOwnership}
          onAutoAssign={handleAutoAssign}
        />
      </div>

      {actionClient && (
        <CollectionActionModal
          client={actionClient}
          defaultValues={actionDefaults}
          onClose={() => {
            setActionClient(null);
            setActionDefaults(undefined);
            setLoadingCustomerId(null);
          }}
          onSuccess={handleActionSuccess}
        />
      )}
    </div>
  );
}
