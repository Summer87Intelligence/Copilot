"use client";

import { useState } from "react";
import type { DailyBriefing, DECollectionAction, RankedClient } from "@/lib/decision-engine/de-types";
import type { CollectionActionType, CollectionStatus } from "@/lib/copilot-collection-types";
import { PortfolioScoreCard } from "./portfolio-score-card";
import { ClientPriorityList } from "./client-priority-list";
import { RiskAlertList } from "./risk-alert-list";
import { CollectionActionModal } from "./collection-action-modal";
import { DailyOperationsQueue } from "./daily-operations-queue";

type QuickActionDefaults = {
  actionType?: CollectionActionType;
  status?: CollectionStatus;
  notes?: string;
};

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

  function handleActionClick(client: RankedClient, defaults?: QuickActionDefaults) {
    setActionClient(client);
    setActionDefaults(defaults);
  }

  function handleActionSuccess() {
    setActionClient(null);
    setActionDefaults(undefined);
    setActionSuccess(true);
    setTimeout(() => setActionSuccess(false), 3000);
    onRefresh();
  }

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
          onClick={onRefresh}
          disabled={refreshing}
          className="text-xs font-medium text-[var(--copilot-accent)] hover:underline disabled:opacity-50 disabled:no-underline"
        >
          {refreshing ? "Actualizando…" : "Recalcular"}
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

      {/* Operations queue */}
      {(briefing.follow_up_queue?.length ?? 0) > 0 && (
        <DailyOperationsQueue
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
