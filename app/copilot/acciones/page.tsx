"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { CopilotActionsEvidenceDrawer } from "@/components/copilot/copilot-actions-evidence-drawer";
import { CopilotOperationalActionsPanel } from "@/components/copilot/copilot-operational-actions-panel";
import { CopilotOperationalEmptyState } from "@/components/copilot/copilot-operational-empty-state";
import { CopilotSkeletonKpiRow } from "@/components/copilot/copilot-loading-skeleton";
import { CopilotTraceMeta } from "@/components/copilot/copilot-trace-meta";
import { CopilotInteractiveText } from "@/components/copilot/copilot-interactive-text";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import {
  CopilotBadge,
  CopilotCard,
  CopilotGhostButton,
  CopilotGhostLink,
  CopilotPrimaryButton,
  CopilotSectionTitle,
  copilotPageMainClass,
} from "@/components/copilot/copilot-ui";
import type { ActionListItem } from "@/lib/ai/action-types";
import {
  mapActionChannel,
  mapActionTypeLabel,
  mapExecutionStatus,
  mapOutcomeTypeLabelEs,
} from "@/lib/copilot-format";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import {
  formatActionProvenanceLabel,
  parseCopilotActionProvenance,
  provenanceBadgeTone,
} from "@/lib/copilot-alert-ops-mapper";
import { traceFromActionRow } from "@/lib/copilot-trace-meta";
import type { OutcomeTypeValue } from "@/lib/ai/outcome-types";

function statusTone(
  status: string
): "neutral" | "warning" | "danger" | "success" {
  const s = status.toLowerCase();
  if (s === "pending") return "neutral";
  if (s === "executed") return "success";
  if (s === "failed") return "danger";
  return "neutral";
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

const quickBtnClass =
  "rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm";

export default function CopilotAccionesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-20 text-sm text-[var(--copilot-ink-muted)]">
          Cargando acciones…
        </div>
      }
    >
      <CopilotAccionesPageContent />
    </Suspense>
  );
}

function CopilotAccionesPageContent() {
  const searchParams = useSearchParams();
  const provenance = useMemo(
    () => parseCopilotActionProvenance(searchParams),
    [searchParams]
  );
  const provenanceLabel = useMemo(
    () => formatActionProvenanceLabel(provenance),
    [provenance]
  );
  const provenanceSourceLabel =
    provenance.source === "alert"
      ? "Alerta"
      : provenance.source === "insight"
        ? "Insight"
        : provenance.source === "recommendation"
          ? "Recomendación"
          : null;

  const [actions, setActions] = useState<ActionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [submittingActionId, setSubmittingActionId] = useState<string | null>(
    null
  );
  const [saleExpandId, setSaleExpandId] = useState<string | null>(null);
  const [saleAmount, setSaleAmount] = useState("");
  const [evidenceAction, setEvidenceAction] = useState<ActionListItem | null>(
    null
  );
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
  const [loopDrafts, setLoopDrafts] = useState<
    Record<string, { assignee: string; expected: string; before: string }>
  >({});
  const [outcomeDrafts, setOutcomeDrafts] = useState<
    Record<string, { notes: string; after: string }>
  >({});
  const [savingLoopId, setSavingLoopId] = useState<string | null>(null);

  const fetchActions = useCallback(async (opts?: { soft?: boolean }) => {
    setError(null);
    if (!opts?.soft) setLoading(true);
    try {
      const res = await copilotApiFetch("/api/copilot/actions?limit=120");
      const json = (await res.json()) as {
        actions?: ActionListItem[];
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? "No se pudieron cargar las acciones.");
        setActions([]);
        return;
      }
      setActions(json.actions ?? []);
    } catch {
      setError("Error de red al cargar acciones.");
      setActions([]);
    } finally {
      if (!opts?.soft) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchActions();
  }, [fetchActions]);

  useEffect(() => {
    setLoopDrafts((prev) => {
      const next = { ...prev };
      for (const a of actions) {
        next[a.id] = {
          assignee: a.assignee_name ?? "",
          expected: a.expected_result ?? "",
          before: a.before_note ?? "",
        };
      }
      return next;
    });
    setOutcomeDrafts((prev) => {
      const next = { ...prev };
      for (const a of actions) {
        if (!next[a.id]) next[a.id] = { notes: "", after: "" };
      }
      for (const k of Object.keys(next)) {
        if (!actions.some((a) => a.id === k)) delete next[k];
      }
      return next;
    });
  }, [actions]);

  useEffect(() => {
    setEvidenceAction((prev) => {
      if (!prev) return prev;
      const next = actions.find((x) => x.id === prev.id);
      return next ?? prev;
    });
  }, [actions]);

  const handleGenerate = async () => {
    setError(null);
    setLastResult(null);
    setGenerating(true);
    try {
      const res = await copilotApiFetch("/api/copilot/actions/generate", {
        method: "POST",
      });
      const json = (await res.json()) as {
        processed?: number;
        actionsCreated?: number;
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? "No se pudieron generar acciones.");
        return;
      }
      const p = json.processed ?? 0;
      const c = json.actionsCreated ?? 0;
      setLastResult(`Procesadas: ${p}. Acciones creadas: ${c}.`);
      await fetchActions();
    } catch {
      setError("Error de red al generar acciones.");
    } finally {
      setGenerating(false);
    }
  };

  const saveActionLoop = async (a: ActionListItem) => {
    const d = loopDrafts[a.id];
    if (!d) return;
    setError(null);
    setSavingLoopId(a.id);
    try {
      const res = await copilotApiFetch(`/api/copilot/actions/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignee_name: d.assignee.trim() === "" ? null : d.assignee.trim(),
          expected_result: d.expected.trim() === "" ? null : d.expected.trim(),
          before_note: d.before.trim() === "" ? null : d.before.trim(),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "No se pudo guardar el seguimiento.");
        return;
      }
      await fetchActions({ soft: true });
    } catch {
      setError("Error de red al guardar seguimiento.");
    } finally {
      setSavingLoopId(null);
    }
  };

  const submitOutcome = async (
    a: ActionListItem,
    outcomeType: OutcomeTypeValue,
    revenueAmount?: number | null
  ) => {
    setError(null);
    setSubmittingActionId(a.id);
    const draft = outcomeDrafts[a.id] ?? { notes: "", after: "" };
    try {
      const res = await copilotApiFetch("/api/copilot/outcomes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action_id: a.id,
          initiative_id: a.initiative_id,
          outcome_type: outcomeType,
          revenue_amount:
            outcomeType === "sale"
              ? revenueAmount ?? 0
              : null,
          notes: draft.notes.trim() === "" ? null : draft.notes.trim(),
          after_note: draft.after.trim() === "" ? null : draft.after.trim(),
        }),
      });
      const json = (await res.json()) as { error?: string; outcome?: unknown };
      if (!res.ok) {
        setError(json.error ?? "No se pudo registrar el resultado.");
        return;
      }
      setSaleExpandId(null);
      setSaleAmount("");
      setOutcomeDrafts((p) => ({ ...p, [a.id]: { notes: "", after: "" } }));
      await fetchActions({ soft: true });
    } catch {
      setError("Error de red al registrar resultado.");
    } finally {
      setSubmittingActionId(null);
    }
  };

  const onQuickClick = (a: ActionListItem, kind: OutcomeTypeValue) => {
    if (kind === "sale") {
      if (saleExpandId === a.id) {
        setSaleExpandId(null);
        setSaleAmount("");
        return;
      }
      setSaleExpandId(a.id);
      setSaleAmount("");
      return;
    }
    void submitOutcome(a, kind);
  };

  const onConfirmSale = (a: ActionListItem) => {
    const raw = saleAmount.replace(",", ".").trim();
    const n = parseFloat(raw);
    const amount = Number.isFinite(n) ? n : 0;
    void submitOutcome(a, "sale", amount);
  };

  const actionMetrics = useMemo(() => {
    const pending = actions.filter(
      (action) => action.execution_status.toLowerCase() === "pending"
    ).length;
    const tracking = actions.filter(
      (action) =>
        Boolean(action.assignee_name?.trim()) || Boolean(action.expected_result?.trim())
    ).length;
    const today = new Date().toDateString();
    const resolvedToday = actions.filter((action) => {
      if (action.execution_status.toLowerCase() !== "executed") return false;
      try {
        return new Date(action.updated_at).toDateString() === today;
      } catch {
        return false;
      }
    }).length;
    return { pending, tracking, resolvedToday, total: actions.length };
  }, [actions]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        surfaceId="copilot.acciones"
        title="Acciones"
        description="Cola operativa persistida y acciones del motor de decisiones con seguimiento y cierre."
        right={
          <CopilotPrimaryButton
            type="button"
            onClick={() => void handleGenerate()}
            disabled={generating || loading}
            className="inline-flex items-center gap-2"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            Generar acciones
          </CopilotPrimaryButton>
        }
      />

      <div className={copilotPageMainClass}>
        {provenanceLabel ? (
          <CopilotCard className="border-[var(--copilot-border)] bg-white/85">
            <div className="flex flex-wrap items-start gap-3">
              {provenanceSourceLabel ? (
                <CopilotBadge tone={provenanceBadgeTone(provenance.priority)}>
                  {provenanceSourceLabel}
                </CopilotBadge>
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--copilot-ink)]">
                  {provenanceLabel}
                </p>
                {provenance.obligationId ? (
                  <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
                    Obligación asociada: {provenance.obligationId}
                  </p>
                ) : null}
              </div>
            </div>
          </CopilotCard>
        ) : null}
        {error ? (
          <div
            role="alert"
            className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          >
            {error}
          </div>
        ) : null}
        {lastResult ? (
          <p className="text-sm text-[var(--copilot-ink-muted)]">{lastResult}</p>
        ) : null}

        <CopilotOperationalActionsPanel
          provenance={provenance}
          highlightActionId={provenance.operationalActionId}
          onError={setError}
        />

        <CopilotCard>
          <CopilotSectionTitle
            title="Acciones del pipeline"
            subtitle="Orden: más recientes primero. Resultado: una vez por acción."
          />
          {loading ? (
            <CopilotSkeletonKpiRow count={4} className="py-1" />
          ) : actions.length === 0 ? (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-3 lg:col-span-2">
                <CopilotOperationalEmptyState
                  title="Pipeline activo"
                  status="Sin acciones pendientes en esta carga"
                  statusTone="info"
                  metrics={[
                    { label: "Pendientes", value: actionMetrics.pending },
                    { label: "Seguimiento", value: actionMetrics.tracking },
                    { label: "Resueltas hoy", value: actionMetrics.resolvedToday },
                    { label: "Total", value: actionMetrics.total },
                  ]}
                  footnote="Generá acciones desde decisiones o abrí un seguimiento desde alertas."
                />
                <CopilotPrimaryButton
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={generating}
                  className="inline-flex items-center gap-2"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  Generar acciones
                </CopilotPrimaryButton>
              </div>
              <CopilotCard className="h-fit border-[var(--copilot-border)] bg-white/80">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  Siguientes pasos
                </p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  <li>
                    <CopilotGhostLink href="/copilot/alertas" className="w-full justify-start px-0 py-1 text-xs font-semibold">
                      Revisar alertas
                    </CopilotGhostLink>
                  </li>
                  <li>
                    <CopilotGhostLink href="/copilot/clientes" className="w-full justify-start px-0 py-1 text-xs font-semibold">
                      Abrir clientes
                    </CopilotGhostLink>
                  </li>
                  <li>
                    <CopilotGhostLink href="/copilot/tesoreria" className="w-full justify-start px-0 py-1 text-xs font-semibold">
                      Revisar tesorería
                    </CopilotGhostLink>
                  </li>
                  <li>
                    <CopilotGhostLink href="/copilot/gestion-ia" className="w-full justify-start px-0 py-1 text-xs font-semibold">
                      Ver recomendaciones
                    </CopilotGhostLink>
                  </li>
                </ul>
              </CopilotCard>
            </div>
          ) : (
            <ul className="space-y-3">
              {actions.map((a) => {
                const pending = a.execution_status.toLowerCase() === "pending";
                const busy = submittingActionId === a.id;
                const evidenceActive =
                  isEvidenceOpen && evidenceAction?.id === a.id;
                return (
                  <li
                    key={a.id}
                    className={`rounded-2xl border border-[var(--copilot-border)] bg-white/85 px-3.5 py-3 shadow-sm ${
                      evidenceActive
                        ? "ring-2 ring-[rgba(31,107,74,0.22)]"
                        : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <CopilotInteractiveText
                          icon="panel"
                          layout="block"
                          className="font-semibold"
                          onClick={() => {
                            setEvidenceAction(a);
                            setIsEvidenceOpen(true);
                          }}
                        >
                          {a.company_name ?? "Empresa (sin dato)"}
                        </CopilotInteractiveText>
                        <p className="mt-1 text-xs uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                          {mapActionTypeLabel(a.action_type)} ·{" "}
                          {mapActionChannel(a.channel)}
                        </p>
                        {evidenceActive ? (
                          <span className="mt-2 inline-block rounded-full bg-[var(--copilot-accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--copilot-accent)]">
                            Respaldo abierto
                          </span>
                        ) : null}
                        <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
                          {a.action_payload?.suggested_message ?? "—"}
                        </p>
                        <p className="mt-2 text-xs text-[var(--copilot-ink-muted)]">
                          {formatDate(a.created_at)}
                        </p>
                        <CopilotTraceMeta
                          trace={traceFromActionRow(a)}
                          variant="embed"
                          dense
                          className="!pt-2"
                        />
                        <div className="mt-3">
                          <CopilotGhostButton
                            type="button"
                            className="text-xs"
                            onClick={() => {
                              setEvidenceAction(a);
                              setIsEvidenceOpen(true);
                            }}
                          >
                            Ver respaldo
                          </CopilotGhostButton>
                        </div>
                      </div>
                      <CopilotBadge tone={statusTone(a.execution_status)}>
                        {mapExecutionStatus(a.execution_status)}
                      </CopilotBadge>
                    </div>

                    {(() => {
                      const ld = loopDrafts[a.id] ?? {
                        assignee: "",
                        expected: "",
                        before: "",
                      };
                      return (
                    <div className="mt-4 rounded-xl border border-[var(--copilot-border)]/90 bg-[rgba(255,255,255,0.7)] px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        Seguimiento
                      </p>
                      <div className="mt-3 space-y-3">
                        <label className="block">
                          <span className="text-xs font-medium text-[var(--copilot-ink-muted)]">
                            Responsable
                          </span>
                          <input
                            type="text"
                            className="mt-1 w-full rounded-lg border border-[var(--copilot-border)] bg-white px-3 py-2 text-sm text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)]"
                            placeholder="Nombre o rol"
                            value={ld.assignee}
                            onChange={(e) =>
                              setLoopDrafts((p) => ({
                                ...p,
                                [a.id]: { ...ld, assignee: e.target.value },
                              }))
                            }
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-[var(--copilot-ink-muted)]">
                            Resultado esperado
                          </span>
                          <textarea
                            rows={2}
                            className="mt-1 w-full resize-y rounded-lg border border-[var(--copilot-border)] bg-white px-3 py-2 text-sm text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)]"
                            placeholder="Qué debería pasar si la acción sale bien"
                            value={ld.expected}
                            onChange={(e) =>
                              setLoopDrafts((p) => ({
                                ...p,
                                [a.id]: { ...ld, expected: e.target.value },
                              }))
                            }
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-[var(--copilot-ink-muted)]">
                            Antes (contexto o lectura)
                          </span>
                          <textarea
                            rows={2}
                            className="mt-1 w-full resize-y rounded-lg border border-[var(--copilot-border)] bg-white px-3 py-2 text-sm text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)]"
                            placeholder="Situación o métrica antes de ejecutar"
                            value={ld.before}
                            onChange={(e) =>
                              setLoopDrafts((p) => ({
                                ...p,
                                [a.id]: { ...ld, before: e.target.value },
                              }))
                            }
                          />
                        </label>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <CopilotGhostButton
                          type="button"
                          disabled={savingLoopId === a.id}
                          onClick={() => void saveActionLoop(a)}
                          className="inline-flex items-center gap-2 text-xs"
                        >
                          {savingLoopId === a.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          ) : null}
                          Guardar seguimiento
                        </CopilotGhostButton>
                      </div>
                    </div>
                      );
                    })()}

                    {pending ? (
                      <div className="mt-4 border-t border-[var(--copilot-border)] pt-4">
                        <p className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium text-[var(--copilot-ink-muted)]">
                          Registrar resultado
                          {busy ? (
                            <span className="inline-flex items-center gap-1.5 font-normal text-[var(--copilot-ink)]">
                              <Loader2
                                className="h-3.5 w-3.5 animate-spin"
                                aria-hidden
                              />
                              Registrando…
                            </span>
                          ) : null}
                        </p>
                        <div className="mb-3 space-y-2">
                          <label className="block">
                            <span className="text-xs font-medium text-[var(--copilot-ink-muted)]">
                              Notas del resultado (opcional)
                            </span>
                            <textarea
                              rows={2}
                              className="mt-1 w-full resize-y rounded-lg border border-[var(--copilot-border)] bg-white px-3 py-2 text-sm"
                              placeholder="Qué pasó en la práctica"
                              value={(outcomeDrafts[a.id] ?? { notes: "", after: "" }).notes}
                              onChange={(e) =>
                                setOutcomeDrafts((p) => ({
                                  ...p,
                                  [a.id]: {
                                    ...(p[a.id] ?? { notes: "", after: "" }),
                                    notes: e.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs font-medium text-[var(--copilot-ink-muted)]">
                              Después / impacto (opcional)
                            </span>
                            <textarea
                              rows={2}
                              className="mt-1 w-full resize-y rounded-lg border border-[var(--copilot-border)] bg-white px-3 py-2 text-sm"
                              placeholder="Lectura breve después de la interacción"
                              value={(outcomeDrafts[a.id] ?? { notes: "", after: "" }).after}
                              onChange={(e) =>
                                setOutcomeDrafts((p) => ({
                                  ...p,
                                  [a.id]: {
                                    ...(p[a.id] ?? { notes: "", after: "" }),
                                    after: e.target.value,
                                  },
                                }))
                              }
                            />
                          </label>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <CopilotGhostButton
                            type="button"
                            disabled={busy}
                            onClick={() => onQuickClick(a, "no_response")}
                            className={quickBtnClass}
                          >
                            Sin respuesta
                          </CopilotGhostButton>
                          <CopilotGhostButton
                            type="button"
                            disabled={busy}
                            onClick={() => onQuickClick(a, "response")}
                            className={quickBtnClass}
                          >
                            Respondió
                          </CopilotGhostButton>
                          <CopilotGhostButton
                            type="button"
                            disabled={busy}
                            onClick={() => onQuickClick(a, "meeting")}
                            className={quickBtnClass}
                          >
                            Reunión
                          </CopilotGhostButton>
                          <CopilotGhostButton
                            type="button"
                            disabled={busy}
                            onClick={() => onQuickClick(a, "sale")}
                            className={`${quickBtnClass} ${
                              saleExpandId === a.id
                                ? "border-[var(--copilot-accent)] bg-emerald-50/50"
                                : ""
                            }`}
                          >
                            Venta
                          </CopilotGhostButton>
                        </div>

                        {saleExpandId === a.id ? (
                          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-[var(--copilot-border)] bg-white/70 px-3 py-3">
                            <label className="flex min-w-[140px] flex-1 flex-col gap-1">
                              <span className="text-xs font-medium text-[var(--copilot-ink-muted)]">
                                Monto (venta)
                              </span>
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="0"
                                value={saleAmount}
                                onChange={(e) => setSaleAmount(e.target.value)}
                                className="rounded-lg border border-[var(--copilot-border)] bg-white px-3 py-2 text-sm text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)]"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    onConfirmSale(a);
                                  }
                                }}
                              />
                            </label>
                            <CopilotPrimaryButton
                              type="button"
                              disabled={busy}
                              onClick={() => onConfirmSale(a)}
                              className="shrink-0 px-4 py-2 text-xs"
                            >
                              {busy ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                "Registrar venta"
                              )}
                            </CopilotPrimaryButton>
                            <CopilotGhostButton
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setSaleExpandId(null);
                                setSaleAmount("");
                              }}
                              className="shrink-0 px-3 py-2 text-xs"
                            >
                              Cancelar
                            </CopilotGhostButton>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3 border-t border-[var(--copilot-border)] pt-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                          Cierre del loop
                        </p>
                        {a.outcome ? (
                          <div className="space-y-2 text-sm text-[var(--copilot-ink)]">
                            <p>
                              <span className="font-medium text-[var(--copilot-ink-muted)]">
                                Tipo registrado:{" "}
                              </span>
                              {mapOutcomeTypeLabelEs(a.outcome.outcome_type)}
                            </p>
                            <p>
                              <span className="font-medium text-[var(--copilot-ink-muted)]">
                                Esperado:{" "}
                              </span>
                              {a.expected_result?.trim()
                                ? a.expected_result
                                : "Sin texto de esperado cargado."}
                            </p>
                            <p>
                              <span className="font-medium text-[var(--copilot-ink-muted)]">
                                Real / notas:{" "}
                              </span>
                              {a.outcome.notes?.trim()
                                ? a.outcome.notes
                                : "Sin notas en el outcome."}
                            </p>
                            {a.outcome.outcome_type === "sale" &&
                            a.outcome.revenue_amount != null ? (
                              <p>
                                <span className="font-medium text-[var(--copilot-ink-muted)]">
                                  Monto venta:{" "}
                                </span>
                                {a.outcome.revenue_amount.toLocaleString("es-AR", {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 2,
                                })}
                              </p>
                            ) : null}
                            {a.outcome.after_note?.trim() ? (
                              <p>
                                <span className="font-medium text-[var(--copilot-ink-muted)]">
                                  Después (registrado):{" "}
                                </span>
                                {a.outcome.after_note}
                              </p>
                            ) : null}
                            {a.before_note?.trim() || a.outcome.after_note?.trim() ? (
                              <p className="rounded-lg bg-[rgba(31,107,74,0.06)] px-3 py-2 text-xs leading-relaxed text-[var(--copilot-ink)]">
                                <span className="font-semibold">Antes: </span>
                                {a.before_note?.trim() || "—"}
                                <span className="mx-1.5 text-[var(--copilot-ink-muted)]">·</span>
                                <span className="font-semibold">Después: </span>
                                {a.outcome.after_note?.trim() ||
                                  a.outcome.notes?.trim() ||
                                  "—"}
                              </p>
                            ) : null}
                            <p className="text-xs text-[var(--copilot-ink-muted)]">
                              Outcome registrado: {formatDate(a.outcome.created_at)}
                            </p>
                          </div>
                        ) : (
                          <p className="text-sm text-amber-900/90">
                            Estado {mapExecutionStatus(a.execution_status)} sin fila de
                            outcome en esta carga. Volvé a listar o revisá permisos.
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CopilotCard>
      </div>

      <CopilotActionsEvidenceDrawer
        action={evidenceAction}
        isOpen={isEvidenceOpen && evidenceAction != null}
        onClose={() => setIsEvidenceOpen(false)}
      />
    </div>
  );
}
