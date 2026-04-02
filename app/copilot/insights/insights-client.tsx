"use client";

import { useMemo, useState } from "react";

import { CopilotInteractiveText } from "@/components/copilot/copilot-interactive-text";
import { CopilotInsightsEvidenceDrawer } from "@/components/copilot/copilot-insights-evidence-drawer";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotEmptyPanel } from "@/components/copilot/copilot-empty-panel";
import {
  CopilotCard,
  CopilotBadge,
  CopilotGhostButton,
} from "@/components/copilot/copilot-ui";
import { COPILOT_EMPTY_COPY } from "@/lib/copilot-empty-state";
import type { CopilotInsightItem } from "@/lib/copilot-insight-engine";

export function CopilotInsightsClient({ insights }: { insights: CopilotInsightItem[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);

  const selectedEvidence = useMemo(() => {
    if (!selectedId) return null;
    return insights.find((i) => i.id === selectedId)?.evidence ?? null;
  }, [insights, selectedId]);

  const openEvidence = (id: string) => {
    setSelectedId(id);
    setIsEvidenceOpen(true);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        title="Insights"
        description="Historial del razonamiento del copiloto — transparente, trazable y priorizado."
      />

      <div className="flex-1 overflow-auto px-6 py-8">
        {insights.length === 0 ? (
          <div className="mx-auto max-w-3xl">
            <CopilotEmptyPanel
              title={COPILOT_EMPTY_COPY.insights.title}
              paragraphs={COPILOT_EMPTY_COPY.insights.paragraphs}
              example={COPILOT_EMPTY_COPY.insights.example}
              importance="Si la base está vacía, un timeline vacío es preferible a insights genéricos que parezcan análisis reales."
            />
          </div>
        ) : (
          <div className="relative mx-auto max-w-3xl">
            <div
              className="absolute bottom-0 left-[15px] top-8 w-px bg-[var(--copilot-border)]"
              aria-hidden
            />
            <ul className="space-y-6">
              {insights.map((item) => {
                const evidenceActive = isEvidenceOpen && selectedId === item.id;
                return (
                  <li key={item.id} className="relative flex gap-5 pl-2">
                    <div className="relative z-[1] mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white ring-2 ring-[var(--copilot-border)]">
                      <span className="h-2.5 w-2.5 rounded-full bg-[var(--copilot-accent)]" />
                    </div>
                    <CopilotCard
                      className={`flex-1 ${
                        evidenceActive
                          ? "ring-2 ring-[rgba(31,107,74,0.22)]"
                          : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <CopilotBadge
                          tone={
                            item.priority === "Alta"
                              ? "warning"
                              : item.priority === "Media"
                                ? "neutral"
                                : "success"
                          }
                        >
                          Prioridad {item.priority}
                        </CopilotBadge>
                        <CopilotBadge tone="neutral">{item.category}</CopilotBadge>
                        <span className="text-xs text-[var(--copilot-ink-muted)]">
                          {item.date}
                        </span>
                        {evidenceActive ? (
                          <span className="rounded-full bg-[var(--copilot-accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--copilot-accent)]">
                            Respaldo abierto
                          </span>
                        ) : null}
                      </div>
                      <h2 className="mt-3 text-base font-semibold leading-snug">
                        <CopilotInteractiveText
                          icon="panel"
                          layout="block"
                          className="!font-semibold text-base leading-snug"
                          onClick={() => openEvidence(item.id)}
                        >
                          {item.title}
                        </CopilotInteractiveText>
                      </h2>
                      <p className="mt-3 text-sm text-[var(--copilot-ink-muted)]">
                        Estado:{" "}
                        <span className="font-medium text-[var(--copilot-ink)]">
                          {item.status}
                        </span>
                      </p>
                      <div className="mt-4">
                        <CopilotGhostButton
                          className="w-full justify-center sm:w-auto"
                          onClick={() => openEvidence(item.id)}
                        >
                          Ver respaldo
                        </CopilotGhostButton>
                      </div>
                    </CopilotCard>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <CopilotInsightsEvidenceDrawer
        insightId={selectedId}
        evidenceOverride={selectedEvidence}
        isOpen={isEvidenceOpen && selectedId != null}
        onClose={() => setIsEvidenceOpen(false)}
      />
    </div>
  );
}
