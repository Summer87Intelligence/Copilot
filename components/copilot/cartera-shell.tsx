"use client";

/**
 * CarteraShell
 * ------------
 * Cliente delgado que cablea:
 *  - useFinancialReconciliation (fetch del reporte real desde el backend).
 *  - FinancialControlBar (UI de control sticky).
 *  - ExecutiveSummaryCards + ReconciliationCenter (Bloques 3 y 4).
 *  - Placeholder temporal para Bloque 5+ (aging / explorer / explainability).
 *
 * No realiza ningún recálculo financiero. Solo:
 *  - Mantiene estado UI (modo, rango, refresh tick).
 *  - Pasa el reporte intacto a los componentes hijos.
 *  - Muestra skeletons reales mientras `loading && !report`.
 *  - Si hay un reporte previo y se está re-fetcheando, mantiene el contenido y
 *    deja al control bar mostrar el spinner (evita flicker entre estados).
 */

import { useCallback, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertOctagon } from "lucide-react";

import {
  COPILOT_OPERATIONAL_START_DATE,
  getCopilotOperationalEndDate,
} from "@/lib/copilot-operational-period";

import { useFinancialReconciliation } from "@/hooks/use-financial-reconciliation";
import { FinancialControlBar } from "@/components/copilot/financial-control-bar";
import {
  ExecutiveSummaryCards,
  ExecutiveSummaryCardsSkeleton,
} from "@/components/copilot/executive-summary-cards";
import {
  ReconciliationCenter,
  ReconciliationCenterSkeleton,
} from "@/components/copilot/reconciliation-center";
import {
  AgingAnalytics,
  AgingAnalyticsSkeleton,
} from "@/components/copilot/aging-analytics";
import { ClientDebtExplorer } from "@/components/copilot/client-debt-explorer";
import { ExplainabilityPanel } from "@/components/copilot/explainability-panel";
import type { ReconciliationMode } from "@/lib/copilot-financial-reconciliation";

export function CarteraShell() {
  const [mode, setMode] = useState<ReconciliationMode>("period_only");
  const [periodStart, setPeriodStart] = useState<string | null>(COPILOT_OPERATIONAL_START_DATE);
  const [periodEnd, setPeriodEnd] = useState<string | null>(getCopilotOperationalEndDate());

  const { report, loading, error, lastFetchedAt, refetch } = useFinancialReconciliation({
    mode,
    periodStart,
    periodEnd,
  });

  const handlePeriodChange = useCallback(
    ({ start, end }: { start: string | null; end: string | null }) => {
      setPeriodStart(start);
      setPeriodEnd(end);
    },
    []
  );

  const handleModeChange = useCallback((next: ReconciliationMode) => {
    setMode(next);
  }, []);

  // Estado: primer fetch sin reporte previo → skeletons reales.
  // Estado: error sin reporte previo → bloque de error.
  // Estado: reporte ya cargado → render principal (mantiene contenido en re-fetch).
  const initialLoading = loading && report === null && error === null;
  const showError = error !== null && report === null;

  return (
    <>
      <FinancialControlBar
        mode={mode}
        onModeChange={handleModeChange}
        periodStart={periodStart}
        periodEnd={periodEnd}
        onPeriodChange={handlePeriodChange}
        onRefresh={refetch}
        loading={loading}
        error={error}
        report={report}
        lastFetchedAt={lastFetchedAt}
      />

      <div className="space-y-6">
        {initialLoading ? (
          <>
            <ExecutiveSummaryCardsSkeleton />
            <AgingAnalyticsSkeleton />
            <ReconciliationCenterSkeleton />
          </>
        ) : showError ? (
          <ErrorBlock message={error ?? "Error desconocido"} onRetry={refetch} />
        ) : report ? (
          <>
            <ExecutiveSummaryCards report={report} />
            <AgingAnalytics report={report} />
            <ClientDebtExplorer report={report} />
            <ExplainabilityPanel report={report} />
            <ReconciliationCenter
              report={report}
              generatedAt={lastFetchedAt ?? report.generatedAt}
            />
          </>
        ) : null}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Error block
// ---------------------------------------------------------------------------

function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      role="alert"
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="flex flex-col items-start gap-3 rounded-2xl border border-rose-200/70 bg-rose-50/55 p-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
          <AlertOctagon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-rose-700">
            Error de reconciliación
          </p>
          <p className="mt-1 text-sm text-rose-900/90">{message}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-9 items-center rounded-lg border border-rose-300/70 bg-white/80 px-3 text-xs font-semibold text-rose-800 shadow-sm transition hover:bg-white"
      >
        Reintentar
      </button>
    </motion.div>
  );
}

