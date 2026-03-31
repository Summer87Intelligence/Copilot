import Link from "next/link";
import { ArrowRight, GitBranch, Sparkles } from "lucide-react";

import { CopilotCard, CopilotGhostLink } from "@/components/copilot/copilot-ui";
import {
  MOCK_CAUSAL_CHAIN,
  MOCK_COPILOT_BRIEFING,
  MOCK_COPILOT_QUICK_ASK,
  MOCK_PANEL_VS_COPILOT,
} from "@/lib/copilot-mock-data";

export function CopilotDifferentiatorStrip({
  basePath = "/copilot",
}: {
  basePath?: string;
}) {
  const agentsHref =
    basePath === "/demo" ? `${basePath}/ia/agentes` : `${basePath}/agentes`;

  return (
    <section className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-[rgba(31,107,74,0.22)] bg-gradient-to-br from-[#e8f2ec] via-[var(--copilot-card)] to-[#ebe4f5] p-6 shadow-[var(--copilot-shadow)] sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[var(--copilot-accent-soft)] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-[rgba(90,75,120,0.12)] blur-3xl" />

        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="flex min-w-0 max-w-3xl gap-4">
            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-[var(--copilot-accent)] shadow-sm ring-1 ring-[rgba(31,107,74,0.15)]">
              <Sparkles className="h-6 w-6" aria-hidden />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--copilot-ink-muted)]">
                Lectura del copiloto · no es un gráfico más
              </p>
              <h2 className="mt-2 text-lg font-semibold leading-snug tracking-tight text-[var(--copilot-ink)] sm:text-xl">
                {MOCK_COPILOT_BRIEFING.headline}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--copilot-ink)]/90">
                {MOCK_COPILOT_BRIEFING.narrative}
              </p>
              <p className="mt-4 rounded-2xl border border-[rgba(31,107,74,0.18)] bg-white/70 px-4 py-3 text-sm font-medium leading-relaxed text-[var(--copilot-ink)]">
                <span className="text-[var(--copilot-accent)]">→ </span>
                {MOCK_COPILOT_BRIEFING.focus}
              </p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[200px]">
            <CopilotGhostLink href={agentsHref} className="gap-2 font-semibold">
              Comenzar con agentes de IA
              <ArrowRight className="h-4 w-4" aria-hidden />
            </CopilotGhostLink>
            <Link
              href={`${basePath}/acciones`}
              className="text-center text-sm font-semibold text-[var(--copilot-ink)]/80 underline-offset-4 hover:text-[var(--copilot-accent)] hover:underline"
            >
              Ver acciones priorizadas
            </Link>
          </div>
        </div>

        <div className="relative mt-8 grid gap-4 border-t border-[rgba(44,40,37,0.08)] pt-8 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Por qué esto no es un panel tradicional
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-white/55 p-4 ring-1 ring-[var(--copilot-border)]">
                <p className="text-xs font-semibold text-[var(--copilot-ink-muted)]">
                  Solo métricas
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink)]">
                  {MOCK_PANEL_VS_COPILOT.panel}
                </p>
              </div>
              <div className="rounded-2xl bg-[var(--copilot-accent-soft)]/50 p-4 ring-1 ring-[rgba(31,107,74,0.2)]">
                <p className="text-xs font-semibold text-[var(--copilot-accent)]">
                  Con copiloto
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink)]">
                  {MOCK_PANEL_VS_COPILOT.copilot}
                </p>
              </div>
            </div>
          </div>
          <CopilotCard className="bg-white/80">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              <GitBranch className="h-4 w-4 text-[var(--copilot-accent)]" aria-hidden />
              Cadena causa → lectura (ejemplo)
            </div>
            <ul className="space-y-4">
              {MOCK_CAUSAL_CHAIN.map((row) => (
                <li key={row.id} className="text-sm">
                  <p className="font-medium text-[var(--copilot-ink)]">
                    <span className="text-[var(--copilot-ink-muted)]">{row.trigger}</span>{" "}
                    <span className="italic text-[var(--copilot-ink-muted)]">{row.link}</span>{" "}
                    <span>{row.effect}</span>
                  </p>
                  <p className="mt-1.5 text-[var(--copilot-ink-muted)] leading-relaxed">
                    {row.copilotRead}
                  </p>
                </li>
              ))}
            </ul>
          </CopilotCard>
        </div>

        <div className="relative mt-6 flex flex-col gap-3 rounded-2xl border border-dashed border-[rgba(44,40,37,0.15)] bg-white/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Pregunta rápida (demo)
            </p>
            <p className="mt-1 text-sm font-medium text-[var(--copilot-ink)]">
              “{MOCK_COPILOT_QUICK_ASK.question}”
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
              {MOCK_COPILOT_QUICK_ASK.answer}
            </p>
          </div>
          <div className="shrink-0">
            <CopilotGhostLink
              href={`${basePath}/escenarios`}
              className="whitespace-nowrap"
            >
              Ver en escenarios
            </CopilotGhostLink>
          </div>
        </div>
      </div>
    </section>
  );
}
