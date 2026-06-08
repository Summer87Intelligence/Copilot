"use client";

import { useState, useCallback } from "react";
import { getCurrentMonthToTodayRange } from "@/lib/copilot-date-range-defaults";
import { COPILOT_OPERATIONAL_START_DATE } from "@/lib/copilot-operational-period";
import { useFinancialReconciliation } from "@/hooks/use-financial-reconciliation";
import { ExplainabilityPanel } from "@/components/copilot/explainability-panel";
import { ReconciliationCenter } from "@/components/copilot/reconciliation-center";
import { OicSkeletonCard } from "@/components/copilot/operacional/oic-skeleton-card";
import { CopilotCard, CopilotGhostButton } from "@/components/copilot/copilot-ui";

function PeriodBar({
  start,
  end,
  onStartChange,
  onEndChange,
  onApply,
  onRefresh,
  loading,
  appliedStart,
  appliedEnd,
}: {
  start: string;
  end: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  onApply: () => void;
  onRefresh: () => void;
  loading: boolean;
  appliedStart: string;
  appliedEnd: string;
}) {
  const dirty = start !== appliedStart || end !== appliedEnd;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-3 py-2">
      <span className="text-xs text-[var(--copilot-ink-muted)]">Período:</span>
      <input
        type="date"
        value={start}
        onChange={(e) => onStartChange(e.target.value)}
        className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80 px-2 py-1 text-xs text-[var(--copilot-ink)]"
      />
      <span className="text-xs text-[var(--copilot-ink-muted)]">–</span>
      <input
        type="date"
        value={end}
        onChange={(e) => onEndChange(e.target.value)}
        className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80 px-2 py-1 text-xs text-[var(--copilot-ink)]"
      />
      {dirty ? (
        <CopilotGhostButton onClick={onApply} className="text-xs">
          Aplicar
        </CopilotGhostButton>
      ) : (
        <CopilotGhostButton onClick={onRefresh} className="text-xs">
          {loading ? "Cargando…" : "Actualizar"}
        </CopilotGhostButton>
      )}
    </div>
  );
}

export function FinancialAuditPanel() {
  const [draftStart, setDraftStart] = useState(() => getCurrentMonthToTodayRange().from);
  const [draftEnd, setDraftEnd] = useState(() => getCurrentMonthToTodayRange().to);
  const [confirmedStart, setConfirmedStart] = useState(() => getCurrentMonthToTodayRange().from);
  const [confirmedEnd, setConfirmedEnd] = useState(() => getCurrentMonthToTodayRange().to);

  const { report, loading, error, lastFetchedAt, refetch } = useFinancialReconciliation({
    mode: "period_only",
    periodStart: confirmedStart,
    periodEnd: confirmedEnd,
    enabled: true,
  });

  const isPreSync = confirmedStart < COPILOT_OPERATIONAL_START_DATE;

  const handleApply = useCallback(() => {
    if (!draftStart || !draftEnd || draftStart > draftEnd) return;
    setConfirmedStart(draftStart);
    setConfirmedEnd(draftEnd);
  }, [draftStart, draftEnd]);

  return (
    <div className="space-y-4">
      <PeriodBar
        start={draftStart}
        end={draftEnd}
        onStartChange={setDraftStart}
        onEndChange={setDraftEnd}
        onApply={handleApply}
        onRefresh={refetch}
        loading={loading}
        appliedStart={confirmedStart}
        appliedEnd={confirmedEnd}
      />

      {loading && !report ? (
        <div className="space-y-4">
          <OicSkeletonCard rows={4} />
          <OicSkeletonCard rows={6} />
        </div>
      ) : error && !report ? (
        <CopilotCard>
          <p className="text-xs text-rose-700">{error}</p>
        </CopilotCard>
      ) : report ? (
        <>
          <ExplainabilityPanel report={report} selectedCurrency="all" isPreSync={isPreSync} />
          <ReconciliationCenter
            report={report}
            generatedAt={lastFetchedAt ?? undefined}
            isPreSync={isPreSync}
          />
        </>
      ) : null}
    </div>
  );
}
