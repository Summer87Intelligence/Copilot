"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { RutasAlertsPreviewSection } from "@/components/copilot/rutas/rutas-alerts-preview-section";
import { RutasDayStatusSection } from "@/components/copilot/rutas/rutas-day-status-section";
import { RutasDecisionRoutesSection } from "@/components/copilot/rutas/rutas-decision-routes-section";
import { RutasInsightsSection } from "@/components/copilot/rutas/rutas-insights-section";
import { RutasPrioritySection } from "@/components/copilot/rutas/rutas-priority-section";
import { RutasTreasuryPressureSection } from "@/components/copilot/rutas/rutas-treasury-pressure-section";
import { CopilotCard, CopilotPrimaryLink } from "@/components/copilot/copilot-ui";
import type { ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { FinancialSnapshotApiV1 } from "@/lib/copilot-financial-engine";
import type { CopilotRealInsight } from "@/lib/copilot-real-insights";
import { toRutasGateMeta, type RutasGateMeta } from "@/lib/copilot-rutas-gate";
import { sumPortfolioOverdueDebt } from "@/lib/copilot-rutas-hub";

type RutasHubValidated = {
  snapshot: FinancialSnapshotApiV1 | null;
  portfolio: ClientPortfolioLoad | null;
  gate: RutasGateMeta;
  pendingDecisions: number;
};

export default function CopilotRutasPage() {
  const [loading, setLoading] = useState(true);
  const [hub, setHub] = useState<RutasHubValidated | null>(null);
  const [hubLoadedAt, setHubLoadedAt] = useState<string | null>(null);
  const [insights, setInsights] = useState<CopilotRealInsight[]>([]);
  const [insightsComputedAt, setInsightsComputedAt] = useState<string | null>(null);
  const [insightsGate, setInsightsGate] = useState<RutasGateMeta | null>(null);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setInsightsError(null);
    try {
      const [hubRes, insightsRes] = await Promise.all([
        copilotApiFetch("/api/copilot/rutas-hub").then((r) => r.json()),
        copilotApiFetch("/api/copilot/real-insights").then((r) => r.json()),
      ]);

      const hubJson = (hubRes ?? {}) as Record<string, unknown>;
      const snapshot = (hubJson.snapshot as FinancialSnapshotApiV1 | null) ?? null;
      const portfolio = (hubJson.portfolio as ClientPortfolioLoad | null) ?? null;
      const gate = toRutasGateMeta(hubJson);

      const insightsJson = (insightsRes ?? {}) as Record<string, unknown>;
      const nextInsightsGate = toRutasGateMeta(insightsJson);
      const insightsList = Array.isArray(insightsJson.insights)
        ? (insightsJson.insights as CopilotRealInsight[])
        : [];
      const pendingDecisions =
        gate.recommendations_enabled && nextInsightsGate.recommendations_enabled
          ? insightsList.length
          : 0;

      setHub({
        snapshot,
        portfolio,
        gate,
        pendingDecisions,
      });
      setInsights(insightsList);
      setInsightsComputedAt(
        typeof insightsJson.computedAt === "string" ? insightsJson.computedAt : null
      );
      setInsightsGate(nextInsightsGate);
    } catch {
      setHub({
        snapshot: null,
        portfolio: null,
        gate: {
          validation_report: null,
          confidence: "low",
          coverage: "insufficient",
          blocked_reasons: ["No se pudo cargar contexto financiero validado."],
          recommendations_enabled: false,
        },
        pendingDecisions: 0,
      });
      setInsights([]);
      setInsightsComputedAt(null);
      setInsightsGate(null);
      setInsightsError("No se pudieron cargar las recomendaciones.");
    } finally {
      setHubLoadedAt(new Date().toISOString());
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibility = useMemo(() => {
    const blocked = !hub?.gate.recommendations_enabled;
    return {
      empezar: true,
      caja: !blocked,
      cobranza: !blocked && sumPortfolioOverdueDebt(hub?.portfolio ?? null) > 0,
      pagosImpuestos: false,
      clientesRiesgo: false,
      decisiones: !blocked && (hub?.pendingDecisions ?? 0) > 0,
    };
  }, [hub]);

  const hasAnySignal =
    hub &&
    (hub.snapshot != null || (hub.portfolio?.rows?.length ?? 0) > 0);

  const recommendationsEnabled =
    Boolean(hub?.gate.recommendations_enabled) &&
    Boolean(insightsGate?.recommendations_enabled);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        surfaceId="copilot.rutas"
        title="Qué hacer hoy"
        description="Centro operativo del día: prioridad, alertas, recomendaciones y rutas guiadas en un solo lugar."
      />

      <div className="flex-1 space-y-10 overflow-auto px-6 py-8">
        <RutasDayStatusSection
          loading={loading}
          gate={hub?.gate ?? null}
          snapshot={hub?.snapshot ?? null}
          portfolio={hub?.portfolio ?? null}
          hubLoadedAt={hubLoadedAt}
        />

        <RutasTreasuryPressureSection />

        {!loading && !hasAnySignal ? (
          <CopilotCard className="border-amber-200/80 bg-amber-50/50">
            <p className="text-sm font-semibold text-amber-950">
              No hay contexto financiero validado suficiente
            </p>
            <p className="mt-2 text-sm text-amber-900/90">
              Cargá datos completos y consistentes para habilitar recomendaciones con confianza.
            </p>
            <CopilotPrimaryLink href="/copilot/datos" className="mt-4 inline-flex">
              Ir a datos
            </CopilotPrimaryLink>
          </CopilotCard>
        ) : null}

        <RutasPrioritySection />
        <RutasAlertsPreviewSection />
        <RutasInsightsSection
          loading={loading}
          insights={insights}
          computedAt={insightsComputedAt}
          recommendationsEnabled={recommendationsEnabled}
          loadError={insightsError}
        />
        <RutasDecisionRoutesSection
          loading={loading}
          visibility={visibility}
          gate={hub?.gate ?? null}
          portfolio={hub?.portfolio ?? null}
          pendingDecisions={hub?.pendingDecisions ?? 0}
        />
      </div>
    </div>
  );
}
