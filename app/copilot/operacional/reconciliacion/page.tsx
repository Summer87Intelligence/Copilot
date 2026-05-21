"use client";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotCard, CopilotGhostButton } from "@/components/copilot/copilot-ui";
import { OicReconciliationSummaryBar } from "@/components/copilot/operacional/oic-reconciliation-summary-bar";
import { OicConflictTable } from "@/components/copilot/operacional/oic-conflict-table";
import { OicSkeletonCard } from "@/components/copilot/operacional/oic-skeleton-card";
import { useOicReconciliacion } from "@/hooks/use-oic-reconciliacion";

function ReconciliacionShell() {
  const { data, loading, error, lastFetchedAt, refetch } = useOicReconciliacion();

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <OicSkeletonCard rows={1} />
        <OicSkeletonCard rows={6} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <CopilotCard>
        <p className="text-xs text-rose-700">{error ?? "No se pudo cargar la reconciliación."}</p>
      </CopilotCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <OicReconciliationSummaryBar data={data} />
        <CopilotGhostButton onClick={refetch} className="shrink-0 text-xs">
          Actualizar
        </CopilotGhostButton>
      </div>
      <OicConflictTable rows={data.conflictiveInvoices} />
      {lastFetchedAt && (
        <p className="text-right text-[11px] text-[var(--copilot-ink-muted)]">
          Computado: {new Date(lastFetchedAt).toLocaleString("es-AR")}
        </p>
      )}
    </div>
  );
}

export default function ReconciliacionPage() {
  return (
    <>
      <CopilotPageHeader
        eyebrow="Operacional"
        title="Reconciliación Zeta"
        description="Comparación entre saldos en base de datos y datos reportados por Zeta. Detecta gaps y conflictos."
      />
      <div className="px-6 py-6">
        <ReconciliacionShell />
      </div>
    </>
  );
}
