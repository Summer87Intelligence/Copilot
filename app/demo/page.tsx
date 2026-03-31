"use client";

import { useState } from "react";
import Link from "next/link";

import { CopilotHomeQuickLinks } from "@/components/copilot/copilot-home-quick-links";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { PeriodSelect } from "@/components/copilot/period-select";
import { CopilotDifferentiatorStrip } from "@/components/copilot/copilot-differentiator-strip";
import {
  CopilotCard,
  CopilotGhostButton,
  CopilotPrimaryLink,
  CopilotSectionTitle,
  CopilotKpiCard,
} from "@/components/copilot/copilot-ui";
import {
  MOCK_ALERTS,
  MOCK_ALERTS_SUMMARY,
  MOCK_BUSINESS_HEALTH,
  MOCK_COMPANY_NAME,
  MOCK_KPIS,
  MOCK_SCENARIOS,
} from "@/lib/copilot-mock-data";

export default function CopilotHomePage() {
  const [period, setPeriod] = useState("mar-2026");
  const featuredAlert = MOCK_ALERTS[0];
  const stable = MOCK_SCENARIOS.find((s) => s.id === "stable");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        eyebrow="Summer87 Copilot"
        title="Inicio"
        description={`Demostración visual (sin Supabase): visión de ${MOCK_COMPANY_NAME} y recorrido del producto. El prototipo operativo está en /copilot.`}
        right={
          <CopilotPrimaryLink href="/demo/ia" className="gap-2 whitespace-nowrap">
            Ir a Centro IA
          </CopilotPrimaryLink>
        }
      />

      <div className="flex-1 space-y-10 overflow-auto px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--copilot-border)] pb-6">
          <p className="text-sm text-[var(--copilot-ink-muted)]">
            Vista del panel ejecutivo · período analizado
          </p>
          <PeriodSelect value={period} onChange={setPeriod} />
        </div>

        <CopilotHomeQuickLinks basePath="/demo" />

        <CopilotDifferentiatorStrip basePath="/demo" />

        <section>
          <CopilotSectionTitle
            title="Indicadores clave"
            subtitle="Resumen financiero del período seleccionado."
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            {MOCK_KPIS.map((k) => (
              <CopilotKpiCard
                key={k.id}
                label={k.label}
                value={k.value}
                hint={k.hint}
                trend={k.trend}
              />
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <CopilotCard>
            <CopilotSectionTitle
              title="Salud del negocio"
              subtitle="Lectura ejecutiva en una mirada."
            />
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  Puntaje
                </p>
                <p className="mt-1 text-4xl font-semibold tracking-tight text-[var(--copilot-ink)]">
                  {MOCK_BUSINESS_HEALTH.score}
                  <span className="text-lg font-medium text-[var(--copilot-ink-muted)]">
                    /100
                  </span>
                </p>
              </div>
              <p className="min-w-0 flex-1 text-sm font-medium leading-relaxed text-[var(--copilot-ink)]">
                {MOCK_BUSINESS_HEALTH.label}
              </p>
            </div>
            <ul className="mt-5 space-y-2 border-t border-[var(--copilot-border)] pt-5 text-sm text-[var(--copilot-ink-muted)]">
              {MOCK_BUSINESS_HEALTH.bullets.map((b) => (
                <li key={b} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--copilot-accent)]" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </CopilotCard>

          <CopilotCard>
            <CopilotSectionTitle
              title="Alertas principales"
              subtitle="Resumen por severidad."
              action={
                <Link
                  href="/demo/alertas"
                  className="text-sm font-semibold text-[var(--copilot-accent)] hover:underline"
                >
                  Ver todas
                </Link>
              }
            />
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-rose-200/80 bg-rose-50/80 p-4 text-center">
                <p className="text-2xl font-semibold text-rose-900">
                  {MOCK_ALERTS_SUMMARY.critical}
                </p>
                <p className="text-xs font-medium text-rose-800/90">Críticas</p>
              </div>
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 p-4 text-center">
                <p className="text-2xl font-semibold text-amber-900">
                  {MOCK_ALERTS_SUMMARY.high}
                </p>
                <p className="text-xs font-medium text-amber-900/90">Altas</p>
              </div>
              <div className="rounded-xl border border-slate-200/90 bg-slate-50/90 p-4 text-center">
                <p className="text-2xl font-semibold text-slate-800">
                  {MOCK_ALERTS_SUMMARY.medium}
                </p>
                <p className="text-xs font-medium text-slate-700">Medias</p>
              </div>
            </div>
            <div className="mt-5 rounded-xl border border-[var(--copilot-border)] bg-white/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Destacada
              </p>
              <p className="mt-2 text-sm font-semibold text-[var(--copilot-ink)]">
                {featuredAlert.title}
              </p>
              <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
                {featuredAlert.summary}
              </p>
            </div>
          </CopilotCard>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <CopilotCard>
            <CopilotSectionTitle
              title="Acciones recomendadas"
              subtitle="Lo que el copiloto sugiere priorizar."
              action={
                <Link
                  href="/demo/acciones"
                  className="text-sm font-semibold text-[var(--copilot-accent)] hover:underline"
                >
                  Ir a acciones
                </Link>
              }
            />
            <ol className="space-y-3">
              {[
                "Asegurar cobro de facturas vencidas (top 3 clientes).",
                "Revisión rápida de gastos administrativos recurrentes.",
                "Validar stock crítico en canal retail.",
              ].map((text, i) => (
                <li
                  key={text}
                  className="flex gap-3 rounded-xl border border-[var(--copilot-border)] bg-white/80 px-4 py-3 text-sm text-[var(--copilot-ink)]"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--copilot-accent-soft)] text-xs font-bold text-[var(--copilot-accent)]">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{text}</span>
                </li>
              ))}
            </ol>
            <div className="mt-5 flex flex-wrap gap-2">
              <CopilotGhostButton>Ver plan sugerido</CopilotGhostButton>
              <CopilotGhostButton>Enviar a mi equipo</CopilotGhostButton>
            </div>
          </CopilotCard>

          <CopilotCard>
            <CopilotSectionTitle
              title="Escenario actual"
              subtitle="Lectura del estado operativo y financiero."
              action={
                <Link
                  href="/demo/escenarios"
                  className="text-sm font-semibold text-[var(--copilot-accent)] hover:underline"
                >
                  Comparar escenarios
                </Link>
              }
            />
            {stable ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-full bg-[var(--copilot-accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--copilot-accent)]">
                    {stable.label}
                  </span>
                  <span className="text-xs text-[var(--copilot-ink-muted)]">
                    Período: {period === "mar-2026" ? "Mar 2026" : "Selección"}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-[var(--copilot-ink)]">
                  {stable.narrative}
                </p>
                <div className="grid grid-cols-3 gap-3 text-center text-sm">
                  <div className="rounded-xl bg-white/80 py-3 ring-1 ring-[var(--copilot-border)]">
                    <p className="text-xs text-[var(--copilot-ink-muted)]">Caja</p>
                    <p className="mt-1 font-semibold">{stable.cash}</p>
                  </div>
                  <div className="rounded-xl bg-white/80 py-3 ring-1 ring-[var(--copilot-border)]">
                    <p className="text-xs text-[var(--copilot-ink-muted)]">Ventas</p>
                    <p className="mt-1 font-semibold">{stable.sales}</p>
                  </div>
                  <div className="rounded-xl bg-white/80 py-3 ring-1 ring-[var(--copilot-border)]">
                    <p className="text-xs text-[var(--copilot-ink-muted)]">Gastos</p>
                    <p className="mt-1 font-semibold">{stable.expenses}</p>
                  </div>
                </div>
              </div>
            ) : null}
          </CopilotCard>
        </section>
      </div>
    </div>
  );
}
