"use client";

import { useState } from "react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotReadingKey } from "@/components/copilot/copilot-reading-key";
import { CopilotCard, CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import { MOCK_SCENARIOS } from "@/lib/copilot-mock-data";

type ScenarioId = (typeof MOCK_SCENARIOS)[number]["id"];

export default function CopilotEscenariosPage() {
  const [active, setActive] = useState<ScenarioId>("stable");
  const current = MOCK_SCENARIOS.find((s) => s.id === active)!;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        title="Escenarios"
        description="Compará lecturas de riesgo, estabilidad y crecimiento — para decidir con contexto."
        readingKey={
          <CopilotReadingKey
            lines={[
              "No decido solo con el presente.",
              "Puedo comparar contextos.",
              "Esto me ayuda a pensar estratégicamente.",
            ]}
          />
        }
      />

      <div className="flex-1 space-y-8 overflow-auto px-6 py-8">
        <CopilotCard>
          <CopilotSectionTitle
            title="Selector de escenarios"
            subtitle="Elegí una lente; los números son referenciales de simulación."
          />
          <div className="flex flex-wrap gap-2">
            {MOCK_SCENARIOS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActive(s.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  active === s.id
                    ? "bg-[var(--copilot-ink)] text-white"
                    : "bg-white/80 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-white"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </CopilotCard>

        <div className="grid gap-6 lg:grid-cols-3">
          <CopilotCard className="lg:col-span-2">
            <CopilotSectionTitle
              title="Impacto estimado"
              subtitle={`Escenario: ${current.label}`}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-white/85 p-4 ring-1 ring-[var(--copilot-border)]">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  Caja
                </p>
                <p className="mt-2 text-xl font-semibold tabular-nums text-[var(--copilot-ink)]">
                  {current.cash}
                </p>
              </div>
              <div className="rounded-2xl bg-white/85 p-4 ring-1 ring-[var(--copilot-border)]">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  Ventas
                </p>
                <p className="mt-2 text-xl font-semibold tabular-nums text-green-600">
                  {current.sales}
                </p>
              </div>
              <div className="rounded-2xl bg-white/85 p-4 ring-1 ring-[var(--copilot-border)]">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  Gastos
                </p>
                <p className="mt-2 text-xl font-semibold tabular-nums text-red-500">
                  {current.expenses}
                </p>
              </div>
            </div>
            <div className="mt-6 rounded-2xl border border-dashed border-[var(--copilot-border)] bg-[rgba(255,255,255,0.5)] p-5">
              <p className="text-sm leading-relaxed text-[var(--copilot-ink)]">
                {current.narrative}
              </p>
            </div>
          </CopilotCard>

          <CopilotCard>
            <CopilotSectionTitle title="Comparativa rápida" />
            <ul className="space-y-3 text-sm text-[var(--copilot-ink-muted)]">
              {MOCK_SCENARIOS.map((s) => (
                <li
                  key={s.id}
                  className={`rounded-xl px-3 py-2 ${
                    s.id === active
                      ? "bg-[var(--copilot-accent-soft)] text-[var(--copilot-ink)]"
                      : ""
                  }`}
                >
                  <span className="font-semibold text-[var(--copilot-ink)]">
                    {s.label}:{" "}
                  </span>
                  <span className="text-[var(--copilot-ink-muted)]">caja </span>
                  <span className="font-medium text-[var(--copilot-ink)]">
                    {s.cash}
                  </span>
                  <span className="text-[var(--copilot-ink-muted)]"> · ventas </span>
                  <span className="font-semibold text-green-600">{s.sales}</span>
                  <span className="text-[var(--copilot-ink-muted)]"> · gastos </span>
                  <span className="font-semibold text-red-500">{s.expenses}</span>
                  .
                </li>
              ))}
            </ul>
          </CopilotCard>
        </div>
      </div>
    </div>
  );
}
