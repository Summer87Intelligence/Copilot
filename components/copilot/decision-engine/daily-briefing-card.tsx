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
import {
  defaultActionForCategory,
  rankedClientFromOperationalTask,
} from "@/lib/decision-engine/operational-task-adapters";
import { PortfolioScoreCard } from "./portfolio-score-card";
import { ClientPriorityList } from "./client-priority-list";
import { RiskAlertList } from "./risk-alert-list";
import { CollectionActionModal } from "./collection-action-modal";
import { shouldShowLegacyFollowUpQueue } from "@/lib/decision-engine/daily-operations-queue-panel.helpers";
import { DailyOperationsQueue as LegacyFollowUpQueue } from "./daily-operations-queue";
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

export function DailyBriefingCard({ briefing, recentActions, generatedAt, cached, onRefresh, refreshing }: Props) {
  const [actionClient, setActionClient] = useState<RankedClient | null>(null);
  const [actionDefaults, setActionDefaults] = useState<QuickActionDefaults | undefined>(undefined);
  const [actionSuccess, setActionSuccess] = useState(false);

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

  function handleActionClick(client: RankedClient, defaults?: QuickActionDefaults) {
    setActionClient(client);
    setActionDefaults(defaults);
  }

  function handleQueueTaskAction(task: OperationalTask) {
    const defaults = defaultActionForCategory(task.category);
    handleActionClick(rankedClientFromOperationalTask(task), {
      actionType: defaults.actionType,
      status: defaults.status,
      notes: defaults.notes,
    });
  }

  function handleActionSuccess() {
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

  const showLegacyFollowUp =
    shouldShowLegacyFollowUpQueue({
      queueLoading,
      queueError,
      queue: dailyQueue,
    }) && (briefing.follow_up_queue?.length ?? 0) > 0;

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--copilot-text)]">Motor de decisiones</h2>
          <p className="text-xs text-[var(--copilot-text-muted)] mt-0.5">
            Actualizado {formatRelativeTime(generatedAt)}
            {cached && <span className="ml-1 opacity-60">(caché)</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={handleBriefingRefresh}
          disabled={refreshing || queueRefreshing}
          className="text-xs font-medium text-[var(--copilot-accent)] hover:underline disabled:opacity-50 disabled:no-underline"
        >
          {refreshing || queueRefreshing ? "Actualizando…" : "Recalcular"}
        </button>
      </div>

      {actionSuccess && (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          Acción registrada correctamente.
        </div>
      )}

      {/* Portfolio score */}
      <PortfolioScoreCard score={briefing.portfolio_score} />

      {/* Alerts */}
      {briefing.alerts.length > 0 && (
        <RiskAlertList alerts={briefing.alerts} />
      )}

      {/* Phase 2B/2C — Daily Operations Queue */}
      <DailyOperationsQueuePanel
        queue={dailyQueue}
        loading={queueLoading}
        error={queueError}
        stale={queueStale}
        cached={queueCached}
        generatedAt={queueGeneratedAt}
        expiresAt={queueExpiresAt}
        refreshing={queueRefreshing}
        onRefresh={(force) => void fetchDailyQueue(force ?? false)}
        onRegisterAction={handleQueueTaskAction}
      />

      {/* Urgent */}
      {briefing.urgent.length > 0 && (
        <ClientPriorityList
          clients={briefing.urgent}
          recentActions={recentActions}
          title="Urgente — atender hoy"
          emptyMessage="Sin clientes urgentes."
          onActionClick={handleActionClick}
        />
      )}

      {/* Important */}
      {briefing.important.length > 0 && (
        <ClientPriorityList
          clients={briefing.important}
          recentActions={recentActions}
          title="Importante esta semana"
          emptyMessage="Sin clientes importantes pendientes."
          onActionClick={handleActionClick}
        />
      )}

      {/* Empty state */}
      {briefing.urgent.length === 0 && briefing.important.length === 0 && (
        <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-surface)] px-5 py-8 text-center">
          <p className="text-sm font-medium text-[var(--copilot-text)]">Sin clientes priorizados</p>
          <p className="text-xs text-[var(--copilot-text-muted)] mt-1">
            No hay facturas pendientes con urgencia o no vencidas aún.
          </p>
        </div>
      )}

      {/* Legacy follow-up queue — fallback si Phase 2B falla o está vacía */}
      {showLegacyFollowUp && (
        <LegacyFollowUpQueue
          queue={briefing.follow_up_queue}
          onActionClick={(item) => {
            // Find the matching RankedClient to open the action modal
            const client = [...briefing.urgent, ...briefing.important].find(
              (c) => c.company_id === item.company_id && c.currency_code === item.currency_code
            );
            if (client) handleActionClick(client);
          }}
        />
      )}

      {/* Collection action modal */}
      {actionClient && (
        <CollectionActionModal
          client={actionClient}
          defaultValues={actionDefaults}
          onClose={() => { setActionClient(null); setActionDefaults(undefined); }}
          onSuccess={handleActionSuccess}
        />
      )}
    </div>
  );
}
