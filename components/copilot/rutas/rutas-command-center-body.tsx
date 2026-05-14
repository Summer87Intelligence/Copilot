"use client";

import { CopilotCard, CopilotPrimaryLink } from "@/components/copilot/copilot-ui";
import { RutasAlertsPreviewSection } from "@/components/copilot/rutas/rutas-alerts-preview-section";
import { RutasDayStatusSection } from "@/components/copilot/rutas/rutas-day-status-section";
import { RutasDecisionRoutesSection } from "@/components/copilot/rutas/rutas-decision-routes-section";
import { RutasExecutiveRail } from "@/components/copilot/rutas/rutas-executive-rail";
import { RutasInsightsSection } from "@/components/copilot/rutas/rutas-insights-section";
import { RutasOperationalMemorySection } from "@/components/copilot/rutas/rutas-operational-memory-section";
import { RutasStrategicRecommendationsSection } from "@/components/copilot/rutas/rutas-strategic-recommendations-section";
import { RutasOperationalNarrativesSection } from "@/components/copilot/rutas/rutas-operational-narratives-section";
import { RutasMoreOptionsSection } from "@/components/copilot/rutas/rutas-more-options-section";
import { RutasOperationalCommandCenterSection } from "@/components/copilot/rutas/rutas-operational-command-center-section";
import { RutasGuidedWorkflowsSection } from "@/components/copilot/rutas/rutas-guided-workflows-section";
import { RutasOperationalFeedSection } from "@/components/copilot/rutas/rutas-operational-feed-section";
import { useRutasOperationalFeedSnapshot } from "@/components/copilot/rutas/rutas-operational-feed-context";
import { RutasSnapshotHealthNotice } from "@/components/copilot/rutas/rutas-snapshot-health-notice";
import { RutasPrioritySection } from "@/components/copilot/rutas/rutas-priority-section";
import { RutasTreasuryPressureSection } from "@/components/copilot/rutas/rutas-treasury-pressure-section";
import type { ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";
import type { FinancialSnapshotApiV1 } from "@/lib/copilot-financial-engine";
import type { CopilotRealInsight } from "@/lib/copilot-real-insights";
import type { RutasGateMeta } from "@/lib/copilot-rutas-gate";

const rutasCommandCenterMainClass = "flex-1 space-y-3.5 overflow-auto px-5 py-4";

type RutasCommandCenterBodyProps = {
  loading: boolean;
  hub: {
    snapshot: FinancialSnapshotApiV1 | null;
    portfolio: ClientPortfolioLoad | null;
    gate: RutasGateMeta;
    pendingDecisions: number;
  } | null;
  hubLoadedAt: string | null;
  insights: CopilotRealInsight[];
  insightsComputedAt: string | null;
  insightsError: string | null;
  recommendationsEnabled: boolean;
  visibility: {
    empezar: boolean;
    caja: boolean;
    cobranza: boolean;
    pagosImpuestos: boolean;
    clientesRiesgo: boolean;
    decisiones: boolean;
  };
  hasAnySignal: boolean;
};

export function RutasCommandCenterBody({
  loading,
  hub,
  hubLoadedAt,
  insights,
  insightsComputedAt,
  insightsError,
  recommendationsEnabled,
  visibility,
  hasAnySignal,
}: RutasCommandCenterBodyProps) {
  const { groups, loading: feedLoading, health } = useRutasOperationalFeedSnapshot();

  return (
    <div className={rutasCommandCenterMainClass}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-3.5">
        <div className="order-2 min-w-0 flex-1 space-y-3 lg:order-1">
          <RutasDayStatusSection
            loading={loading}
            gate={hub?.gate ?? null}
            snapshot={hub?.snapshot ?? null}
            portfolio={hub?.portfolio ?? null}
            hubLoadedAt={hubLoadedAt}
          />

          <RutasTreasuryPressureSection />

          <RutasSnapshotHealthNotice health={health} />

          <RutasStrategicRecommendationsSection />

          <RutasOperationalCommandCenterSection />

          <RutasOperationalNarrativesSection />

          <RutasOperationalMemorySection />

          <RutasGuidedWorkflowsSection />

          <RutasOperationalFeedSection />

          {!loading && !hasAnySignal ? (
            <CopilotCard className="border-amber-200/80 bg-amber-50/50 p-3">
              <p className="text-sm font-semibold text-amber-950">
                No hay contexto financiero validado suficiente
              </p>
              <p className="mt-1.5 text-sm text-amber-900/90">
                Cargá datos completos y consistentes para habilitar recomendaciones con confianza.
              </p>
              <CopilotPrimaryLink href="/copilot/datos" className="mt-3 inline-flex">
                Ir a datos
              </CopilotPrimaryLink>
            </CopilotCard>
          ) : null}

          <RutasMoreOptionsSection>
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
          </RutasMoreOptionsSection>
        </div>

        <div className="order-1 lg:order-2">
          <RutasExecutiveRail
            loading={loading}
            hubLoadedAt={hubLoadedAt}
            gate={hub?.gate ?? null}
            feedLoading={feedLoading}
            feedGroups={groups}
          />
        </div>
      </div>
    </div>
  );
}
