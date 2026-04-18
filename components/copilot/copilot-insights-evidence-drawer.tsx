"use client";

import { useEffect, useMemo, useState } from "react";

import {
  COPILOT_INSIGHTS_EVIDENCE_MOCK,
  type CopilotInsightEvidenceCase,
} from "@/lib/copilot-insights-evidence-mock";
import { CopilotTraceMeta } from "@/components/copilot/copilot-trace-meta";
import { CopilotGhostButton, CopilotGhostLink } from "@/components/copilot/copilot-ui";
import { traceFromInsightEvidenceContext } from "@/lib/copilot-trace-meta";
import { CopilotSeverityBadge } from "@/components/copilot/copilot-severity-badge";

type DrawerTab = "resumen" | "patron" | "indicadores" | "senales" | "lectura";

const tabs: { id: DrawerTab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "patron", label: "Patrón" },
  { id: "indicadores", label: "Indicadores" },
  { id: "senales", label: "Señales" },
  { id: "lectura", label: "Lectura IA" },
];

export function CopilotInsightsEvidenceDrawer({
  insightId,
  evidenceOverride,
  isOpen,
  onClose,
}: {
  insightId: string | null;
  /** Si viene del Insight Engine, se usa en lugar del mock por id. */
  evidenceOverride?: CopilotInsightEvidenceCase | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<DrawerTab>("resumen");

  useEffect(() => {
    if (isOpen) setTab("resumen");
  }, [insightId, isOpen]);

  const data: CopilotInsightEvidenceCase | null = useMemo(() => {
    if (evidenceOverride) return evidenceOverride;
    if (!insightId) return null;
    return COPILOT_INSIGHTS_EVIDENCE_MOCK[insightId] ?? null;
  }, [evidenceOverride, insightId]);

  const tabCount = useMemo(() => {
    if (!data) return { indicadores: 0, senales: 0 };
    return {
      indicadores: data.originIndicators.length,
      senales: data.signals.length,
    };
  }, [data]);

  if (!isOpen || !data) return null;

  const traceVm = traceFromInsightEvidenceContext({
    fromEngine: Boolean(evidenceOverride),
    evidenceUpdatedAtLabel: data.updatedAt,
  });

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar respaldo de insight"
        onClick={onClose}
        className="fixed inset-0 z-30 bg-[rgba(19,23,22,0.28)]"
      />
      <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-2xl flex-col border-l border-[var(--copilot-border)] bg-[var(--copilot-card)] shadow-2xl">
        <div className="border-b border-[var(--copilot-border)] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <CopilotSeverityBadge severity={data.primarySeverity} />
                <span className="text-xs font-medium text-[var(--copilot-ink-muted)]">
                  Insight
                </span>
              </div>
              <h3 className="text-lg font-semibold text-[var(--copilot-ink)]">{data.title}</h3>
              <p className="text-sm text-[var(--copilot-ink-muted)]">{data.subtitle}</p>
              <CopilotTraceMeta trace={traceVm} variant="embed" dense className="!pt-2" />
            </div>
            <CopilotGhostButton onClick={onClose} className="px-3 py-1.5">
              Cerrar
            </CopilotGhostButton>
          </div>
        </div>

        <div className="border-b border-[var(--copilot-border)] px-4">
          <div className="flex flex-wrap gap-2 py-3">
            {tabs.map((item) => {
              const active = tab === item.id;
              const count =
                item.id === "indicadores"
                  ? tabCount.indicadores
                  : item.id === "senales"
                    ? tabCount.senales
                    : null;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)] ring-1 ring-[rgba(31,107,74,0.25)]"
                      : "bg-white/70 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-white"
                  }`}
                >
                  {item.label}
                  {count != null ? (
                    <span className="rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold text-[var(--copilot-ink)]">
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-auto px-6 py-5">
          {tab === "resumen" ? (
            <div className="space-y-4">
              <SectionBlock title="Explicación ejecutiva" content={data.summary.executive} />
              <SectionBlock title="Por qué es relevante" content={data.summary.relevance} />
              <SectionBlock title="Impacto esperado" content={data.summary.impact} />
            </div>
          ) : null}

          {tab === "patron" ? (
            <div className="space-y-4">
              <SectionBlock title="Qué patrón detectó el sistema" content={data.pattern.pattern} />
              <SectionBlock title="Evolución o comparación" content={data.pattern.evolution} />
            </div>
          ) : null}

          {tab === "indicadores" ? (
            <div className="space-y-3">
              {data.originIndicators.map((row) => (
                <div
                  key={row.id}
                  className="rounded-xl border border-[var(--copilot-border)] bg-white/70 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--copilot-ink)]">{row.label}</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--copilot-ink)]">
                        {row.value}
                      </p>
                    </div>
                    <CopilotSeverityBadge severity={row.severity} compact />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {tab === "senales" ? (
            <div className="space-y-3">
              {data.signals.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-[var(--copilot-border)] bg-white/70 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--copilot-ink)]">{item.label}</p>
                      <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">{item.detail}</p>
                    </div>
                    <CopilotSeverityBadge severity={item.severity} compact />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-[var(--copilot-ink-muted)]">
                    <span>Fecha: {item.date}</span>
                    {item.amount ? <span>Monto: {item.amount}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {tab === "lectura" ? (
            <div className="space-y-4">
              <SectionBlock title="Conclusión del sistema" content={data.aiRead.conclusion} />
              <SectionBlock title="Por qué lo clasifica así" content={data.aiRead.classification} />
              <SectionBlock title="Recomendación" content={data.aiRead.recommend} />
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-[var(--copilot-border)] px-6 py-4">
          <CopilotGhostLink href="/copilot/alertas">Ir a alertas</CopilotGhostLink>
          <CopilotGhostLink href="/copilot/finanzas">Ver finanzas relacionadas</CopilotGhostLink>
          <CopilotGhostButton onClick={onClose}>Cerrar</CopilotGhostButton>
        </div>
      </aside>
    </>
  );
}

function SectionBlock({ title, content }: { title: string; content: string }) {
  return (
    <section className="rounded-xl border border-[var(--copilot-border)] bg-white/70 p-4">
      <h4 className="text-sm font-semibold text-[var(--copilot-ink)]">{title}</h4>
      <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">{content}</p>
    </section>
  );
}
