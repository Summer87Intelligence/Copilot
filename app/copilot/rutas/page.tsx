"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { DecisionRouteCard } from "@/components/copilot/decision-route-card";
import { CopilotCard, CopilotPrimaryLink } from "@/components/copilot/copilot-ui";
import type { InitiativeFlowItem } from "@/lib/ai/initiative-flow-types";
import { getClientPortfolio } from "@/lib/copilot-clients-portfolio";
import { getProtoInvoices, type DataRow } from "@/lib/copilot-data";
import {
  buildRutasVisibility,
  countTaxAgendaUpcoming,
  formatCoverageRutas,
  formatMoneyRutas,
  formatRutasPeriodLabel,
  fiscalCriticalHighCounts,
  simplifiedSaludLabel,
  sumPortfolioOverdueDebt,
  totalFiscalAlertsCount,
  type RutasHubData,
} from "@/lib/copilot-rutas-hub";
import { getFinancialSnapshot } from "@/lib/copilot-financial-engine";
import { getUpcomingTaxAgenda } from "@/lib/copilot-tax-data";
import { getFiscalAlerts } from "@/lib/copilot-tax-alerts";

function avgCollectionFromInvoices(rows: DataRow[]): number | null {
  let s = 0;
  let n = 0;
  for (const r of rows) {
    const v = r.collection_probability;
    if (v == null || v === "") continue;
    const num = typeof v === "number" ? v : Number(String(v).replace(",", "."));
    if (Number.isFinite(num)) {
      s += num;
      n += 1;
    }
  }
  if (n === 0) return null;
  return s / n;
}

function countPendingFlow(items: InitiativeFlowItem[]): number {
  const open: InitiativeFlowItem["flow_status"][] = [
    "new",
    "decision_generated",
    "action_pending",
  ];
  return items.filter((i) => open.includes(i.flow_status)).length;
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
  const [hub, setHub] = useState<RutasHubData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [snapshot, fiscalAlerts, taxAgenda, portfolio, invoices, flowRes] =
        await Promise.all([
          getFinancialSnapshot().catch(() => null),
          getFiscalAlerts().catch(() => []),
          getUpcomingTaxAgenda().catch(() => []),
          getClientPortfolio().catch(() => null),
          getProtoInvoices("active").catch(() => []),
          fetch("/api/copilot/initiatives/flow?limit=120").then((r) => r.json()),
        ]);

      const flowJson = flowRes as { items?: InitiativeFlowItem[] };
      const items = flowJson.items ?? [];
      const pendingDecisions = countPendingFlow(items);

      setHub({
        snapshot,
        fiscalAlerts,
        taxAgenda,
        portfolio,
        avgCollectionPct: avgCollectionFromInvoices(invoices),
        pendingDecisions,
      });
    } catch {
      setHub({
        snapshot: null,
        fiscalAlerts: [],
        taxAgenda: [],
        portfolio: null,
        avgCollectionPct: null,
        pendingDecisions: 0,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibility = useMemo(() => {
    if (!hub) {
      return {
        empezar: true,
        caja: true,
        cobranza: false,
        pagosImpuestos: true,
        clientesRiesgo: false,
        decisiones: false,
      };
    }
    return buildRutasVisibility(hub);
  }, [hub]);

  const { critical, high } = hub
    ? fiscalCriticalHighCounts(hub.fiscalAlerts)
    : { critical: 0, high: 0 };
  const salud = hub
    ? simplifiedSaludLabel(hub.fiscalAlerts, hub.snapshot)
    : { label: "…", tone: "neutral" as const };

  const overdueDebt = hub ? sumPortfolioOverdueDebt(hub.portfolio) : 0;
  const upcoming30 = hub ? countTaxAgendaUpcoming(hub.taxAgenda, 30) : 0;
  const alertTotal = hub ? totalFiscalAlertsCount(hub.fiscalAlerts) : 0;

  const hasAnySignal =
    hub &&
    (hub.snapshot != null ||
      hub.fiscalAlerts.length > 0 ||
      (hub.portfolio?.rows?.length ?? 0) > 0 ||
      hub.taxAgenda.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
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
                label="Venc. 30 días"
                value={String(upcoming30)}
                tone={upcoming30 > 0 ? "warning" : "neutral"}
              />
              <KpiPill label="Alertas" value={String(alertTotal)} />
              <KpiPill
                label="Cobrabilidad est."
                value={
                  hub?.avgCollectionPct != null
                    ? `${Math.round(hub.avgCollectionPct * 100)}%`
                    : hub?.snapshot != null
                      ? formatCoverageRutas(hub.snapshot.coverage_ratio)
                      : "—"
                }
              />
            </div>
          )}
        </section>

        {!loading && !hasAnySignal ? (
          <CopilotCard className="border-amber-200/80 bg-amber-50/50">
            <p className="text-sm font-semibold text-amber-950">
              Todavía no hay señales para guiarte
            </p>
            <p className="mt-2 text-sm text-amber-900/90">
              Cargá facturas, cobros y obligaciones para que estas rutas muestren números reales.
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
                description="Prioridades claras antes de abrir el resto del negocio."
                ctaLabel="Ver prioridades del día"
                href="/copilot/rutas/empezar"
                badge={
                  critical > 0
                    ? `${critical} crítica${critical === 1 ? "" : "s"}`
                    : high > 0
                      ? `${high} alta${high === 1 ? "" : "s"}`
                      : undefined
                }
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
                badge={upcoming30 > 0 ? `${upcoming30} en 30 días` : undefined}
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
