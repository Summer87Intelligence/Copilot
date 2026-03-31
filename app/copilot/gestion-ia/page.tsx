"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  Brain,
  Clock,
  Cpu,
  Gavel,
  History,
  Layers,
  Loader2,
  Radio,
  Sliders,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";

import { OpportunitiesList } from "@/components/copilot/opportunities-list";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotReadingKey } from "@/components/copilot/copilot-reading-key";
import {
  CopilotBadge,
  CopilotCard,
  CopilotGhostButton,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import type { DecisionRow } from "@/lib/ai/decision-types";
import type { InitiativeRow } from "@/lib/ai/initiative-types";
import {
  MOCK_IA_ACTIVE_AGENTS,
  MOCK_IA_AUTOMATION_DEFAULTS,
  MOCK_IA_EXECUTION_HISTORY,
  MOCK_IA_INTERVENTION_OPTIONS,
  MOCK_IA_RULES,
  MOCK_IA_SYSTEM_SUMMARY,
  type MockIaInterventionLevel,
} from "@/lib/copilot-ai-mock";

function isSameLocalDay(iso: string): boolean {
  const a = new Date(iso);
  const b = new Date();
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const summaryCards = [
  {
    key: "status",
    label: "Estado del Copiloto",
    value: MOCK_IA_SYSTEM_SUMMARY.copilotStatus,
    icon: Activity,
    hint: "Operación nominal",
  },
  {
    key: "last",
    label: "Último análisis",
    value: MOCK_IA_SYSTEM_SUMMARY.lastAnalysis,
    icon: Clock,
    hint: "Pipeline sincronizado",
  },
  {
    key: "agents",
    label: "Agentes activos",
    value: String(MOCK_IA_SYSTEM_SUMMARY.activeAgents),
    icon: Bot,
    hint: "En ventana actual",
  },
  {
    key: "ritmo",
    label: "Ritmo de revisiones (demo)",
    value: String(MOCK_IA_SYSTEM_SUMMARY.decisionsToday),
    icon: Cpu,
    hint: "Referencia visual del módulo",
  },
] as const;

export default function CopilotGestionIaPage() {
  const [autoDaily, setAutoDaily] = useState<boolean>(
    MOCK_IA_AUTOMATION_DEFAULTS.dailyAnalysis
  );
  const [autoDecisions, setAutoDecisions] = useState<boolean>(
    MOCK_IA_AUTOMATION_DEFAULTS.autoDecisions
  );
  const [prioritizeImpact, setPrioritizeImpact] = useState<boolean>(
    MOCK_IA_AUTOMATION_DEFAULTS.prioritizeByImpact
  );
  const [intervention, setIntervention] = useState<MockIaInterventionLevel>(
    "recomendaciones_activas"
  );

  const [initiatives, setInitiatives] = useState<InitiativeRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [loadingDecisions, setLoadingDecisions] = useState(true);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [processingDecisions, setProcessingDecisions] = useState(false);
  const [lastDecisionResult, setLastDecisionResult] = useState<string | null>(
    null
  );

  const fetchDecisions = useCallback(async () => {
    setDecisionError(null);
    setLoadingDecisions(true);
    try {
      const res = await fetch("/api/copilot/decisions?limit=300");
      const json = (await res.json()) as {
        decisions?: DecisionRow[];
        error?: string;
      };
      if (!res.ok) {
        setDecisionError(json.error ?? "No se pudieron cargar las decisiones.");
        setDecisions([]);
        return;
      }
      setDecisions(json.decisions ?? []);
    } catch {
      setDecisionError("Error de red al cargar decisiones.");
      setDecisions([]);
    } finally {
      setLoadingDecisions(false);
    }
  }, []);

  const fetchInitiatives = useCallback(async () => {
    setLoadError(null);
    setLoadingList(true);
    try {
      const res = await fetch("/api/copilot/initiatives?limit=120");
      const json = (await res.json()) as {
        initiatives?: InitiativeRow[];
        error?: string;
      };
      if (!res.ok) {
        setLoadError(json.error ?? "No se pudieron cargar las iniciativas.");
        setInitiatives([]);
        return;
      }
      setInitiatives(json.initiatives ?? []);
    } catch {
      setLoadError("Error de red al cargar iniciativas.");
      setInitiatives([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void Promise.all([fetchInitiatives(), fetchDecisions()]);
  }, [fetchInitiatives, fetchDecisions]);

  const todayStats = useMemo(() => {
    const today = initiatives.filter((i) => isSameLocalDay(i.created_at));
    const count = today.length;
    const avg =
      count > 0
        ? today.reduce((s, i) => s + Number(i.score), 0) / count
        : null;
    const sources = new Set(today.map((i) => i.source)).size;
    return {
      count,
      avg,
      sources,
    };
  }, [initiatives]);

  const topOpportunities = useMemo(
    () => initiatives.slice(0, 10),
    [initiatives]
  );

  const decisionsTodayCount = useMemo(() => {
    return decisions.filter((d) => isSameLocalDay(d.created_at)).length;
  }, [decisions]);

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
      };
      if (!res.ok) {
        setActionError(json.error ?? "No se pudo generar el lote.");
        return;
      }
      const ins = json.inserted ?? 0;
      const om = json.omitted ?? 0;
      setLastResult(
        `Insertadas: ${ins}. Omitidas (duplicado hoy): ${om}.`
      );
      await fetchInitiatives();
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
      await Promise.all([fetchInitiatives(), fetchDecisions()]);
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
        description="Prototipo operativo — Supabase, Opportunity Engine y Decision Engine. La demo aislada está en /demo/gestion-ia."
        readingKey={
          <CopilotReadingKey
            lines={[
              "No estoy viendo datos sueltos.",
              "El sistema detecta prioridades.",
              "Esto me ayuda a enfocar.",
            ]}
          />
        }
        right={
          <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(31,107,74,0.2)] bg-[var(--copilot-accent-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--copilot-accent)]">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Cerebro operativo
          </span>
        }
      />

      <div className="flex-1 space-y-12 overflow-auto px-6 py-8">
        {(loadError || actionError || decisionError) && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          >
            {loadError ?? actionError ?? decisionError}
          </div>
        )}

        {/* Opportunity Engine */}
        <section>
          <CopilotSectionTitle
            title="Opportunity Engine"
            subtitle="Primer flujo vivo: generación mock persistida en Supabase — base para evolucionar el motor."
            action={
              <div className="flex flex-wrap items-center gap-2">
                <CopilotGhostButton
                  type="button"
                  onClick={() => void handleProcessDecisions()}
                  disabled={
                    processingDecisions || loadingList || loadingDecisions
                  }
                  className="inline-flex items-center gap-2"
                >
                  {processingDecisions ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  Procesar decisiones IA
                </CopilotGhostButton>
                <button
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={generating || loadingList}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--copilot-accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  Generar oportunidades
                </button>
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
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  Oportunidades generadas hoy
                </p>
                <TrendingUp className="h-4 w-4 text-[var(--copilot-accent)]" aria-hidden />
              </div>
              <p className="text-3xl font-semibold tabular-nums text-[var(--copilot-ink)]">
                {loadingList ? "…" : todayStats.count}
              </p>
              <p className="text-xs text-[var(--copilot-ink-muted)]">
                Conteo local del día (según hora de tu navegador)
              </p>
            </CopilotCard>
            <CopilotCard className="flex flex-col gap-2 border-[rgba(31,107,74,0.12)] bg-gradient-to-br from-[var(--copilot-card)] to-white/95">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  Prioridad promedio
                </p>
                <Target className="h-4 w-4 text-[var(--copilot-accent)]" aria-hidden />
              </div>
              <p className="text-3xl font-semibold tabular-nums text-[var(--copilot-ink)]">
                {loadingList
                  ? "…"
                  : todayStats.avg != null
                    ? todayStats.avg.toLocaleString("es-AR", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })
                    : "—"}
              </p>
              <p className="text-xs text-[var(--copilot-ink-muted)]">
                Promedio de score (hoy)
              </p>
            </CopilotCard>
            <CopilotCard className="flex flex-col gap-2 border-[rgba(31,107,74,0.12)] bg-gradient-to-br from-[var(--copilot-card)] to-white/95">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  Fuentes activas
                </p>
                <Layers className="h-4 w-4 text-[var(--copilot-accent)]" aria-hidden />
              </div>
              <p className="text-3xl font-semibold tabular-nums text-[var(--copilot-ink)]">
                {loadingList ? "…" : todayStats.sources}
              </p>
              <p className="text-xs text-[var(--copilot-ink-muted)]">
                Fuentes distintas (oportunidades de hoy)
              </p>
            </CopilotCard>
            <CopilotCard className="flex flex-col gap-2 border-[rgba(31,107,74,0.12)] bg-gradient-to-br from-[var(--copilot-card)] to-white/95">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  Decisiones generadas hoy
                </p>
                <Cpu className="h-4 w-4 text-[var(--copilot-accent)]" aria-hidden />
              </div>
              <p className="text-3xl font-semibold tabular-nums text-[var(--copilot-ink)]">
                {loadingDecisions ? "…" : decisionsTodayCount}
              </p>
              <p className="text-xs text-[var(--copilot-ink-muted)]">
                Desde tabla decisions (día local)
              </p>
            </CopilotCard>
          </div>

          <div className="mt-8">
            <CopilotSectionTitle
              title="Top oportunidades detectadas"
              subtitle="Orden: score descendente, luego más recientes (desde Supabase)."
            />
            {loadingList ? (
              <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--copilot-border)] py-14 text-sm text-[var(--copilot-ink-muted)]">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                Cargando…
              </div>
            ) : (
              <OpportunitiesList items={topOpportunities} />
            )}
          </div>
        </section>

        {/* Resumen sistema (mock UI) */}
        <section>
          <CopilotSectionTitle
            title="Resumen del sistema IA"
            subtitle="Indicadores de referencia del módulo (no ligados al motor de oportunidades)."
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((c) => {
              const Icon = c.icon;
              return (
                <CopilotCard
                  key={c.key}
                  className="flex flex-col gap-3 border-[rgba(31,107,74,0.12)] bg-gradient-to-br from-[var(--copilot-card)] to-white/90"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      {c.label}
                    </p>
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)]">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                  </div>
                  <p className="text-2xl font-semibold tracking-tight text-[var(--copilot-ink)]">
                    {c.value}
                  </p>
                  <p className="text-xs text-[var(--copilot-ink-muted)]">{c.hint}</p>
                </CopilotCard>
              );
            })}
          </div>
        </section>

        {/* Agentes activos */}
        <section>
          <CopilotSectionTitle
            title="Agentes activos"
            subtitle="Especialistas que ejecutan análisis y alimentan decisiones."
          />
          <div className="grid gap-4 lg:grid-cols-2">
            {MOCK_IA_ACTIVE_AGENTS.map((agent) => (
              <CopilotCard
                key={agent.id}
                className="flex flex-col gap-4 border-[var(--copilot-border)] bg-[var(--copilot-card)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(90,75,120,0.1)] text-[rgba(90,75,120,0.95)]">
                      <Brain className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                      <h3 className="text-base font-semibold text-[var(--copilot-ink)]">
                        {agent.name}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <CopilotBadge tone="success">{agent.status}</CopilotBadge>
                        <span className="text-xs text-[var(--copilot-ink-muted)]">
                          {agent.frequency}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--copilot-border)] bg-white/70 px-4 py-3 text-sm leading-relaxed text-[var(--copilot-ink)]">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                    Último insight
                  </span>
                  <p className="mt-2">{agent.lastInsight}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <CopilotGhostButton type="button">Ver análisis</CopilotGhostButton>
                  <CopilotGhostButton type="button">Configurar</CopilotGhostButton>
                </div>
              </CopilotCard>
            ))}
          </div>
        </section>

        {/* Reglas */}
        <section>
          <CopilotSectionTitle
            title="Reglas inteligentes"
            subtitle="Condiciones que disparan alertas, insights y acciones — gobierno del copiloto."
          />
          <div className="space-y-3">
            {MOCK_IA_RULES.map((rule) => (
              <CopilotCard
                key={rule.id}
                className="flex flex-col gap-3 border-[var(--copilot-border)] bg-white/80 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
              >
                <div className="flex min-w-0 flex-1 gap-3">
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgba(44,40,37,0.06)] text-[var(--copilot-ink)]">
                    <Gavel className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--copilot-ink)]">{rule.name}</p>
                    <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
                      <span className="font-medium text-[var(--copilot-ink)]/80">
                        Condición:{" "}
                      </span>
                      {rule.condition}
                    </p>
                    <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
                      <span className="font-medium text-[var(--copilot-ink)]/80">
                        Acción:{" "}
                      </span>
                      {rule.action}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 sm:pl-2">
                  <CopilotGhostButton type="button" className="w-full sm:w-auto">
                    Editar
                  </CopilotGhostButton>
                </div>
              </CopilotCard>
            ))}
          </div>
        </section>

        {/* Automatizaciones */}
        <section>
          <CopilotCard className="border-[rgba(31,107,74,0.12)] bg-gradient-to-br from-white/90 to-[#e8f2ec]/35">
            <CopilotSectionTitle
              title="Automatizaciones"
              subtitle="Preferencias de ejecución — mock; sin persistencia aún."
              action={
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-[rgba(44,40,37,0.06)] px-2.5 py-1 text-xs font-semibold text-[var(--copilot-ink-muted)]">
                  <Zap className="h-3.5 w-3.5" aria-hidden />
                  Simulado
                </span>
              }
            />
            <ul className="divide-y divide-[var(--copilot-border)] rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)]">
              <AutomationRow
                label="Ejecutar análisis automático diario"
                description="Snapshot financiero y lectura ejecutiva al inicio del día."
                checked={autoDaily}
                onChange={setAutoDaily}
              />
              <AutomationRow
                label="Generar decisiones automáticamente"
                description="Propone decisiones en cola; revisión humana recomendada."
                checked={autoDecisions}
                onChange={setAutoDecisions}
              />
              <AutomationRow
                label="Priorizar acciones por impacto"
                description="Ordena Acciones por efecto en caja y riesgo."
                checked={prioritizeImpact}
                onChange={setPrioritizeImpact}
              />
            </ul>
          </CopilotCard>
        </section>

        {/* Historial mock */}
        <section>
          <CopilotSectionTitle
            title="Historial de ejecución IA"
            subtitle="Actividad reciente del pipeline — sensación de sistema vivo."
          />
          <CopilotCard className="border-[var(--copilot-border)] bg-[var(--copilot-card)] p-0">
            <div className="flex items-center gap-2 border-b border-[var(--copilot-border)] px-5 py-4">
              <History className="h-4 w-4 text-[var(--copilot-accent)]" aria-hidden />
              <span className="text-sm font-semibold text-[var(--copilot-ink)]">
                Últimas ejecuciones
              </span>
            </div>
            <div className="relative px-5 py-2">
              <div
                className="absolute bottom-6 left-[2.125rem] top-6 w-px bg-[var(--copilot-border)]"
                aria-hidden
              />
              <ul className="relative space-y-0">
                {MOCK_IA_EXECUTION_HISTORY.map((entry, index) => (
                  <li
                    key={`${entry.time}-${index}`}
                    className="flex gap-4 py-4 pl-1"
                  >
                    <div className="relative z-[1] flex w-16 shrink-0 justify-center pt-0.5">
                      <span className="rounded-full bg-white px-2 py-0.5 font-mono text-xs font-semibold text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)]">
                        {entry.time}
                      </span>
                    </div>
                    <div className="relative z-[1] flex min-h-[2.5rem] flex-1 items-center">
                      <span className="absolute -left-3 top-1/2 z-[2] h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 border-white bg-[var(--copilot-accent)] shadow-sm" />
                      <p className="pl-4 text-sm leading-relaxed text-[var(--copilot-ink)]">
                        {entry.message}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </CopilotCard>
        </section>

        {/* Nivel de intervención — botón principal verde es solo “Generar oportunidades” arriba */}
        <section>
          <CopilotCard className="border-[rgba(31,107,74,0.15)] bg-white/85">
            <CopilotSectionTitle
              title="Nivel de intervención"
              subtitle="Cuánta autonomía tiene el copiloto al proponer y ordenar trabajo."
              action={
                <span className="inline-flex items-center gap-1.5 text-[var(--copilot-ink-muted)]">
                  <Radio className="h-4 w-4" aria-hidden />
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Política
                  </span>
                </span>
              }
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {MOCK_IA_INTERVENTION_OPTIONS.map((opt) => {
                const selected = intervention === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setIntervention(opt.id)}
                    className={`flex flex-col rounded-2xl border p-4 text-left transition ${
                      selected
                        ? "border-[rgba(31,107,74,0.45)] bg-[var(--copilot-accent-soft)] ring-1 ring-[rgba(31,107,74,0.2)]"
                        : "border-[var(--copilot-border)] bg-[var(--copilot-card)] hover:bg-white"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                          selected
                            ? "border-[var(--copilot-accent)] bg-[var(--copilot-accent)]"
                            : "border-[var(--copilot-border)] bg-white"
                        }`}
                      >
                        {selected ? (
                          <span className="h-2 w-2 rounded-full bg-white" />
                        ) : null}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-[var(--copilot-ink)]">
                          {opt.label}
                        </p>
                        <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
                          {opt.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[var(--copilot-border)] pt-6">
              <CopilotGhostButton type="button" className="inline-flex items-center gap-2">
                <Sliders className="h-4 w-4" aria-hidden />
                Aplicar nivel de intervención
              </CopilotGhostButton>
              <p className="text-xs text-[var(--copilot-ink-muted)]">
                El botón verde principal de esta pantalla es “Generar oportunidades”.
              </p>
            </div>
          </CopilotCard>
        </section>
      </div>
    </div>
  );
}

function AutomationRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--copilot-ink)]">{label}</p>
        <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-9 w-16 shrink-0 rounded-full transition ${
          checked ? "bg-[var(--copilot-accent)]" : "bg-[rgba(44,40,37,0.15)]"
        }`}
      >
        <span
          className={`absolute top-1 h-7 w-7 rounded-full bg-white shadow transition ${
            checked ? "left-8" : "left-1"
          }`}
        />
      </button>
    </li>
  );
}
