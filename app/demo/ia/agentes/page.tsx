"use client";

import { useState } from "react";
import { Hand, ListOrdered, Play, Scale, Sparkles } from "lucide-react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import {
  CopilotBadge,
  CopilotCard,
  CopilotGhostButton,
  CopilotPrimaryButton,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import {
  DEMO_IA_AGENTS,
  DEMO_IA_EXECUTION_ORDER,
  DEMO_IA_HUMAN_INTERVENTION,
  DEMO_IA_METRICS_ROW,
  DEMO_IA_SYSTEM_RULES,
  type DemoIaAgent,
} from "@/lib/demo-ia-mock-data";

function agentTone(
  s: string
): "neutral" | "warning" | "danger" | "success" {
  if (s === "activo") return "success";
  if (s === "supervisado") return "warning";
  if (s === "pausado") return "neutral";
  return "neutral";
}

function AgentRow({ a }: { a: DemoIaAgent }) {
  return (
    <li className="rounded-2xl border border-amber-200/55 bg-white/90 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-[var(--copilot-ink)]">{a.name}</p>
            <CopilotBadge tone={agentTone(a.status)}>{a.status}</CopilotBadge>
            <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              {a.typeLabel}
            </span>
          </div>
          <p className="mt-2 text-sm text-[var(--copilot-ink-muted)]">{a.shortFn}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--copilot-ink-muted)]">
            <span>
              Autonomía: <strong className="text-[var(--copilot-ink)]">{a.autonomyLabel}</strong> ({a.autonomy}%)
            </span>
            <span>
              Última ejecución:{" "}
              <strong className="text-[var(--copilot-ink)]">{a.lastRun}</strong>
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {a.metrics.map((m) => (
              <span
                key={m.label}
                className="rounded-lg bg-[rgba(44,40,37,0.05)] px-2.5 py-1 text-[11px] font-semibold text-[var(--copilot-ink)]"
              >
                {m.label}: {m.value}
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <CopilotGhostButton type="button" className="text-xs">
            Ver detalle
          </CopilotGhostButton>
          <CopilotGhostButton type="button" className="text-xs">
            Configurar
          </CopilotGhostButton>
          <CopilotGhostButton type="button" className="text-xs">
            Pausar
          </CopilotGhostButton>
          <CopilotGhostButton type="button" className="text-xs">
            Simular
          </CopilotGhostButton>
        </div>
      </div>
    </li>
  );
}

export default function DemoIaAgentesPage() {
  const [simulationOn, setSimulationOn] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        eyebrow="IA · Operaciones"
        title="Agentes"
        description="Gestión y supervisión del equipo de agentes: estado, autonomía, reglas y orden de ejecución — todo visible en un solo tablero."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/70 bg-amber-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-amber-900">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Demo
            </span>
            <CopilotPrimaryButton
              type="button"
              onClick={() => setSimulationOn((v) => !v)}
              className="inline-flex items-center gap-2"
            >
              <Play className="h-4 w-4" aria-hidden />
              {simulationOn ? "Detener simulación" : "Simular ejecución"}
            </CopilotPrimaryButton>
          </div>
        }
      />

      <div className="flex-1 space-y-8 overflow-auto px-6 py-8">
        {simulationOn ? (
          <div
            role="status"
            className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-950"
          >
            <strong className="font-semibold">Simulación activa:</strong> los agentes
            procesan un lote ficticio — sin llamadas reales ni persistencia.
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-3">
          <CopilotCard className="border-amber-200/60 bg-gradient-to-b from-white to-amber-50/20 xl:col-span-1">
            <div className="mb-4 flex gap-3">
              <Scale className="h-5 w-5 shrink-0 text-amber-800" aria-hidden />
              <div>
                <h2 className="text-base font-semibold text-[var(--copilot-ink)]">
                  Reglas del sistema
                </h2>
                <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
                  Lo que el cerebro no puede violar.
                </p>
              </div>
            </div>
            <ul className="space-y-3">
              {DEMO_IA_SYSTEM_RULES.map((r) => (
                <li
                  key={r.id}
                  className="rounded-xl border border-[var(--copilot-border)] bg-white/80 p-3 text-sm"
                >
                  <p className="font-semibold text-[var(--copilot-ink)]">{r.title}</p>
                  <p className="mt-1 text-[var(--copilot-ink-muted)]">{r.detail}</p>
                </li>
              ))}
            </ul>
          </CopilotCard>

          <CopilotCard className="border-amber-200/60 bg-white/90 xl:col-span-1">
            <div className="mb-4 flex gap-3">
              <Hand className="h-5 w-5 shrink-0 text-[var(--copilot-accent)]" aria-hidden />
              <div>
                <h2 className="text-base font-semibold text-[var(--copilot-ink)]">
                  Intervención humana
                </h2>
                <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
                  Dónde entra el equipo antes de actuar.
                </p>
              </div>
            </div>
            <p className="text-3xl font-semibold tracking-tight text-[var(--copilot-ink)]">
              {DEMO_IA_HUMAN_INTERVENTION.pending}{" "}
              <span className="text-lg font-medium text-[var(--copilot-ink-muted)]">
                en cola
              </span>
            </p>
            <p className="mt-2 text-sm text-[var(--copilot-ink-muted)]">
              Tiempo medio de decisión: ~{DEMO_IA_HUMAN_INTERVENTION.avgMinutes} min.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {DEMO_IA_HUMAN_INTERVENTION.channels.map((c) => (
                <CopilotBadge key={c} tone="warning">
                  {c}
                </CopilotBadge>
              ))}
            </div>
          </CopilotCard>

          <CopilotCard className="border-amber-200/60 bg-white/90 xl:col-span-1">
            <div className="mb-4 flex gap-3">
              <ListOrdered
                className="h-5 w-5 shrink-0 text-[var(--copilot-ink-muted)]"
                aria-hidden
              />
              <div>
                <h2 className="text-base font-semibold text-[var(--copilot-ink)]">
                  Orden de ejecución
                </h2>
                <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
                  Pipeline actual del cerebro.
                </p>
              </div>
            </div>
            <ol className="space-y-2">
              {DEMO_IA_EXECUTION_ORDER.map((s) => (
                <li
                  key={s.step}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm ${
                    s.state === "done"
                      ? "border-emerald-200/80 bg-emerald-50/50 text-emerald-950"
                      : s.state === "active"
                        ? "border-amber-300/80 bg-amber-50/80 font-semibold text-amber-950"
                        : "border-dashed border-[var(--copilot-border)] bg-white/60 text-[var(--copilot-ink-muted)]"
                  }`}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/90 text-xs font-bold ring-1 ring-[var(--copilot-border)]">
                    {s.step}
                  </span>
                  <span className="text-[var(--copilot-ink)]">{s.label}</span>
                </li>
              ))}
            </ol>
          </CopilotCard>
        </div>

        <section>
          <CopilotSectionTitle
            title="Listado de agentes"
            subtitle="Métricas ilustrativas — modo demostración."
            action={
              <div className="flex flex-wrap gap-2 text-xs text-[var(--copilot-ink-muted)]">
                {DEMO_IA_METRICS_ROW.map((m) => (
                  <span key={m.label} className="rounded-full bg-white/80 px-2 py-1 ring-1 ring-[var(--copilot-border)]">
                    {m.label}: <strong className="text-[var(--copilot-ink)]">{m.value}</strong>
                  </span>
                ))}
              </div>
            }
          />
          <ul className="space-y-3">
            {DEMO_IA_AGENTS.map((a) => (
              <AgentRow key={a.id} a={a} />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
