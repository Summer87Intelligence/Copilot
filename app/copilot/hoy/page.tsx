"use client";

import { useCallback, useEffect, useState } from "react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { HoyPageView } from "@/components/copilot/hoy/hoy-page-view";
import type { ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { FinancialSnapshotApiV1 } from "@/lib/copilot-financial-engine";
import type { FinancialConsistencyReport } from "@/lib/copilot-financial-reconciliation";
import {
  carteraAgingOverdueFromReport,
  carteraOpeningFromReport,
  type BusinessPulseGate,
} from "@/lib/copilot-today-business-pulse";
import type { CarteraCurrencyTotals } from "@/lib/copilot-cartera-aging-totals";
import { toRutasGateMeta } from "@/lib/copilot-rutas-gate";

const DEFAULT_GATE: BusinessPulseGate = {
  confidence: "low",
  coverage: "insufficient",
  recommendations_enabled: false,
};

export default function CopilotHoyPage() {
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<FinancialSnapshotApiV1 | null>(null);
  const [portfolioRows, setPortfolioRows] = useState<ClientPortfolioLoad["rows"] | null>(null);
  const [gate, setGate] = useState<BusinessPulseGate>(DEFAULT_GATE);
  const [carteraAgingOverdue, setCarteraAgingOverdue] = useState<CarteraCurrencyTotals | undefined>(
    undefined
  );
  const [carteraOpeningByCurrency, setCarteraOpeningByCurrency] = useState<
    CarteraCurrencyTotals | undefined
  >(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [hubRes, reconRes] = await Promise.all([
        copilotApiFetch("/api/copilot/rutas-hub"),
        copilotApiFetch("/api/copilot/financial-reconciliation?mode=all_outstanding"),
      ]);
      const json = (await hubRes.json().catch(() => null)) as Record<string, unknown> | null;
      const hub = json ?? {};
      const meta = toRutasGateMeta(hub);
      setSnapshot((hub.snapshot as FinancialSnapshotApiV1 | null) ?? null);
      setPortfolioRows(((hub.portfolio as ClientPortfolioLoad | null)?.rows) ?? null);
      setGate({ confidence: meta.confidence, coverage: meta.coverage, recommendations_enabled: meta.recommendations_enabled });

      const reconJson = (await reconRes.json().catch(() => null)) as {
        ok?: boolean;
        report?: FinancialConsistencyReport;
      } | null;
      if (reconRes.ok && reconJson?.ok && reconJson.report) {
        setCarteraAgingOverdue(carteraAgingOverdueFromReport(reconJson.report.agingByCurrency));
        setCarteraOpeningByCurrency(carteraOpeningFromReport(reconJson.report.currencies));
      } else {
        setCarteraAgingOverdue(undefined);
        setCarteraOpeningByCurrency(undefined);
      }
    } catch {
      setError("No se pudo cargar el resumen del negocio. Intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        surfaceId="copilot.hoy"
        title="Pulso del negocio"
        description="Resumen ejecutivo del estado financiero y operativo."
      />
      <HoyPageView
        loading={loading}
        snapshot={snapshot}
        portfolioRows={portfolioRows}
        gate={gate}
        carteraAgingOverdue={carteraAgingOverdue}
        carteraOpeningByCurrency={carteraOpeningByCurrency}
        error={error}
        onRefresh={load}
      />
    </div>
  );
}
