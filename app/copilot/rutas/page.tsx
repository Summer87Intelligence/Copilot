"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { RutasCommandCenterBody } from "@/components/copilot/rutas/rutas-command-center-body";
import { RutasOperationalFeedProvider } from "@/components/copilot/rutas/rutas-operational-feed-context";
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
        description="Centro operativo del día: prioridad ejecutiva, seguimiento y actividad reciente."
      />

      <RutasOperationalFeedProvider>
        <RutasCommandCenterBody
          loading={loading}
          hub={hub}
          hubLoadedAt={hubLoadedAt}
          insights={insights}
          insightsComputedAt={insightsComputedAt}
          insightsError={insightsError}
          recommendationsEnabled={recommendationsEnabled}
          visibility={visibility}
          hasAnySignal={Boolean(hasAnySignal)}
        />
      </RutasOperationalFeedProvider>
    </div>
  );
}
