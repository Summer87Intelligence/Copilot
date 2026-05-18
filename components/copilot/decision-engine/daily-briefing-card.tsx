"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  DailyBriefing,
  DailyOperationsQueue,
  DECollectionAction,
  OperationalTask,
  RankedClient,
} from "@/lib/decision-engine/de-types";
import type { CollectionActionType, CollectionStatus } from "@/lib/copilot-collection-types";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import { rankedClientFromOperationalTask } from "@/lib/decision-engine/operational-task-adapters";
import {
  resolvePrimaryWorkflow,
  type WorkflowKind,
} from "@/lib/decision-engine/client-operational-workflow";
import { PortfolioScoreCard } from "./portfolio-score-card";
import { RiskAlertList } from "./risk-alert-list";
import { CollectionActionModal } from "./collection-action-modal";
import { DailyOperationsQueuePanel } from "./daily-operations-queue-panel";

type QuickActionDefaults = {
  actionType?: CollectionActionType;
  status?: CollectionStatus;
  notes?: string;
};

type DailyQueueResponse =
  | {
      ok: true;
      queue: DailyOperationsQueue;
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
  const [queueGeneratedAt, setQueueGeneratedAt] = useState<string | null>(null);
  const [queueExpiresAt, setQueueExpiresAt] = useState<string | null>(null);
  const [queueCached, setQueueCached] = useState(false);
  const [queueStale, setQueueStale] = useState(false);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueRefreshing, setQueueRefreshing] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);

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
  }, [fetchDailyQueue]);

  function handleExecuteWorkflow(task: OperationalTask, _kind: WorkflowKind) {
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
  }

  return (
    <div className="space-y-3">
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
          className="text-xs font-medium text-[var(--copilot-accent)] hover:underline disabled:opacity-50"
        >
          {refreshing || queueRefreshing ? "Actualizando…" : "Recalcular"}
        </button>
      </div>

      {actionSuccess && (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 transition-opacity">
          Acción registrada correctamente.
        </div>
      )}

      <PortfolioScoreCard score={briefing.portfolio_score} />

      {briefing.alerts.length > 0 && <RiskAlertList alerts={briefing.alerts} />}

      <DailyOperationsQueuePanel
        queue={dailyQueue}
        loading={queueLoading}
        error={queueError}
        stale={queueStale}
        cached={queueCached}
        generatedAt={queueGeneratedAt}
        expiresAt={queueExpiresAt}
        refreshing={queueRefreshing}
        recentActions={recentActions}
        completedCustomerIds={completedCustomerIds}
        loadingCustomerId={loadingCustomerId}
        onRefresh={(force) => void fetchDailyQueue(force ?? false)}
        onExecuteWorkflow={handleExecuteWorkflow}
      />

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
