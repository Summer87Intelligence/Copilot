"use client";

import { useMemo, useState } from "react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotReadingKey } from "@/components/copilot/copilot-reading-key";
import {
  CopilotBadge,
  CopilotCard,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { MOCK_ALERTS, MOCK_ALERTS_SUMMARY } from "@/lib/copilot-mock-data";

type PriorityFilter = "all" | "critical" | "high" | "medium";
type TypeFilter = "all" | (typeof MOCK_ALERTS)[number]["type"];

const priorityLabel: Record<Exclude<PriorityFilter, "all">, string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Media",
};

export default function CopilotAlertasPage() {
  const [priority, setPriority] = useState<PriorityFilter>("all");
  const [type, setType] = useState<TypeFilter>("all");
  const [selectedId, setSelectedId] = useState(MOCK_ALERTS[0]?.id ?? "");

  const filtered = useMemo(() => {
    return MOCK_ALERTS.filter((a) => {
      if (priority !== "all" && a.priority !== priority) return false;
      if (type !== "all" && a.type !== type) return false;
      return true;
    });
  }, [priority, type]);

  /** ID efectivo en la lista filtrada: selección del usuario si sigue visible; si no, la primera fila. */
  const effectiveSelectedId = useMemo(() => {
    if (filtered.length === 0) return null;
    if (filtered.some((a) => a.id === selectedId)) return selectedId;
    return filtered[0].id;
  }, [filtered, selectedId]);

  const selectedAlert = useMemo(() => {
    if (effectiveSelectedId == null) return null;
    return filtered.find((a) => a.id === effectiveSelectedId) ?? null;
  }, [filtered, effectiveSelectedId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        title="Alertas"
        description="Riesgos y desvíos detectados — priorizados para que sepas dónde mirar primero."
        readingKey={
          <CopilotReadingKey
            lines={[
              "Veo qué requiere atención ya.",
              "Entiendo el nivel de riesgo.",
              "Sé qué conviene revisar primero.",
            ]}
          />
        }
      />

      <div className="flex-1 space-y-8 overflow-auto px-6 py-8">
        <div className="grid gap-4 sm:grid-cols-3">
          <CopilotCard className="border-rose-200/80 bg-rose-50/50">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-900/80">
              Críticas
            </p>
            <p className="mt-2 text-3xl font-semibold text-rose-950">
              {MOCK_ALERTS_SUMMARY.critical}
            </p>
            <p className="mt-1 text-sm text-rose-900/70">Requieren acción inmediata</p>
          </CopilotCard>
          <CopilotCard className="border-amber-200/80 bg-amber-50/50">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-900/80">
              Altas
            </p>
            <p className="mt-2 text-3xl font-semibold text-amber-950">
              {MOCK_ALERTS_SUMMARY.high}
            </p>
            <p className="mt-1 text-sm text-amber-900/70">Seguimiento esta semana</p>
          </CopilotCard>
          <CopilotCard>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Medias
            </p>
            <p className="mt-2 text-3xl font-semibold text-[var(--copilot-ink)]">
              {MOCK_ALERTS_SUMMARY.medium}
            </p>
            <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
              Monitoreo habitual
            </p>
          </CopilotCard>
        </div>

        <CopilotCard>
          <CopilotSectionTitle
            title="Filtros"
            subtitle="Refiná la lista sin perder el contexto."
          />
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-wrap gap-2">
              <span className="self-center text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Prioridad
              </span>
              {(
                [
                  ["all", "Todas"],
                  ["critical", "Crítica"],
                  ["high", "Alta"],
                  ["medium", "Media"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPriority(id)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    priority === id
                      ? "bg-[var(--copilot-ink)] text-white"
                      : "bg-white/80 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="hidden h-8 w-px bg-[var(--copilot-border)] sm:block" />
            <div className="flex flex-wrap gap-2">
              <span className="self-center text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Tipo
              </span>
              {(
                [
                  ["all", "Todos"],
                  ["liquidez", "Liquidez"],
                  ["cobranza", "Cobranza"],
                  ["gastos", "Gastos"],
                  ["riesgo", "Riesgo"],
                  ["ventas", "Ventas"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setType(id)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    type === id
                      ? "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)] ring-1 ring-[rgba(31,107,74,0.25)]"
                      : "bg-white/80 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </CopilotCard>

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-2">
            {filtered.map((a) => {
              const active = a.id === effectiveSelectedId;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    active
                      ? "border-[rgba(31,107,74,0.35)] bg-white shadow-[var(--copilot-shadow)] ring-1 ring-[rgba(31,107,74,0.12)]"
                      : "border-[var(--copilot-border)] bg-[var(--copilot-card)] hover:bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <CopilotBadge
                      tone={
                        a.priority === "critical"
                          ? "danger"
                          : a.priority === "high"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {priorityLabel[a.priority]}
                    </CopilotBadge>
                    <span className="text-xs font-medium capitalize text-[var(--copilot-ink-muted)]">
                      {a.type}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-[var(--copilot-ink)]">
                    {a.title}
                  </p>
                  <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
                    {a.summary}
                  </p>
                </button>
              );
            })}
            {filtered.length === 0 ? (
              <p className="text-sm text-[var(--copilot-ink-muted)]">
                No hay alertas con estos filtros.
              </p>
            ) : null}
          </div>

          <CopilotCard className="lg:col-span-3">
            <CopilotSectionTitle
              title="Detalle"
              subtitle="Contexto y lectura recomendada."
            />
            {selectedAlert ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <CopilotBadge
                    tone={
                      selectedAlert.priority === "critical"
                        ? "danger"
                        : selectedAlert.priority === "high"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {priorityLabel[selectedAlert.priority]}
                  </CopilotBadge>
                  <CopilotBadge tone="neutral">{selectedAlert.type}</CopilotBadge>
                </div>
                <h3 className="text-lg font-semibold text-[var(--copilot-ink)]">
                  {selectedAlert.title}
                </h3>
                <p className="text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
                  {selectedAlert.detail}
                </p>
                <div className="rounded-xl border border-dashed border-[var(--copilot-border)] bg-white/60 p-4 text-sm text-[var(--copilot-ink)]">
                  <p className="font-semibold">Próximo paso sugerido</p>
                  <p className="mt-2 text-[var(--copilot-ink-muted)]">
                    Asignar responsable y fecha de seguimiento en la vista Acciones.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--copilot-border)] bg-white/50 px-4 py-8 text-center">
                <p className="text-base font-semibold text-[var(--copilot-ink)]">
                  Sin alerta seleccionada
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
                  No hay alertas para los filtros actuales. Ajustá prioridad o tipo para
                  ver detalle.
                </p>
              </div>
            )}
          </CopilotCard>
        </div>
      </div>
    </div>
  );
}
