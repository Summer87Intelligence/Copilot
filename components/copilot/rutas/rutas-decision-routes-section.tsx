"use client";

import { Loader2 } from "lucide-react";

import { DecisionRouteCard } from "@/components/copilot/decision-route-card";
import type { ClientPortfolioLoad } from "@/lib/copilot-clients-portfolio";
import { formatMoneyRutas, sumPortfolioOverdueDebt } from "@/lib/copilot-rutas-hub";
import type { RutasGateMeta } from "@/lib/copilot-rutas-gate";

type RutasVisibility = {
  empezar: boolean;
  caja: boolean;
  cobranza: boolean;
  pagosImpuestos: boolean;
  clientesRiesgo: boolean;
  decisiones: boolean;
};

type RutasDecisionRoutesSectionProps = {
  loading: boolean;
  visibility: RutasVisibility;
  gate: RutasGateMeta | null;
  portfolio: ClientPortfolioLoad | null;
  pendingDecisions: number;
};

export function RutasDecisionRoutesSection({
  loading,
  visibility,
  gate,
  portfolio,
  pendingDecisions,
}: RutasDecisionRoutesSectionProps) {
  const overdueDebt = sumPortfolioOverdueDebt(portfolio);

  return (
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
            badge={!gate?.recommendations_enabled ? "Diagnóstico" : undefined}
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
            badge={pendingDecisions > 0 ? `${pendingDecisions} abiertas` : undefined}
          />
        ) : null}
      </div>
    </section>
  );
}
