"use client";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotCard, CopilotGhostButton } from "@/components/copilot/copilot-ui";
import { OicReconciliationSummaryBar } from "@/components/copilot/operacional/oic-reconciliation-summary-bar";
import { OicConflictTable } from "@/components/copilot/operacional/oic-conflict-table";
import { OicSkeletonCard } from "@/components/copilot/operacional/oic-skeleton-card";
import { FinancialAuditPanel } from "@/components/copilot/operacional/financial-audit-panel";
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

  const hasHistoricalIssues =
    data.historicalAuditCritical > 0 || data.historicalAuditWarning > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <OicReconciliationSummaryBar data={data} />
        </div>
        <CopilotGhostButton onClick={refetch} className="shrink-0 text-xs">
          Actualizar
        </CopilotGhostButton>
      </div>

      {/* Tabla de conflictos activos */}
      <OicConflictTable
        rows={data.conflictiveInvoices}
        lastAuditAt={data.lastAuditAt}
      />

      {/* Contexto histórico — separado y rotulado, no afecta estado actual */}
      {hasHistoricalIssues && (
        <CopilotCard className="border-[rgba(44,40,37,0.1)] bg-[rgba(44,40,37,0.02)]">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded bg-[rgba(44,40,37,0.08)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Histórico — no afecta estado actual
            </span>
            <p className="text-xs text-[var(--copilot-ink-muted)]">
              En los últimos 30 días se registraron{" "}
              <span className="font-semibold">{data.historicalAuditCritical} auditorías críticas</span>
              {data.historicalAuditWarning > 0 && (
                <> y <span className="font-semibold">{data.historicalAuditWarning} warnings</span></>
              )}{" "}
              en <code className="text-[10px]">zeta_completeness_audits</code>.
              Estos eventos son históricos y no representan conflictos activos en facturas.
              Consultarlos en detalle en{" "}
              <a href="/copilot/operacional/snapshots" className="underline">Snapshots</a>.
            </p>
          </div>
        </CopilotCard>
      )}

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
        title="Reconciliación"
        description="Estado de saldos Zeta vs base de datos, auditoría financiera, checks técnicos y sync health."
      />
      <div className="space-y-8 px-6 py-6">
        {/* Sección 1: Estado actual Zeta vs DB */}
        <section>
          <SectionLabel label="Estado actual" />
          <ReconciliacionShell />
        </section>

        {/* Sección 2: Auditoría financiera — viene de /copilot/cartera */}
        <section>
          <SectionLabel
            label="Auditoría y trazabilidad financiera"
            description="Explicabilidad del motor, orphan warnings, checks técnicos y sync health. Carga el mes en curso por defecto."
          />
          <FinancialAuditPanel />
        </section>
      </div>
    </>
  );
}

function SectionLabel({ label, description }: { label: string; description?: string }) {
  return (
    <div className="mb-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--copilot-ink-muted)]">
        {label}
      </p>
      {description && (
        <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]/80">{description}</p>
      )}
    </div>
  );
}
