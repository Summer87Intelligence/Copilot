"use client";

import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";

import {
  COLLECTION_ACTION_TYPES,
  COLLECTION_STATUSES,
  COLLECTION_PRIORITIES,
  COLLECTION_ACTION_TYPE_LABELS,
  COLLECTION_STATUS_LABELS,
  COLLECTION_PRIORITY_LABELS,
  type CollectionActionInput,
  type CollectionAction,
} from "@/lib/copilot-collection-types";
import { useCollectionActions } from "@/hooks/use-collection-actions";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  companyId: string;
  companyName: string;
  open: boolean;
  onClose: () => void;
  onCreated?: (action: CollectionAction) => void;
};

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function CollectionActionDrawer({
  companyId,
  companyName,
  open,
  onClose,
  onCreated,
}: Props) {
  const { create } = useCollectionActions(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [actionType, setActionType] =
    useState<CollectionActionInput["actionType"]>("call");
  const [status, setStatus] = useState<CollectionActionInput["status"]>("contacted");
  const [priority, setPriority] =
    useState<CollectionActionInput["priority"]>("medium");
  const [notes, setNotes] = useState("");
  const [nextActionDate, setNextActionDate] = useState("");
  const [contactDate, setContactDate] = useState("");
  const [promiseDate, setPromiseDate] = useState("");
  const [promiseAmount, setPromiseAmount] = useState("");
  const [promiseCurrency, setPromiseCurrency] = useState<"UYU" | "USD" | "">("");

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setActionType("call");
      setStatus("contacted");
      setPriority("medium");
      setNotes("");
      setNextActionDate("");
      setContactDate("");
      setPromiseDate("");
      setPromiseAmount("");
      setPromiseCurrency("");
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const showPromiseFields =
    actionType === "payment_promise" || status === "promised_payment";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const input: CollectionActionInput = {
        companyId,
        actionType,
        status,
        priority,
        notes: notes.trim() || null,
        contactDate: contactDate || null,
        nextActionDate: nextActionDate || null,
        promiseDate: promiseDate || null,
        promiseAmount:
          promiseAmount && parseFloat(promiseAmount) > 0
            ? parseFloat(promiseAmount)
            : null,
        promiseCurrency: promiseCurrency || null,
      };

      const result = await create(input);
      if (!result) {
        setError("No se pudo registrar la acción. Intentá de nuevo.");
        return;
      }
      onCreated?.(result);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Registrar acción de cobranza"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-[var(--copilot-border)] bg-[var(--copilot-card)] shadow-2xl"
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-[var(--copilot-border)] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--copilot-ink)]">
              Registrar acción
            </h2>
            <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)] truncate max-w-[260px]">
              {companyName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 transition hover:bg-[var(--copilot-panel-bg)]"
          >
            <X className="h-3.5 w-3.5 text-[var(--copilot-ink-muted)]" aria-hidden />
          </button>
        </header>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex-1 space-y-5 px-5 py-5">
            {/* Tipo de acción */}
            <Field label="Tipo de acción" required>
              <select
                value={actionType}
                onChange={(e) =>
                  setActionType(e.target.value as CollectionActionInput["actionType"])
                }
                className={selectCls}
                required
              >
                {COLLECTION_ACTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {COLLECTION_ACTION_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>

            {/* Estado */}
            <Field label="Estado resultante" required>
              <select
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as CollectionActionInput["status"])
                }
                className={selectCls}
                required
              >
                {COLLECTION_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {COLLECTION_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>

            {/* Prioridad */}
            <Field label="Prioridad">
              <div className="flex gap-2 flex-wrap">
                {COLLECTION_PRIORITIES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={[
                      "inline-flex h-7 items-center rounded-lg border px-3 text-[11px] font-semibold uppercase tracking-[0.08em] transition",
                      priority === p
                        ? priorityActiveCls[p]
                        : "border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 text-[var(--copilot-ink-muted)] hover:text-[var(--copilot-ink)]",
                    ].join(" ")}
                  >
                    {COLLECTION_PRIORITY_LABELS[p]}
                  </button>
                ))}
              </div>
            </Field>

            {/* Fecha de contacto */}
            <Field label="Fecha de contacto">
              <input
                type="datetime-local"
                value={contactDate}
                onChange={(e) => setContactDate(e.target.value)}
                className={inputCls}
              />
            </Field>

            {/* Próxima acción */}
            <Field label="Próxima acción">
              <input
                type="datetime-local"
                value={nextActionDate}
                onChange={(e) => setNextActionDate(e.target.value)}
                className={inputCls}
              />
            </Field>

            {/* Promesa de pago (condicional) */}
            {showPromiseFields && (
              <fieldset className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-4">
                <legend className="px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-700">
                  Promesa de pago
                </legend>

                <Field label="Fecha de promesa">
                  <input
                    type="date"
                    value={promiseDate}
                    onChange={(e) => setPromiseDate(e.target.value)}
                    className={inputCls}
                  />
                </Field>

                <div className="flex gap-3">
                  <div className="flex-1">
                    <Field label="Monto">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={promiseAmount}
                        onChange={(e) => setPromiseAmount(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                  </div>
                  <div className="w-24">
                    <Field label="Moneda">
                      <select
                        value={promiseCurrency}
                        onChange={(e) =>
                          setPromiseCurrency(e.target.value as "UYU" | "USD" | "")
                        }
                        className={selectCls}
                      >
                        <option value="">—</option>
                        <option value="UYU">UYU</option>
                        <option value="USD">USD</option>
                      </select>
                    </Field>
                  </div>
                </div>
              </fieldset>
            )}

            {/* Notas */}
            <Field label="Notas internas">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Resumen del contacto, acuerdos, observaciones…"
                className={[inputCls, "resize-none"].join(" ")}
              />
            </Field>

            {error && (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <footer className="border-t border-[var(--copilot-border)] px-5 py-4">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="flex-1 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 py-2 text-sm font-medium text-[var(--copilot-ink-muted)] transition hover:bg-[var(--copilot-panel-bg)] disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--copilot-ink)] py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                {saving ? "Guardando…" : "Registrar acción"}
              </button>
            </div>
          </footer>
        </form>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-componentes y constantes visuales
// ---------------------------------------------------------------------------

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--copilot-ink-muted)]">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-3 py-2 text-sm text-[var(--copilot-ink)] shadow-sm transition placeholder:text-[var(--copilot-ink-muted)] focus:border-[var(--copilot-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--copilot-accent)]/20";

const selectCls =
  "w-full rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-3 py-2 text-sm text-[var(--copilot-ink)] shadow-sm transition focus:border-[var(--copilot-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--copilot-accent)]/20";

const priorityActiveCls: Record<string, string> = {
  low: "border-emerald-300 bg-emerald-50 text-emerald-800",
  medium: "border-amber-300 bg-amber-50 text-amber-800",
  high: "border-orange-300 bg-orange-50 text-orange-800",
  urgent: "border-rose-300 bg-rose-50 text-rose-800",
};
