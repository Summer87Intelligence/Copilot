"use client";

import { Loader2 } from "lucide-react";

import { CopilotTraceMeta } from "@/components/copilot/copilot-trace-meta";
import { RutasKpiPill } from "@/components/copilot/rutas/rutas-kpi-pill";
import type { ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";
import type { FinancialSnapshotApiV1 } from "@/lib/copilot-financial-engine";
import { snapshotCashNet } from "@/lib/copilot-financial-snapshot-selectors";
import type { RutasGateMeta } from "@/lib/copilot-rutas-gate";
import {
  formatMoneyRutas,
  formatRutasPeriodLabel,
  sumPortfolioOverdueDebt,
} from "@/lib/copilot-rutas-hub";
import { traceFromRutasHub } from "@/lib/copilot-trace-meta";

type RutasDayStatusSectionProps = {
  loading: boolean;
  gate: RutasGateMeta | null;
  snapshot: FinancialSnapshotApiV1 | null;
  portfolio: ClientPortfolioLoad | null;
  hubLoadedAt: string | null;
};

export function RutasDayStatusSection({
  loading,
  gate,
  snapshot,
  portfolio,
  hubLoadedAt,
}: RutasDayStatusSectionProps) {
  const salud = (() => {
    if (!gate) return { label: "…", tone: "neutral" as const };
    if (!gate.recommendations_enabled) {
      return { label: "No apto", tone: "critical" as const };
    }
    if (gate.coverage === "partial" || gate.confidence === "medium") {
      return { label: "Parcial", tone: "warning" as const };
    }
    return { label: "Validado", tone: "ok" as const };
  })();

  const overdueDebt = sumPortfolioOverdueDebt(portfolio);
  const blockedReasonsCount = gate?.blocked_reasons.length ?? 0;
  const confidenceLabel = gate?.confidence ?? "low";
  const coverageLabel = gate?.coverage ?? "insufficient";
  const recommendationsLabel = gate?.recommendations_enabled ? "Sí" : "No";
  const hasAnySignal =
    snapshot != null || (portfolio?.rows?.length ?? 0) > 0;

  return (
    <section className="border-b border-[var(--copilot-border)] pb-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        Resumen · {formatRutasPeriodLabel()}
      </p>
      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Actualizando lectura…
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-stretch gap-3">
          <RutasKpiPill
            label="Salud"
            value={salud.label}
            tone={
              salud.tone === "critical"
                ? "danger"
                : salud.tone === "warning"
                  ? "warning"
                  : "success"
            }
          />
          <RutasKpiPill
            label="Caja disponible"
            value={snapshot != null ? formatMoneyRutas(snapshotCashNet(snapshot)) : "—"}
          />
          <RutasKpiPill
            label="Deuda vencida"
            value={overdueDebt > 0 ? formatMoneyRutas(overdueDebt) : "Sin saldo vencido"}
            tone={overdueDebt > 0 ? "danger" : "success"}
          />
          <RutasKpiPill
            label="Cobertura datos"
            value={coverageLabel}
            tone={coverageLabel === "full" ? "success" : "warning"}
          />
          <RutasKpiPill label="Confianza" value={confidenceLabel} />
          <RutasKpiPill
            label="Bloqueos"
            value={String(blockedReasonsCount)}
            tone={blockedReasonsCount > 0 ? "danger" : "success"}
          />
          <RutasKpiPill label="Recomendar" value={recommendationsLabel} />
        </div>
      )}
      {!loading && gate && !gate.recommendations_enabled ? (
        <div className="mt-4 rounded-xl border border-amber-200/90 bg-amber-50/70 p-3 text-xs text-amber-950">
          <p className="font-semibold">Modo conservador: recomendaciones deshabilitadas</p>
          <p className="mt-1 text-amber-900/90">
            Se muestra solo diagnóstico validado. Motivos de bloqueo:
          </p>
          <ul className="mt-1 list-disc pl-5">
            {(gate.blocked_reasons.length > 0
              ? gate.blocked_reasons
              : ["Sin detalle adicional."]).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {!loading && hubLoadedAt ? (
        <div className="mt-4 max-w-3xl">
          <CopilotTraceMeta
            trace={traceFromRutasHub({
              loadedAtIso: hubLoadedAt,
              hasSignals: Boolean(hasAnySignal),
            })}
            variant="embed"
            dense
          />
        </div>
      ) : null}
    </section>
  );
}
