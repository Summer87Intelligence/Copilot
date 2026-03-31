"use client";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Brain,
  Cpu,
  Gauge,
  GitBranch,
  RefreshCw,
  Shield,
  Sparkles,
  Zap,
} from "lucide-react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import {
  CopilotBadge,
  CopilotCard,
  CopilotGhostLink,
  CopilotPrimaryLink,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import {
  DEMO_IA_AGENTS,
  DEMO_IA_CAPABILITIES,
  DEMO_IA_EXEC_SUMMARY,
  DEMO_IA_OPERATIVE_BRAIN,
} from "@/lib/demo-ia-mock-data";

function MiniStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-amber-200/60 bg-white/80 p-4 shadow-sm ring-1 ring-amber-100/50">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-900/45">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-amber-950">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function agentTone(
  s: string
): "neutral" | "warning" | "danger" | "success" {
  if (s === "activo") return "success";
  if (s === "supervisado") return "warning";
  if (s === "pausado") return "neutral";
  return "neutral";
}

export default function DemoIaHomePage() {
  const sum = DEMO_IA_EXEC_SUMMARY;
  const brain = DEMO_IA_OPERATIVE_BRAIN;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        eyebrow="Summer87 Leads · Copilot"
        title="IA"
        description="Centro de mando del sistema inteligente: agentes, decisiones, autonomía y supervisión — una sola vista operativa, no un reporte."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/70 bg-amber-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-amber-900">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Demo
            </span>
            <CopilotPrimaryLink
              href="/demo/ia/agentes"
              className="inline-flex items-center gap-2 whitespace-nowrap"
            >
              Gestionar agentes
              <ArrowRight className="h-4 w-4" aria-hidden />
            </CopilotPrimaryLink>
          </div>
        }
      />

      <div className="flex-1 space-y-10 overflow-auto px-6 py-8">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <MiniStat label="Agentes activos" value={String(sum.activeAgents)} />
          <MiniStat
            label="Decisiones hoy"
            value={String(sum.decisionsToday)}
            hint="Pipeline comercial + priorización"
          />
          <MiniStat
            label="Automatizaciones"
            value={String(sum.automations)}
            hint="Flujos en ejecución"
          />
          <MiniStat
            label="Incidencias IA"
            value={String(sum.incidents)}
            hint="Requieren revisión"
          />
          <MiniStat
            label="Autonomía"
            value={`${sum.autonomyLevel}%`}
            hint={sum.autonomyLabel}
          />
          <MiniStat
            label="Última sincronización"
            value={sum.lastSync}
            hint="Contexto, políticas y reglas"
          />
        </section>

        <section>
          <CopilotSectionTitle
            title="Cerebro operativo"
            subtitle="Estado en vivo, flujo activo y misión del día — lectura de sistema, no de métricas sueltas."
          />
          <div className="grid gap-6 lg:grid-cols-5">
            <CopilotCard className="border-amber-200/70 bg-gradient-to-br from-white via-amber-50/30 to-white lg:col-span-3">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100/90 text-emerald-800 ring-1 ring-emerald-200/80">
                  <Cpu className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    Estado del sistema
                  </p>
                  <p className="text-lg font-semibold text-[var(--copilot-ink)]">
                    {brain.systemState}
                  </p>
                </div>
                <CopilotBadge tone="success">Operativo</CopilotBadge>
              </div>
              <p className="text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
                {brain.systemDetail}
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-[var(--copilot-border)] bg-white/70 p-4">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    <GitBranch className="h-4 w-4 text-[var(--copilot-accent)]" />
                    Flujo activo
                  </p>
                  <p className="mt-2 text-sm font-medium leading-snug text-[var(--copilot-ink)]">
                    {brain.activeFlow}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--copilot-border)] bg-white/70 p-4">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    <Zap className="h-4 w-4 text-amber-700" />
                    Misión del día
                  </p>
                  <p className="mt-2 text-sm font-medium leading-snug text-[var(--copilot-ink)]">
                    {brain.dailyMission}
                  </p>
                </div>
              </div>
              <div className="mt-6 border-t border-[var(--copilot-border)] pt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  Próximos procesos
                </p>
                <ul className="mt-3 space-y-2">
                  {brain.nextProcesses.map((n) => (
                    <li
                      key={n.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-[var(--copilot-border)] bg-white/60 px-3 py-2 text-sm"
                    >
                      <span className="text-[var(--copilot-ink)]">{n.label}</span>
                      <span className="shrink-0 text-xs font-semibold text-[var(--copilot-ink-muted)]">
                        {n.eta}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </CopilotCard>

            <CopilotCard className="border-amber-200/60 bg-white/90 lg:col-span-2">
              <div className="mb-3 flex items-center gap-2">
                <Gauge className="h-5 w-5 text-[var(--copilot-accent)]" aria-hidden />
                <p className="text-sm font-semibold text-[var(--copilot-ink)]">
                  Intervención humana
                </p>
              </div>
              <div className="flex items-end gap-2">
                <p className="text-4xl font-semibold tracking-tight text-[var(--copilot-ink)]">
                  {brain.humanIntervention}
                  <span className="text-lg font-medium text-[var(--copilot-ink-muted)]">
                    %
                  </span>
                </p>
                <p className="pb-1 text-xs text-[var(--copilot-ink-muted)]">
                  del tráfico revisado por personas
                </p>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
                {brain.humanInterventionLabel}
              </p>
              <div className="mt-5 flex items-center gap-2 rounded-xl bg-[var(--copilot-accent-soft)]/50 px-3 py-2 text-xs font-medium text-[var(--copilot-ink)]">
                <Activity className="h-4 w-4 shrink-0 text-[var(--copilot-accent)]" />
                Modo recomendado: supervisión en borradores y excepciones.
              </div>
            </CopilotCard>
          </div>
        </section>

        <section>
          <CopilotSectionTitle
            title="Agentes"
            subtitle="Equipo especializado con autonomía acotada y trazabilidad."
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {DEMO_IA_AGENTS.map((a) => (
              <CopilotCard
                key={a.id}
                className="flex flex-col border-amber-200/50 bg-white/85"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[var(--copilot-ink)]">
                      {a.name}
                    </p>
                    <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
                      {a.shortFn}
                    </p>
                  </div>
                  <CopilotBadge tone={agentTone(a.status)}>{a.status}</CopilotBadge>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-medium text-[var(--copilot-ink-muted)]">
                  <span className="rounded-md bg-[rgba(44,40,37,0.06)] px-2 py-0.5">
                    {a.typeLabel}
                  </span>
                  <span className="rounded-md bg-[rgba(44,40,37,0.06)] px-2 py-0.5">
                    Autonomía {a.autonomyLabel}
                  </span>
                  <span className="rounded-md bg-[rgba(44,40,37,0.06)] px-2 py-0.5">
                    Última · {a.lastRun}
                  </span>
                </div>
                <div className="mt-auto flex justify-end pt-4">
                  <CopilotGhostLink
                    href="/demo/ia/agentes"
                    className="text-xs font-semibold"
                  >
                    Ver detalle
                  </CopilotGhostLink>
                </div>
              </CopilotCard>
            ))}
          </div>
        </section>

        <section>
          <CopilotSectionTitle
            title="Capacidades"
            subtitle="Qué puede hacer el stack — de punta a punta."
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DEMO_IA_CAPABILITIES.map((c) => (
              <div
                key={c.id}
                className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100">
                    <Brain className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <p className="font-semibold text-[var(--copilot-ink)]">{c.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
                      {c.hint}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <CopilotSectionTitle
            title="Configuración y gobierno"
            subtitle="Accesos rápidos al sistema operativo inteligente."
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href="/demo/ia/agentes"
              className="group flex flex-col gap-2 rounded-2xl border border-amber-200/70 bg-amber-50/40 p-5 shadow-sm ring-1 ring-amber-100/60 transition hover:bg-amber-50/70"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-amber-950">
                  Gestión de agentes
                </span>
                <ArrowRight className="h-4 w-4 text-amber-800/60 transition group-hover:translate-x-0.5" />
              </div>
              <p className="text-xs leading-relaxed text-amber-900/70">
                Supervisión, métricas y simulación de comportamiento.
              </p>
            </Link>
            <Link
              href="/demo/ia/configuracion"
              className="group flex flex-col gap-2 rounded-2xl border border-[var(--copilot-border)] bg-white/90 p-5 shadow-sm transition hover:border-[rgba(31,107,74,0.25)]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-[var(--copilot-ink)]">
                  Configuración IA
                </span>
                <Shield className="h-4 w-4 text-[var(--copilot-accent)]" />
              </div>
              <p className="text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
                Autonomía global, modos de operación y políticas.
              </p>
            </Link>
            <Link
              href="/demo/ia/prompts"
              className="group flex flex-col gap-2 rounded-2xl border border-[var(--copilot-border)] bg-white/90 p-5 shadow-sm transition hover:border-[rgba(31,107,74,0.25)]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-[var(--copilot-ink)]">
                  Prompts
                </span>
                <Sparkles className="h-4 w-4 text-amber-700" />
              </div>
              <p className="text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
                Plantillas y variantes por contexto de negocio.
              </p>
            </Link>
            <Link
              href="/demo/ia/perfiles"
              className="group flex flex-col gap-2 rounded-2xl border border-[var(--copilot-border)] bg-white/90 p-5 shadow-sm transition hover:border-[rgba(31,107,74,0.25)]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-[var(--copilot-ink)]">
                  Perfiles
                </span>
                <RefreshCw className="h-4 w-4 text-[var(--copilot-ink-muted)]" />
              </div>
              <p className="text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
                Roles, permisos y límites de acción por usuario.
              </p>
            </Link>
            <Link
              href="/demo/ia/categorias"
              className="group flex flex-col gap-2 rounded-2xl border border-[var(--copilot-border)] bg-white/90 p-5 shadow-sm transition hover:border-[rgba(31,107,74,0.25)]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-[var(--copilot-ink)]">
                  Categorías
                </span>
                <Activity className="h-4 w-4 text-[var(--copilot-ink-muted)]" />
              </div>
              <p className="text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
                Taxonomía de señales, industrias y etapas de compra.
              </p>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
