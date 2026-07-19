"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import type { BankReviewRow } from "@/lib/bank/review/bank-review-view";
import {
  ActionChip,
  ConfidenceChip,
  HistoricalBadges,
  KeyValue,
  ReasonPills,
  ReviewStateBadge,
} from "@/components/copilot/bank-review/bank-review-badges";

function fmtAmount(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function YesNo({ value }: { value: boolean }) {
  return <span className="font-semibold">{value ? "Sí" : "No"}</span>;
}

const ACTION_BTN =
  "inline-flex h-9 items-center justify-center rounded-lg border border-[var(--copilot-border)] px-3 text-xs font-semibold text-[var(--copilot-ink)] transition enabled:hover:bg-[var(--copilot-hover-bg)] disabled:cursor-not-allowed disabled:opacity-45";

const CODE_MESSAGES: Record<string, string> = {
  INVALID_ACTOR: "Tu usuario no está autorizado en este workspace.",
  SUGGESTION_NOT_FOUND: "La sugerencia ya no existe.",
  SCOPE_NOT_ALLOWED: "Acción no permitida para este ámbito.",
  SUGGESTION_NOT_ACTIVE: "La sugerencia no está en un estado revisable.",
  SUGGESTION_TERMINAL: "La sugerencia ya está en un estado final.",
  CONCURRENT_UPDATE: "Otro usuario modificó la sugerencia. Reintentá.",
  REASON_INVALID: "El motivo debe tener entre 3 y 500 caracteres.",
  NOTE_INVALID: "La nota debe tener entre 1 y 1000 caracteres.",
  MIGRATION_PENDING: "Las acciones de revisión aún no están habilitadas en la base.",
  ACTION_FAILED: "No se pudo completar la acción.",
};

export function BankReviewDrawer({
  row,
  onClose,
  onActionComplete,
}: {
  row: BankReviewRow | null;
  onClose: () => void;
  onActionComplete?: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "err"; msg: string } | null>(null);
  const [mode, setMode] = useState<null | "note" | "reject">(null);
  const [text, setText] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (row) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [row, onClose]);

  // Reset transient UI al cambiar de fila.
  useEffect(() => {
    setBusy(null);
    setFeedback(null);
    setMode(null);
    setText("");
  }, [row?.id]);

  if (!row) return null;
  const isHistorical = row.suggestionScope === "historical_review";
  const isTerminal = row.reviewState === "rejected";
  const canReview = isHistorical && row.reviewState === "pending";

  async function post(action: string, url: string, body?: Record<string, unknown>) {
    if (busy) return;
    setBusy(action);
    setFeedback(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        const code = String(json?.code ?? "ACTION_FAILED");
        setFeedback({ tone: "err", msg: CODE_MESSAGES[code] ?? "No se pudo completar la acción." });
        return;
      }
      setFeedback({ tone: "ok", msg: statusMessage(String(json?.status ?? "ok")) });
      setMode(null);
      setText("");
      await onActionComplete?.();
    } catch {
      setFeedback({ tone: "err", msg: "Error de red. Reintentá." });
    } finally {
      setBusy(null);
    }
  }

  function submitComposer() {
    const value = text.trim();
    if (mode === "note") {
      if (value.length < 1) return;
      const token = `${row!.id}:${Date.now()}`;
      void post("note", `/api/copilot/bank-review/${row!.id}/notes`, { note: value, clientToken: token });
    } else if (mode === "reject") {
      if (value.length < 3) return;
      void post("reject", `/api/copilot/bank-review/${row!.id}/reject`, { reason: value });
    }
  }

  function copyIds() {
    const t = [
      `movement:${row!.bankMovementId}`,
      row!.proposedReceiptId ? `receipt:${row!.proposedReceiptId}` : null,
      row!.proposedClientId ? `client:${row!.proposedClientId}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    void navigator.clipboard?.writeText(t);
    setFeedback({ tone: "ok", msg: "IDs copiados." });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Detalle de sugerencia">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] shadow-xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-4 py-3">
          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              {isHistorical ? "Historical Review" : "Operational"}
            </p>
            <p className="text-base font-semibold text-[var(--copilot-ink)]">{fmtAmount(row.movement.amount, row.movement.currency)}</p>
            <span className="flex flex-wrap items-center gap-1">
              <ReviewStateBadge state={row.reviewState} />
              {isHistorical ? <HistoricalBadges /> : null}
            </span>
          </div>
          <button type="button" onClick={onClose} className={ACTION_BTN} aria-label="Cerrar panel">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="flex flex-col gap-5 px-4 py-4">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">Movimiento</h3>
            <dl className="grid grid-cols-2 gap-3">
              <KeyValue label="Fecha">{row.movement.date}</KeyValue>
              <KeyValue label="Importe">{fmtAmount(row.movement.amount, row.movement.currency)}</KeyValue>
              <KeyValue label="Moneda">{row.movement.currency}</KeyValue>
              <KeyValue label="Dirección">{row.movement.direction}</KeyValue>
              <KeyValue label="Descripción">{row.movement.descriptionMasked}</KeyValue>
              <KeyValue label="Fingerprint"><code className="text-xs">{row.movement.payerFingerprintShort}…</code></KeyValue>
            </dl>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">Sugerencia</h3>
            <dl className="grid grid-cols-2 gap-3">
              <KeyValue label="Cliente propuesto">{row.clientName ?? (row.clientIdShort ? `${row.clientIdShort}…` : "—")}</KeyValue>
              <KeyValue label="Recibo propuesto">{row.receiptIdShort ? `${row.receiptIdShort}…` : "—"}</KeyValue>
              <KeyValue label="Confidence"><ConfidenceChip value={row.confidence} /></KeyValue>
              <KeyValue label="Acción sugerida"><ActionChip action={row.recommendedAction} /></KeyValue>
              <KeyValue label="Engine version">{row.engineVersion}</KeyValue>
              <KeyValue label="Suggestion scope">{row.suggestionScope}</KeyValue>
              <KeyValue label="Estado de revisión"><ReviewStateBadge state={row.reviewState} /></KeyValue>
              <KeyValue label="Status">{row.status}</KeyValue>
              <KeyValue label="Historical audit"><YesNo value={row.evidence.historicalAudit} /></KeyValue>
              <KeyValue label="Audit only"><YesNo value={row.evidence.auditOnly} /></KeyValue>
            </dl>
            {row.rejectedReason ? (
              <div className="mt-3"><KeyValue label="Motivo de rechazo">{row.rejectedReason}</KeyValue></div>
            ) : null}
            <div className="mt-3 flex flex-col gap-2">
              <KeyValue label="Reasons"><ReasonPills reasons={row.reasons} /></KeyValue>
              <KeyValue label="Warnings"><ReasonPills reasons={row.warnings} /></KeyValue>
            </div>
          </section>

          <section className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] p-3">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">Matching Evidence</h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between gap-2"><span>Exact Amount</span><YesNo value={row.evidence.exactAmount} /></div>
              <div className="flex justify-between gap-2"><span>Date Proximity</span><span className="font-semibold tabular-nums">{row.evidence.dateProximityDays == null ? "—" : `${row.evidence.dateProximityDays} d`}</span></div>
              <div className="flex justify-between gap-2"><span>Receipt Date Dominance</span><YesNo value={row.evidence.receiptDateDominance} /></div>
              <div className="flex justify-between gap-2"><span>Multiple Candidates</span><YesNo value={row.evidence.multipleCandidates} /></div>
              <div className="flex justify-between gap-2"><span>Historical Audit</span><YesNo value={row.evidence.historicalAudit} /></div>
              <div className="flex justify-between gap-2"><span>Audit Only</span><YesNo value={row.evidence.auditOnly} /></div>
              <div className="col-span-2 flex justify-between gap-2 border-t border-[var(--copilot-border)] pt-2"><span>Suggested Action</span><span className="font-semibold">{row.evidence.suggestedAction}</span></div>
            </dl>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">Acciones</h3>

            {feedback ? (
              <p
                role="status"
                className={`mb-2 rounded-lg border px-3 py-2 text-xs ${
                  feedback.tone === "ok"
                    ? "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800/40 dark:text-slate-200"
                    : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
                }`}
              >
                {feedback.msg}
              </p>
            ) : null}

            {mode ? (
              <div className="mb-2 flex flex-col gap-2">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                  maxLength={mode === "note" ? 1000 : 500}
                  placeholder={mode === "note" ? "Nota (máx. 1000)…" : "Motivo de rechazo (mín. 3)…"}
                  className="w-full rounded-lg border border-[var(--copilot-border-strong)] bg-[var(--copilot-panel-bg)] px-2.5 py-2 text-sm text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)]"
                />
                <div className="flex gap-2">
                  <button type="button" className={ACTION_BTN} disabled={Boolean(busy)} onClick={submitComposer}>
                    {busy ? "Enviando…" : mode === "note" ? "Guardar nota" : "Confirmar rechazo"}
                  </button>
                  <button type="button" className={ACTION_BTN} disabled={Boolean(busy)} onClick={() => { setMode(null); setText(""); }}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {isHistorical ? (
                <button
                  type="button"
                  className={ACTION_BTN}
                  disabled={Boolean(busy) || !canReview}
                  title={canReview ? undefined : "Solo pendientes"}
                  onClick={() => void post("review", `/api/copilot/bank-review/${row.id}/review`)}
                >
                  {busy === "review" ? "Marcando…" : "Marcar revisada"}
                </button>
              ) : null}
              <button type="button" className={ACTION_BTN} disabled={Boolean(busy) || isTerminal} onClick={() => { setMode("note"); setText(""); setFeedback(null); }}>
                Agregar nota
              </button>
              <button type="button" className={ACTION_BTN} disabled={Boolean(busy) || isTerminal} onClick={() => { setMode("reject"); setText(""); setFeedback(null); }}>
                Rechazar sugerencia
              </button>
              <button type="button" className={ACTION_BTN} disabled={Boolean(busy)} onClick={copyIds}>Copiar IDs</button>
              {/* Confirmar conciliación: fuera de alcance de esta fase. */}
              {!isHistorical ? (
                <button type="button" className={ACTION_BTN} disabled title="Fase posterior (RPC financiera)">Confirmar</button>
              ) : null}
            </div>

            <p className="mt-2 text-[11px] text-[var(--copilot-ink-muted)]">
              {isHistorical
                ? "Revisión histórica (audit-only): nunca concilia ni ejecuta AUTO. Sin links ni allocations."
                : "La confirmación de conciliación se hará por RPC financiera en una fase posterior."}
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}

function statusMessage(status: string): string {
  switch (status) {
    case "reviewed":
      return "Sugerencia marcada como revisada.";
    case "already_reviewed":
      return "La sugerencia ya estaba revisada.";
    case "rejected":
      return "Sugerencia rechazada.";
    case "already_rejected":
      return "La sugerencia ya estaba rechazada.";
    case "noted":
      return "Nota agregada.";
    case "already_recorded":
      return "La nota ya había sido registrada.";
    default:
      return "Acción completada.";
  }
}
