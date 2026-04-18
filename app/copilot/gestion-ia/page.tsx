"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { CopilotEmptyPanel } from "@/components/copilot/copilot-empty-panel";
import { CopilotRealInsightCard } from "@/components/copilot/copilot-real-insight-card";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotTraceMeta } from "@/components/copilot/copilot-trace-meta";
import {
  CopilotCard,
  CopilotGhostButton,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { COPILOT_EMPTY_COPY } from "@/lib/copilot-empty-state";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import {
  countInsightsByKind,
  type CopilotRealInsight,
} from "@/lib/copilot-real-insights";
import { traceFromRealInsightsBatch } from "@/lib/copilot-trace-meta";
import type { CopilotLlmBriefingOutput } from "@/lib/ai/briefing/types";

export default function CopilotGestionIaPage() {
  const [insights, setInsights] = useState<CopilotRealInsight[]>([]);
  const [insightsComputedAt, setInsightsComputedAt] = useState<string | null>(
    null
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [briefing, setBriefing] = useState<CopilotLlmBriefingOutput | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchInsights = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const res = await copilotApiFetch("/api/copilot/real-insights");
      const json = (await res.json()) as {
        insights?: CopilotRealInsight[];
        computedAt?: string;
        error?: string;
      };
      if (!mountedRef.current) return;
      if (!res.ok) {
        setLoadError(json.error ?? "No se pudieron calcular los insights.");
        setInsights([]);
        setInsightsComputedAt(null);
        return;
      }
      setInsights(json.insights ?? []);
      setInsightsComputedAt(json.computedAt ?? null);
    } catch {
      if (!mountedRef.current) return;
      setLoadError("Error de red al cargar insights.");
      setInsights([]);
      setInsightsComputedAt(null);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchInsights();
  }, [fetchInsights]);

  const kpi = useMemo(() => countInsightsByKind(insights), [insights]);

  const fetchLlmBriefing = useCallback(async () => {
    setBriefingError(null);
    setBriefingLoading(true);
    try {
      const res = await copilotApiFetch("/api/copilot/llm-briefing");
      const json = (await res.json()) as {
        briefing?: CopilotLlmBriefingOutput;
        error?: string;
      };
      if (!mountedRef.current) return;
      if (!res.ok) {
        setBriefing(null);
        setBriefingError(json.error ?? "No se pudo armar el briefing.");
        return;
      }
      setBriefing(json.briefing ?? null);
    } catch {
      if (!mountedRef.current) return;
      setBriefing(null);
      setBriefingError("Error de red al solicitar el briefing.");
    } finally {
      if (mountedRef.current) setBriefingLoading(false);
    }
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        surfaceId="copilot.gestion-ia"
        title="Acciones recomendadas hoy"
        description="Solo lecturas respaldadas por facturas, obligaciones fiscales y caja real del prototipo. Sin textos generados ni puntuaciones mock."
        right={
          <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(31,107,74,0.2)] bg-[var(--copilot-accent-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--copilot-accent)]">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Copiloto activo
          </span>
        }
      />

      <div className="flex-1 space-y-8 overflow-auto px-6 py-8">
        {loadError ? (
          <div
            role="alert"
            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          >
            {loadError}
          </div>
        ) : null}

        <section>
          <CopilotSectionTitle
            title="Resumen"
            subtitle="Cada número sale del mismo cálculo que ves en Clientes y Finanzas."
            action={
              <CopilotGhostButton
                type="button"
                onClick={() => void fetchInsights()}
                disabled={loading}
                className="inline-flex items-center gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Actualizar
              </CopilotGhostButton>
            }
          />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <CopilotCard className="flex flex-col gap-2 border-[rgba(31,107,74,0.12)] bg-gradient-to-br from-[var(--copilot-card)] to-white/95">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Insights activos
              </p>
              <p className="text-3xl font-semibold tabular-nums text-[var(--copilot-ink)]">
                {loading ? "…" : kpi.total}
              </p>
              <p className="text-xs text-[var(--copilot-ink-muted)]">
                Lecturas que cumplen reglas estrictas sobre datos cargados.
              </p>
            </CopilotCard>
            <CopilotCard className="flex flex-col gap-2 border-[rgba(31,107,74,0.12)] bg-gradient-to-br from-[var(--copilot-card)] to-white/95">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Clientes con deuda vencida
              </p>
              <p className="text-3xl font-semibold tabular-nums text-[var(--copilot-ink)]">
                {loading ? "…" : kpi.deudaVencida}
              </p>
              <p className="text-xs text-[var(--copilot-ink-muted)]">
                Cuentas con facturas vencidas y saldo en proto_invoices.
              </p>
            </CopilotCard>
            <CopilotCard className="flex flex-col gap-2 border-[rgba(31,107,74,0.12)] bg-gradient-to-br from-[var(--copilot-card)] to-white/95">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Obligaciones fiscales vencidas
              </p>
              <p className="text-3xl font-semibold tabular-nums text-[var(--copilot-ink)]">
                {loading ? "…" : kpi.fiscalVencida}
              </p>
              <p className="text-xs text-[var(--copilot-ink-muted)]">
                Filas abiertas en proto_tax_obligations con vencimiento pasado.
              </p>
            </CopilotCard>
            <CopilotCard className="flex flex-col gap-2 border-[rgba(31,107,74,0.12)] bg-gradient-to-br from-[var(--copilot-card)] to-white/95">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Alerta de caja
              </p>
              <p className="text-3xl font-semibold tabular-nums text-[var(--copilot-ink)]">
                {loading ? "…" : kpi.desbalanceCaja}
              </p>
              <p className="text-xs text-[var(--copilot-ink-muted)]">
                1 si el snapshot financiero muestra desbalance; 0 si no.
              </p>
            </CopilotCard>
          </div>
        </section>

        <section>
          <CopilotSectionTitle
            title="Briefing para LLM"
            subtitle="Contexto interno normalizado (sin datos crudos de proveedor). Sirve para copilotos o exportación controlada."
            action={
              <CopilotGhostButton
                type="button"
                onClick={() => void fetchLlmBriefing()}
                disabled={briefingLoading}
                className="inline-flex items-center gap-2"
              >
                {briefingLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                Generar briefing
              </CopilotGhostButton>
            }
          />
          {briefingError ? (
            <div
              role="alert"
              className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
            >
              {briefingError}
            </div>
          ) : null}
          {briefing ? (
            <div className="mt-4 space-y-3 rounded-2xl border border-[var(--copilot-border)] bg-white/80 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Cobertura:{" "}
                <span className="text-[var(--copilot-ink)]">
                  {briefing.coverage === "insufficient"
                    ? "Insuficiente"
                    : "Parcial"}
                </span>
              </p>
              <p className="text-sm leading-relaxed text-[var(--copilot-ink)]">{briefing.summary}</p>
              {briefing.missingData.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-[var(--copilot-ink-muted)]">Datos faltantes</p>
                  <ul className="mt-1 list-inside list-disc text-sm text-[var(--copilot-ink-muted)]">
                    {briefing.missingData.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-[var(--copilot-accent)]">
                  Ver JSON completo
                </summary>
                <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-[rgba(19,23,22,0.04)] p-3 text-xs leading-snug text-[var(--copilot-ink)]">
                  {JSON.stringify(briefing, null, 2)}
                </pre>
              </details>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[var(--copilot-ink-muted)]">
              Tocá «Generar briefing» para obtener el paquete estructurado listo para un LLM (solo después
              de autenticación y tenant resueltos en servidor).
            </p>
          )}
        </section>

        <section>
          <CopilotSectionTitle
            title="Insights"
            subtitle="Orden sugerido: caja global, deudas por monto, obligaciones vencidas, concentración y atraso histórico."
          />
          {!loading && insights.length > 0 ? (
            <div className="mb-3">
              <CopilotTraceMeta
                trace={traceFromRealInsightsBatch(insightsComputedAt)}
                variant="embed"
                dense
              />
            </div>
          ) : null}
          {loading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--copilot-border)] py-14 text-sm text-[var(--copilot-ink-muted)]">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              Calculando insights desde tus datos…
            </div>
          ) : insights.length === 0 ? (
            <CopilotEmptyPanel
              title={COPILOT_EMPTY_COPY.gestionIa.title}
              paragraphs={[
                "No hay condiciones que disparen los cinco tipos de insight con los datos actuales.",
                "Cargá facturas con vencimiento y saldo, obligaciones fiscales o movimientos de caja para ver alertas aquí.",
              ]}
              example={COPILOT_EMPTY_COPY.gestionIa.example}
              importance="Los umbrales son conservadores: si no hay evidencia suficiente, no mostramos tarjetas."
            />
          ) : (
            <div className="space-y-3">
              {insights.map((insight) => (
                <CopilotRealInsightCard key={insight.id} insight={insight} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
