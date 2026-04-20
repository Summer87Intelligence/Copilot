"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotTraceMeta } from "@/components/copilot/copilot-trace-meta";
import { DecisionRouteCard } from "@/components/copilot/decision-route-card";
import { CopilotCard, CopilotPrimaryLink } from "@/components/copilot/copilot-ui";
import type { ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";
import {
  formatMoneyRutas,
  formatRutasPeriodLabel,
  sumPortfolioOverdueDebt,
} from "@/lib/copilot-rutas-hub";
import type { FinancialSnapshot } from "@/lib/copilot-financial-engine";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import { traceFromRutasHub } from "@/lib/copilot-trace-meta";

type GateMeta = {
  validation_report: unknown;
  confidence: "high" | "medium" | "low";
  coverage: "full" | "partial" | "insufficient";
  blocked_reasons: string[];
  recommendations_enabled: boolean;
};

type RutasHubValidated = {
  snapshot: FinancialSnapshot | null;
  portfolio: ClientPortfolioLoad | null;
  gate: GateMeta;
  pendingDecisions: number;
};

function toGateMeta(input: unknown): GateMeta {
  const o = (input ?? {}) as Record<string, unknown>;
  const confidence =
    o.confidence === "high" || o.confidence === "medium" || o.confidence === "low"
      ? o.confidence
      : "low";
  const coverage =
    o.coverage === "full" || o.coverage === "partial" || o.coverage === "insufficient"
      ? o.coverage
      : "insufficient";
  const blocked_reasons = Array.isArray(o.blocked_reasons)
    ? o.blocked_reasons.filter((x): x is string => typeof x === "string")
    : [];
  const recommendations_enabled = o.recommendations_enabled === true;
  return {
    validation_report: o.validation_report ?? null,
    confidence,
    coverage,
    blocked_reasons,
    recommendations_enabled,
  };
}

function KpiPill({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "danger" | "warning" | "success";
}) {
  const ring =
    tone === "danger"
      ? "border-rose-200/90 bg-rose-50/80"
      : tone === "warning"
        ? "border-amber-200/90 bg-amber-50/70"
        : tone === "success"
          ? "border-emerald-200/90 bg-emerald-50/70"
          : "border-[var(--copilot-border)] bg-white/80";
  return (
    <div
      className={`flex min-w-[7.5rem] shrink-0 flex-col rounded-xl border px-3 py-2 shadow-sm ${ring}`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {label}
      </span>
      <span className="mt-0.5 truncate text-sm font-semibold tabular-nums text-[var(--copilot-ink)]">
        {value}
      </span>
    </div>
  );
}

export default function CopilotRutasPage() {
  const [loading, setLoading] = useState(true);
  const [hub, setHub] = useState<RutasHubValidated | null>(null);
  const [hubLoadedAt, setHubLoadedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [hubRes, insightsRes] =
        await Promise.all([
          copilotApiFetch("/api/copilot/rutas-hub").then((r) => r.json()),
          copilotApiFetch("/api/copilot/real-insights").then((r) => r.json()),
        ]);

      const hubJson = (hubRes ?? {}) as Record<string, unknown>;
      const snapshot = (hubJson.snapshot as FinancialSnapshot | null) ?? null;
      const portfolio = (hubJson.portfolio as ClientPortfolioLoad | null) ?? null;
      const gate = toGateMeta(hubJson);

      const insightsJson = (insightsRes ?? {}) as Record<string, unknown>;
      const insightsGate = toGateMeta(insightsJson);
      const insightsList = Array.isArray(insightsJson.insights)
        ? insightsJson.insights
        : [];
      const pendingDecisions =
        gate.recommendations_enabled && insightsGate.recommendations_enabled
          ? insightsList.length
          : 0;

      setHub({
        snapshot,
        portfolio,
        gate,
        pendingDecisions,
      });
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

  const salud = useMemo(() => {
    if (!hub) return { label: "…", tone: "neutral" as const };
    if (!hub.gate.recommendations_enabled) {
      return { label: "No apto", tone: "critical" as const };
    }
    if (hub.gate.coverage === "partial" || hub.gate.confidence === "medium") {
      return { label: "Parcial", tone: "warning" as const };
    }
    return { label: "Validado", tone: "ok" as const };
  }, [hub]);

  const overdueDebt = hub ? sumPortfolioOverdueDebt(hub.portfolio) : 0;
  const blockedReasonsCount = hub?.gate.blocked_reasons.length ?? 0;
  const confidenceLabel = hub?.gate.confidence ?? "low";
  const coverageLabel = hub?.gate.coverage ?? "insufficient";
  const recommendationsLabel = hub?.gate.recommendations_enabled ? "Sí" : "No";

  const hasAnySignal =
    hub &&
    (hub.snapshot != null ||
      (hub.portfolio?.rows?.length ?? 0) > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        surfaceId="copilot.rutas"
        title="Qué hacer hoy"
        description="Elegí un camino y avanzá paso a paso. Un solo botón verde por pantalla hasta llegar a tu próxima decisión."
      />

      <div className="flex-1 space-y-10 overflow-auto px-6 py-8">
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
              <KpiPill
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
              <KpiPill
                label="Caja disponible"
                value={
                  hub?.snapshot != null
                    ? formatMoneyRutas(hub.snapshot.available_cash)
                    : "—"
                }
              />
              <KpiPill
                label="Deuda vencida"
                value={overdueDebt > 0 ? formatMoneyRutas(overdueDebt) : "Sin saldo vencido"}
                tone={overdueDebt > 0 ? "danger" : "success"}
              />
              <KpiPill
                label="Cobertura datos"
                value={coverageLabel}
                tone={coverageLabel === "full" ? "success" : "warning"}
              />
              <KpiPill label="Confianza" value={confidenceLabel} />
              <KpiPill
                label="Bloqueos"
                value={String(blockedReasonsCount)}
                tone={blockedReasonsCount > 0 ? "danger" : "success"}
              />
              <KpiPill label="Recomendar" value={recommendationsLabel} />
            </div>
          )}
          {!loading && hub && !hub.gate.recommendations_enabled ? (
            <div className="mt-4 rounded-xl border border-amber-200/90 bg-amber-50/70 p-3 text-xs text-amber-950">
              <p className="font-semibold">Modo conservador: recomendaciones deshabilitadas</p>
              <p className="mt-1 text-amber-900/90">
                Se muestra solo diagnóstico validado. Motivos de bloqueo:
              </p>
              <ul className="mt-1 list-disc pl-5">
                {(hub.gate.blocked_reasons.length > 0
                  ? hub.gate.blocked_reasons
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

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Rutas de decisión
          </h2>
          <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
            Tocá el botón verde y seguí el orden. Sin menús intermedios.
          </p>
          <div className="relative mt-6 grid min-h-[120px] gap-5 md:grid-cols-2 xl:grid-cols-2">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl border border-dashed border-[var(--copilot-border)] bg-[var(--copilot-card)]/80">
                <span className="flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Preparando rutas…
                </span>
              </div>
            ) : null}
            {!loading && visibility.empezar ? (
              <DecisionRouteCard
                title="Empezar el día"
                description="Entrá al flujo guiado y verificá el estado de validación antes de decidir."
                ctaLabel="Ver prioridades del día"
                href="/copilot/rutas/empezar"
                badge={!hub?.gate.recommendations_enabled ? "Diagnóstico" : undefined}
              />
            ) : null}
            {!loading && visibility.caja ? (
              <DecisionRouteCard
                title="¿Estoy bien de caja?"
                description="Liquidez, vencimientos y cómo cubrirlos, en pocos pasos."
                ctaLabel="Ver situación de caja"
                href="/copilot/rutas/caja"
              />
            ) : null}
            {!loading && visibility.cobranza ? (
              <DecisionRouteCard
                title="¿Voy a cobrar lo que necesito?"
                description="Deuda vencida y próximos pasos para recuperar caja."
                ctaLabel="Revisar cobranzas"
                href="/copilot/rutas/cobranza"
                badge={formatMoneyRutas(overdueDebt)}
              />
            ) : null}
            {!loading && visibility.pagosImpuestos ? (
              <DecisionRouteCard
                title="¿Puedo cumplir con pagos e impuestos?"
                description="Obligaciones próximas y coherencia con tu caja."
                ctaLabel="Ver obligaciones y caja"
                href="/copilot/rutas/pagos-impuestos"
              />
            ) : null}
            {!loading && visibility.clientesRiesgo ? (
              <DecisionRouteCard
                title="Clientes en riesgo"
                description="Quién concentra riesgo y qué hacer primero."
                ctaLabel="Ver cartera en riesgo"
                href="/copilot/rutas/clientes-riesgo"
              />
            ) : null}
            {!loading && visibility.decisiones ? (
              <DecisionRouteCard
                title="Decisiones pendientes"
                description="Iniciativas y acciones que esperan tu cierre."
                ctaLabel="Continuar decisiones"
                href="/copilot/rutas/decisiones"
                badge={
                  hub && hub.pendingDecisions > 0
                    ? `${hub.pendingDecisions} abiertas`
                    : undefined
                }
              />
            ) : null}
          </div>
          <p className="mt-6 text-center text-sm text-[var(--copilot-ink-muted)]">
            ¿Preferís el panel clásico?{" "}
            <Link
              href="/copilot"
              className="font-semibold text-[var(--copilot-accent)] hover:underline"
            >
              Ir al inicio
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
