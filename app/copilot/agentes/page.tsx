"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Check,
  CircleDot,
  Database,
  Play,
} from "lucide-react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import {
  CopilotCard,
  CopilotGhostLink,
  CopilotPrimaryButton,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import {
  MOCK_AI_AGENTS,
  type MockAiAgentId,
} from "@/lib/copilot-mock-data";

const STEPS = [
  {
    id: 1,
    title: "Elegí agentes",
    text: "Activá solo lo que necesitás: cobranza, costos, riesgo, etc.",
  },
  {
    id: 2,
    title: "Conectá datos",
    text: "El copiloto se alimenta de tus fuentes (ya configuradas o nuevas).",
  },
  {
    id: 3,
    title: "Recibí briefings",
    text: "Prioridades y acciones en lenguaje de director — sin tablas infinitas.",
  },
] as const;

export default function CopilotAgentesPage() {
  const [step, setStep] = useState(1);
  const [enabled, setEnabled] = useState<Record<MockAiAgentId, boolean>>(() => {
    const init = {} as Record<MockAiAgentId, boolean>;
    for (const a of MOCK_AI_AGENTS) init[a.id] = a.defaultOn;
    return init;
  });
  const [started, setStarted] = useState(false);

  const selectedCount = useMemo(
    () => Object.values(enabled).filter(Boolean).length,
    [enabled]
  );

  const toggle = (id: MockAiAgentId) => {
    setEnabled((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        surfaceId="copilot.agentes"
        title="Agentes de IA"
        description="No es “más gráficos”: son especialistas que leen tus datos, priorizan y proponen el siguiente movimiento — como un equipo, disponible 24/7."
      />

      <div className="flex-1 space-y-10 overflow-auto px-6 py-8">
        <section>
          <div className="grid gap-4 lg:grid-cols-3">
            {STEPS.map((s) => {
              const active = step === s.id;
              const done = step > s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStep(s.id)}
                  className={`rounded-2xl border p-5 text-left transition ${
                    active
                      ? "border-[rgba(31,107,74,0.35)] bg-white shadow-[var(--copilot-shadow)] ring-1 ring-[rgba(31,107,74,0.12)]"
                      : "border-[var(--copilot-border)] bg-[var(--copilot-card)] hover:bg-white/80"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold ${
                        done
                          ? "bg-[var(--copilot-accent)] text-white"
                          : active
                            ? "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)]"
                            : "bg-[rgba(44,40,37,0.06)] text-[var(--copilot-ink-muted)]"
                      }`}
                    >
                      {done ? <Check className="h-5 w-5" /> : s.id}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-[var(--copilot-ink)]">
                        {s.title}
                      </p>
                      <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
                        {s.text}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {step === 1 ? (
          <section className="space-y-6">
            <CopilotCard className="border-[rgba(31,107,74,0.15)] bg-gradient-to-br from-white to-[#e8f2ec]/40">
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)]">
                  <Bot className="h-7 w-7" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold text-[var(--copilot-ink)]">
                    La ventaja que casi nadie muestra en producto
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
                    Un dashboard te dice <em>qué pasó</em>. Los agentes te ayudan con{" "}
                    <strong className="font-semibold text-[var(--copilot-ink)]">
                      qué hacer ahora
                    </strong>{" "}
                    y <strong className="font-semibold text-[var(--copilot-ink)]">por qué</strong>{" "}
                    — con contexto de tu PyME, no genérico.
                  </p>
                </div>
              </div>
            </CopilotCard>

            <div>
              <CopilotSectionTitle
                title="Activá tus agentes"
                subtitle="Cada uno compara “sin copiloto” vs “con agente” para que veas el salto de valor."
              />
              <div className="grid gap-4 lg:grid-cols-2">
                {MOCK_AI_AGENTS.map((agent) => {
                  const on = enabled[agent.id];
                  return (
                    <CopilotCard
                      key={agent.id}
                      className={`flex flex-col gap-4 ${on ? "ring-1 ring-[rgba(31,107,74,0.2)]" : ""}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--copilot-ink)]">
                            {agent.name}
                          </p>
                          <p className="mt-1 text-sm text-[var(--copilot-accent)]">
                            {agent.tagline}
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          onClick={() => toggle(agent.id)}
                          className={`relative h-9 w-16 shrink-0 rounded-full transition ${
                            on ? "bg-[var(--copilot-accent)]" : "bg-[rgba(44,40,37,0.15)]"
                          }`}
                        >
                          <span
                            className={`absolute top-1 h-7 w-7 rounded-full bg-white shadow transition ${
                              on ? "left-8" : "left-1"
                            }`}
                          />
                        </button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl bg-[rgba(44,40,37,0.04)] p-3">
                          <p className="text-xs font-semibold text-[var(--copilot-ink-muted)]">
                            Sin copiloto
                          </p>
                          <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink)]">
                            {agent.withoutCopilot}
                          </p>
                        </div>
                        <div className="rounded-xl bg-[var(--copilot-accent-soft)]/60 p-3">
                          <p className="text-xs font-semibold text-[var(--copilot-accent)]">
                            Con agente
                          </p>
                          <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink)]">
                            {agent.withAgent}
                          </p>
                        </div>
                      </div>
                      <ul className="space-y-1.5 border-t border-[var(--copilot-border)] pt-3 text-sm text-[var(--copilot-ink-muted)]">
                        {agent.delivers.map((d) => (
                          <li key={d} className="flex gap-2">
                            <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-[var(--copilot-accent)]" />
                            {d}
                          </li>
                        ))}
                      </ul>
                    </CopilotCard>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-[var(--copilot-ink-muted)]">
                {selectedCount} agente{selectedCount === 1 ? "" : "s"} seleccionado
                {selectedCount === 1 ? "" : "s"}.
              </p>
              <div className="flex flex-wrap gap-2">
                <CopilotGhostLink href="/copilot">Volver al panel</CopilotGhostLink>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--copilot-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--copilot-ink)] shadow-sm hover:bg-white"
                >
                  Siguiente: datos
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="space-y-6">
            <CopilotCard>
              <CopilotSectionTitle
                title="Conectá tus datos"
                subtitle="Sin datos confiables, el copiloto puede sintetizar… pero no acertar. Esta es la base."
              />
              <ul className="space-y-3 text-sm text-[var(--copilot-ink)]">
                <li className="flex gap-3">
                  <Database className="mt-0.5 h-5 w-5 shrink-0 text-[var(--copilot-accent)]" />
                  <span>
                    Revisá fuentes en{" "}
                    <Link
                      href="/copilot/datos"
                      className="font-semibold text-[var(--copilot-accent)] underline-offset-2 hover:underline"
                    >
                      Datos / Integraciones
                    </Link>
                    . Podés empezar con CSV y evolucionar a conectores.
                  </span>
                </li>
                <li className="flex gap-3">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-[var(--copilot-accent)]" />
                  <span>
                    Cuanto más actualizado esté el flujo de caja y cobranza, mejores serán las prioridades del agente de cobranza.
                  </span>
                </li>
              </ul>
            </CopilotCard>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-xl border border-[var(--copilot-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--copilot-ink)]"
              >
                Atrás
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--copilot-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--copilot-ink)] shadow-sm"
              >
                Siguiente: briefings
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="space-y-6">
            <CopilotCard>
              <CopilotSectionTitle
                title="Briefings y ejecución"
                subtitle="Los agentes traducen datos en decisiones: vos elegís velocidad y estilo (más conservador o más agresivo) en Personalización."
              />
              <p className="text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
                Cuando confirmes, vas a ver prioridades en{" "}
                <Link href="/copilot/acciones" className="font-semibold text-[var(--copilot-accent)] hover:underline">
                  Acciones
                </Link>
                , alertas explicadas en{" "}
                <Link href="/copilot/alertas" className="font-semibold text-[var(--copilot-accent)] hover:underline">
                  Alertas
                </Link>{" "}
                y el hilo de razonamiento en{" "}
                <Link href="/copilot/insights" className="font-semibold text-[var(--copilot-accent)] hover:underline">
                  Insights
                </Link>
                .
              </p>
            </CopilotCard>

            {!started ? (
              <div className="flex flex-wrap items-center gap-3">
                <CopilotPrimaryButton
                  type="button"
                  onClick={() => setStarted(true)}
                  className="inline-flex items-center gap-2"
                >
                  <Play className="h-4 w-4" />
                  Comenzar con {selectedCount} agente{selectedCount === 1 ? "" : "s"}
                </CopilotPrimaryButton>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="text-sm font-semibold text-[var(--copilot-ink-muted)] hover:text-[var(--copilot-ink)]"
                >
                  Atrás
                </button>
              </div>
            ) : (
              <CopilotCard className="border-emerald-200/80 bg-emerald-50/40">
                <p className="text-sm font-semibold text-emerald-950">
                  Listo — en una integración real, acá dispararíamos orquestación (colas), permisos y trazabilidad por agente.
                </p>
                <p className="mt-2 text-sm text-emerald-900/85">
                  Por ahora es una demo visual: ya tenés la experiencia de “equipo de IA” y el contraste de valor en cada tarjeta.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <CopilotGhostLink href="/copilot">Ir al dashboard</CopilotGhostLink>
                  <CopilotGhostLink href="/copilot/acciones">Ver acciones</CopilotGhostLink>
                </div>
              </CopilotCard>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
