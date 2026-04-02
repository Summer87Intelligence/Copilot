"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Sparkles,
  Workflow,
} from "lucide-react";

import { CopilotEmptyPanel } from "@/components/copilot/copilot-empty-panel";
import { CopilotInitiativeFlowCard } from "@/components/copilot/copilot-initiative-flow-card";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import {
  CopilotCard,
  CopilotGhostButton,
  CopilotPrimaryButton,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import type {
  InitiativeFlowItem,
  InitiativeFlowStatus,
} from "@/lib/ai/initiative-flow-types";
import { COPILOT_EMPTY_COPY } from "@/lib/copilot-empty-state";

export default function CopilotGestionIaPage() {
  const [items, setItems] = useState<InitiativeFlowItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingFlow, setLoadingFlow] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [processingDecisions, setProcessingDecisions] = useState(false);
  const [lastDecisionResult, setLastDecisionResult] = useState<string | null>(
    null
  );

  const fetchFlow = useCallback(async () => {
    setLoadError(null);
    setLoadingFlow(true);
    try {
      const res = await fetch("/api/copilot/initiatives/flow?limit=120");
      const json = (await res.json()) as {
        items?: InitiativeFlowItem[];
        error?: string;
      };
      if (!res.ok) {
        setLoadError(json.error ?? "No se pudo cargar el flujo operativo.");
        setItems([]);
        return;
      }
      setItems(json.items ?? []);
    } catch {
      setLoadError("Error de red al cargar trazabilidad operativa.");
      setItems([]);
    } finally {
      setLoadingFlow(false);
    }
  }, []);

  useEffect(() => {
    void fetchFlow();
  }, [fetchFlow]);

  const counters = useMemo(() => {
    const byStatus = items.reduce<Record<InitiativeFlowStatus, number>>(
      (acc, item) => {
        acc[item.flow_status] += 1;
        return acc;
      },
      {
        new: 0,
        decision_generated: 0,
        action_pending: 0,
        executed: 0,
        with_outcome: 0,
        closed_no_response: 0,
      }
    );
    return {
      newOpportunities: byStatus.new,
      decisionsGenerated:
        byStatus.decision_generated +
        byStatus.action_pending +
        byStatus.executed +
        byStatus.with_outcome +
        byStatus.closed_no_response,
      pendingAction: byStatus.action_pending,
      withOutcome: byStatus.with_outcome + byStatus.closed_no_response,
    };
  }, [items]);

  const handleGenerate = async () => {
    setActionError(null);
    setLastResult(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/copilot/initiatives/generate", {
        method: "POST",
      });
      const json = (await res.json()) as {
        inserted?: number;
        omitted?: number;
        error?: string;
        dedupe_date?: string;
        timezone?: string;
      };
      if (!res.ok) {
        setActionError(json.error ?? "No se pudo generar el lote.");
        return;
      }
      const ins = json.inserted ?? 0;
      const om = json.omitted ?? 0;
      const day = json.dedupe_date ?? "hoy";
      if (ins === 0 && om > 0) {
        setLastResult(
          `No se insertó ninguna fila nueva: las ${om} oportunidades candidatas ya existían para el ${day} (misma empresa, fuente y disparador).`
        );
      } else if (ins > 0 && om > 0) {
        setLastResult(
          `Insertadas: ${ins}. Omitidas (ya existían hoy, ${day}): ${om}.`
        );
      } else if (ins > 0) {
        setLastResult(`Insertadas: ${ins} oportunidades nuevas (día ${day}).`);
      } else {
        setLastResult(
          `Sin cambios: no había candidatas en el lote (insertadas: 0, omitidas: 0).`
        );
      }
      await fetchFlow();
    } catch {
      setActionError("Error de red al generar oportunidades.");
    } finally {
      setGenerating(false);
    }
  };

  const handleProcessDecisions = async () => {
    setActionError(null);
    setDecisionError(null);
    setLastDecisionResult(null);
    setProcessingDecisions(true);
    try {
      const res = await fetch("/api/copilot/decisions/generate", {
        method: "POST",
      });
      const json = (await res.json()) as {
        processed?: number;
        decisionsCreated?: number;
        error?: string;
        warning?: string;
      };
      if (!res.ok) {
        setDecisionError(json.error ?? "No se pudieron generar decisiones.");
        return;
      }
      const p = json.processed ?? 0;
      const c = json.decisionsCreated ?? 0;
      setLastDecisionResult(
        `Iniciativas procesadas: ${p}. Decisiones creadas: ${c}.`
      );
      if (json.warning) {
        setDecisionError(json.warning);
      }
      await fetchFlow();
    } catch {
      setDecisionError("Error de red al procesar decisiones.");
    } finally {
      setProcessingDecisions(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        title="Gestión IA"
        description="Centro operativo del copiloto: trazabilidad completa initiative → decision → action → outcome."
        right={
          <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(31,107,74,0.2)] bg-[var(--copilot-accent-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--copilot-accent)]">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Cerebro operativo
          </span>
        }
      />

      <div className="flex-1 space-y-8 overflow-auto px-6 py-8">
        {(loadError || actionError || decisionError) && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          >
            {loadError ?? actionError ?? decisionError}
          </div>
        )}

        <section>
          <CopilotSectionTitle
            title="Centro operativo IA"
            subtitle="Seguimiento vivo de cada iniciativa desde su origen hasta el resultado."
            action={
              <div className="flex flex-wrap items-center gap-2">
                <CopilotGhostButton
                  type="button"
                  onClick={() => void handleProcessDecisions()}
                  disabled={processingDecisions || loadingFlow}
                  className="inline-flex items-center gap-2"
                >
                  {processingDecisions ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  Procesar decisiones IA
                </CopilotGhostButton>
                <CopilotGhostButton
                  type="button"
                  onClick={() => void fetchFlow()}
                  disabled={loadingFlow}
                  className="inline-flex items-center gap-2"
                >
                  {loadingFlow ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Workflow className="h-4 w-4" aria-hidden />
                  )}
                  Actualizar flujo
                </CopilotGhostButton>
                <CopilotPrimaryButton
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={generating || loadingFlow}
                  className="inline-flex items-center gap-2"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  Generar oportunidades
                </CopilotPrimaryButton>
              </div>
            }
          />
          {(lastResult || lastDecisionResult) ? (
            <div className="mb-4 space-y-1">
              {lastResult ? (
                <p className="text-sm text-[var(--copilot-ink-muted)]">{lastResult}</p>
              ) : null}
              {lastDecisionResult ? (
                <p className="text-sm text-[var(--copilot-ink-muted)]">
                  {lastDecisionResult}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <CopilotCard className="flex flex-col gap-2 border-[rgba(31,107,74,0.12)] bg-gradient-to-br from-[var(--copilot-card)] to-white/95">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Oportunidades nuevas
              </p>
              <p className="text-3xl font-semibold tabular-nums text-[var(--copilot-ink)]">
                {loadingFlow ? "…" : counters.newOpportunities}
              </p>
              <p className="text-xs text-[var(--copilot-ink-muted)]">
                Iniciativas aún sin decisión asociada
              </p>
            </CopilotCard>
            <CopilotCard className="flex flex-col gap-2 border-[rgba(31,107,74,0.12)] bg-gradient-to-br from-[var(--copilot-card)] to-white/95">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Decisiones generadas
              </p>
              <p className="text-3xl font-semibold tabular-nums text-[var(--copilot-ink)]">
                {loadingFlow ? "…" : counters.decisionsGenerated}
              </p>
              <p className="text-xs text-[var(--copilot-ink-muted)]">
                Iniciativas que ya avanzaron a decisión o más
              </p>
            </CopilotCard>
            <CopilotCard className="flex flex-col gap-2 border-[rgba(31,107,74,0.12)] bg-gradient-to-br from-[var(--copilot-card)] to-white/95">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Pendientes de acción
              </p>
              <p className="text-3xl font-semibold tabular-nums text-[var(--copilot-ink)]">
                {loadingFlow ? "…" : counters.pendingAction}
              </p>
              <p className="text-xs text-[var(--copilot-ink-muted)]">
                Ya decididas, esperando ejecución
              </p>
            </CopilotCard>
            <CopilotCard className="flex flex-col gap-2 border-[rgba(31,107,74,0.12)] bg-gradient-to-br from-[var(--copilot-card)] to-white/95">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Con resultado
              </p>
              <p className="text-3xl font-semibold tabular-nums text-[var(--copilot-ink)]">
                {loadingFlow ? "…" : counters.withOutcome}
              </p>
              <p className="text-xs text-[var(--copilot-ink-muted)]">
                Incluye outcomes positivos y sin respuesta
              </p>
            </CopilotCard>
          </div>
          {!loadingFlow && items.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-[var(--copilot-border)] bg-white/50 px-4 py-3 text-sm text-[var(--copilot-ink-muted)]">
              Los contadores reflejan solo filas reales en el flujo. Con cero iniciativas
              no hay pipeline “en marcha”: es el estado esperado hasta que generés
              oportunidades o cargues datos que alimenten al motor.
            </p>
          ) : null}
        </section>

        <section>
          <CopilotSectionTitle
            title="Trazabilidad por iniciativa"
            subtitle="Vista ejecutiva del flujo completo: iniciativa, decisión, acción y outcome."
          />
          {loadingFlow ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--copilot-border)] py-14 text-sm text-[var(--copilot-ink-muted)]">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              Cargando pipeline…
            </div>
          ) : items.length === 0 ? (
            <CopilotEmptyPanel
              title={COPILOT_EMPTY_COPY.gestionIa.title}
              paragraphs={COPILOT_EMPTY_COPY.gestionIa.paragraphs}
              example={COPILOT_EMPTY_COPY.gestionIa.example}
              importance="Los botones de arriba siguen disponibles, pero no simulan progreso: sin filas nuevas, el flujo permanece vacío."
            />
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <CopilotInitiativeFlowCard key={item.initiative.id} item={item} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
