"use client";

import { useMemo, useState } from "react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotCard, CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import { MOCK_ACTIONS } from "@/lib/copilot-mock-data";

type Tab = "today" | "week" | "priority";

export default function CopilotAccionesPage() {
  const [tab, setTab] = useState<Tab>("today");

  const list = useMemo(() => {
    if (tab === "today") return MOCK_ACTIONS.today;
    if (tab === "week") return MOCK_ACTIONS.week;
    return MOCK_ACTIONS.priority;
  }, [tab]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        title="Acciones"
        description="Lista práctica de qué hacer — con impacto, motivo y estado."
      />

      <div className="flex-1 space-y-8 overflow-auto px-6 py-8">
        <div className="flex flex-wrap gap-2 border-b border-[var(--copilot-border)] pb-1">
          {(
            [
              ["today", "Hoy"],
              ["week", "Esta semana"],
              ["priority", "Prioridad alta"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`relative -mb-px rounded-t-lg px-4 py-2.5 text-sm font-semibold transition ${
                tab === id
                  ? "text-[var(--copilot-ink)] after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:rounded-full after:bg-[var(--copilot-accent)]"
                  : "text-[var(--copilot-ink-muted)] hover:text-[var(--copilot-ink)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <CopilotCard>
          <CopilotSectionTitle
            title="Acciones recomendadas"
            subtitle="Orden sugerido por impacto en caja y riesgo."
          />
          <ul className="space-y-4">
            {list.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-3 rounded-2xl border border-[var(--copilot-border)] bg-white/85 p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--copilot-ink)]">
                    {item.title}
                  </p>
                  <p className="mt-2 text-sm text-[var(--copilot-ink-muted)]">
                    <span className="font-medium text-[var(--copilot-ink)]">Motivo: </span>
                    {item.reason}
                  </p>
                  <p className="mt-2 text-sm">
                    <span className="font-medium text-[var(--copilot-ink)]">Impacto: </span>
                    <span className="text-[var(--copilot-ink-muted)]">{item.impact}</span>
                  </p>
                </div>
                <div className="shrink-0">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                      item.status === "pendiente"
                        ? "bg-amber-100 text-amber-900"
                        : "bg-emerald-100 text-emerald-900"
                    }`}
                  >
                    {item.status === "pendiente" ? "Pendiente" : "En curso"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </CopilotCard>
      </div>
    </div>
  );
}
