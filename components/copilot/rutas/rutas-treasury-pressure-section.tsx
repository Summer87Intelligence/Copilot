"use client";

import { Loader2 } from "lucide-react";

import { RutasKpiPill } from "@/components/copilot/rutas/rutas-kpi-pill";
import {
  CopilotCard,
  CopilotGhostLink,
  CopilotPrimaryLink,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { useTreasuryHoySignals } from "@/hooks/use-treasury-hoy-signals";
import { formatTreasuryMoney } from "@/lib/treasury/treasury-dashboard";
import type { TreasuryProjectionRiskLevel } from "@/lib/treasury/treasury-cash-projection";

function riskChipLabel(risk: TreasuryProjectionRiskLevel | undefined): string {
  if (risk === "critical") return "Caja crítica";
  if (risk === "warning") return "Presión de caja";
  return "Liquidez estable";
}

function riskChipTone(
  risk: TreasuryProjectionRiskLevel | undefined
): "neutral" | "danger" | "warning" | "success" {
  if (risk === "critical") return "danger";
  if (risk === "warning") return "warning";
  return "success";
}

function runwayChipLabel(runwayDays: number | null | undefined): string {
  if (runwayDays == null) return "Runway: sin horizonte";
  return `Runway: ${runwayDays} día${runwayDays === 1 ? "" : "s"}`;
}

function obligationsChipLabel(count: number): string {
  if (count === 0) return "Sin obligaciones 7d";
  return `${count} obligación${count === 1 ? "" : "es"} próxima${count === 1 ? "" : "s"}`;
}

export function RutasTreasuryPressureSection() {
  const { loading, error, signals, hasOperationalData } = useTreasuryHoySignals();

  const risk = signals?.projection?.riskLevel;
  const runwayDays = signals?.projection?.runwayDays;
  const upcomingCount = signals?.upcoming7.length ?? 0;
  const outflowUyu = signals?.upcomingOutflowUyu ?? 0;

  return (
    <section>
      <CopilotSectionTitle
        title="Presión de caja manual"
        subtitle="Runway, obligaciones y egresos de Tesorería — sin abrir el módulo completo."
        action={
          <CopilotGhostLink href="/copilot/tesoreria" className="font-semibold">
            Abrir Tesorería
          </CopilotGhostLink>
        }
      />

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Leyendo caja manual…
        </div>
      ) : null}

      {!loading && error ? (
        <CopilotCard className="mt-4 border-amber-200/80 bg-amber-50/50 px-4 py-3">
          <p className="text-sm text-amber-950">{error}</p>
          <CopilotGhostLink href="/copilot/tesoreria" className="mt-2 inline-flex font-semibold">
            Configurar Tesorería
          </CopilotGhostLink>
        </CopilotCard>
      ) : null}

      {!loading && !error && !hasOperationalData ? (
        <CopilotCard className="mt-4 border-dashed border-[var(--copilot-border)] bg-white/60 px-4 py-3">
          <p className="text-sm text-[var(--copilot-ink-muted)]">
            Todavía no hay obligaciones, movimientos ni alertas de caja manual para presionar el
            día.
          </p>
          <CopilotGhostLink href="/copilot/tesoreria" className="mt-2 inline-flex font-semibold">
            Configurar Tesorería
          </CopilotGhostLink>
        </CopilotCard>
      ) : null}

      {!loading && !error && hasOperationalData && signals ? (
        <CopilotCard className="mt-4 border-[rgba(31,107,74,0.14)] bg-white/90 px-4 py-4">
          <div className="flex flex-wrap gap-2">
            <RutasKpiPill
              label="Runway"
              value={runwayDays == null ? "—" : `${runwayDays} d`}
              tone={
                runwayDays != null && runwayDays <= 7
                  ? "danger"
                  : runwayDays != null && runwayDays <= 15
                    ? "warning"
                    : "neutral"
              }
            />
            <RutasKpiPill
              label="Obligaciones 7d"
              value={String(upcomingCount)}
              tone={upcomingCount > 0 ? "warning" : "success"}
            />
            <RutasKpiPill
              label="Egresos 7d (UYU)"
              value={outflowUyu > 0 ? formatTreasuryMoney(outflowUyu, "UYU") : "Sin egresos"}
              tone={outflowUyu > 0 ? "warning" : "neutral"}
            />
            <RutasKpiPill
              label="Riesgo tesorería"
              value={riskChipLabel(risk)}
              tone={riskChipTone(risk)}
            />
          </div>
          <p className="mt-3 text-sm text-[var(--copilot-ink-muted)]">
            {runwayChipLabel(runwayDays)} · {obligationsChipLabel(upcomingCount)}
            {signals.criticalAlertCount > 0
              ? ` · ${signals.criticalAlertCount} alerta${signals.criticalAlertCount === 1 ? "" : "s"} crítica${signals.criticalAlertCount === 1 ? "" : "s"}`
              : ""}
          </p>
          <CopilotPrimaryLink href="/copilot/tesoreria" className="mt-4 inline-flex">
            Ver detalle en Tesorería
          </CopilotPrimaryLink>
        </CopilotCard>
      ) : null}
    </section>
  );
}
