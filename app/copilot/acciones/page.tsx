"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { CopilotActionsEvidenceDrawer } from "@/components/copilot/copilot-actions-evidence-drawer";
import { CopilotInteractiveText } from "@/components/copilot/copilot-interactive-text";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotReadingKey } from "@/components/copilot/copilot-reading-key";
import {
  CopilotBadge,
  CopilotCard,
  CopilotGhostButton,
  CopilotPrimaryButton,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import type { ActionListItem } from "@/lib/ai/action-types";
import {
  mapActionChannel,
  mapActionTypeLabel,
  mapExecutionStatus,
} from "@/lib/copilot-format";
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

  const fetchActions = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/copilot/actions?limit=120");
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
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchActions();
  }, [fetchActions]);

  const handleGenerate = async () => {
    setError(null);
    setLastResult(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/copilot/actions/generate", {
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

  const patchActionStatus = (actionId: string, status: string) => {
    setActions((prev) =>
      prev.map((x) =>
        x.id === actionId ? { ...x, execution_status: status } : x
      )
    );
    setEvidenceAction((prev) =>
      prev?.id === actionId ? { ...prev, execution_status: status } : prev
    );
  };

  const submitOutcome = async (
    a: ActionListItem,
    outcomeType: OutcomeTypeValue,
    revenueAmount?: number | null
  ) => {
    setError(null);
    setSubmittingActionId(a.id);
    try {
      const res = await fetch("/api/copilot/outcomes", {
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
        }),
      });
      const json = (await res.json()) as { error?: string; outcome?: unknown };
      if (!res.ok) {
        setError(json.error ?? "No se pudo registrar el resultado.");
        return;
      }
      const nextStatus = outcomeType === "no_response" ? "failed" : "executed";
      patchActionStatus(a.id, nextStatus);
      setSaleExpandId(null);
      setSaleAmount("");
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        title="Acciones"
        description="Acciones generadas desde decisiones — registrá el resultado con un clic."
        readingKey={
          <CopilotReadingKey
            lines={[
              "Estas son mis siguientes jugadas.",
              "Puedo registrar qué pasó.",
              "Cierro el ciclo con resultados.",
            ]}
          />
        }
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

      <div className="flex-1 space-y-6 overflow-auto px-6 py-8">
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

        <CopilotCard>
          <CopilotSectionTitle
            title="Acciones del pipeline"
            subtitle="Orden: más recientes primero. Resultado: una vez por acción."
          />
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-[var(--copilot-ink-muted)]">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              Cargando…
            </div>
          ) : actions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--copilot-border)] bg-white/60 px-4 py-8 text-center text-sm text-[var(--copilot-ink-muted)]">
              No hay acciones todavía. Generá desde decisiones existentes con el botón
              superior.
            </p>
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
                    className={`rounded-2xl border border-[var(--copilot-border)] bg-white/85 px-4 py-4 shadow-sm ${
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

                    {pending ? (
                      <div className="mt-4 border-t border-[var(--copilot-border)] pt-4">
                        <p className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium text-[var(--copilot-ink-muted)]">
                          Resultado
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
                    ) : null}
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
