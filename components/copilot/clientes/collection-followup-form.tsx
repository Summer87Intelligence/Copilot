"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ClipboardList, FileText, Mail, MessageCircle, PenLine, Phone, Trash2 } from "lucide-react";
import type { CollectionFollowupInitialValues } from "@/lib/account-statement/build-account-statement-followup-prefill";

import { useCollectionActions } from "@/hooks/use-collection-actions";
import type {
  CollectionAction,
  CollectionActionPatch,
  CollectionActionType,
  CollectionCurrency,
} from "@/lib/copilot-collection-types";
import {
  actionToUiOutcome,
  outcomeToStatus,
  type UiOutcome,
} from "@/lib/collection/collection-history-helpers";
import {
  formatActionDate,
  formatRelative,
  formatYmd,
} from "@/lib/collection/collection-date-helpers";
import { COLLECTION_UX } from "@/lib/copilot-collection-ux-copy";

// ─── Constants ────────────────────────────────────────────────────────────────

const CHANNEL_OPTS: { id: CollectionActionType; label: string }[] = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "email", label: "Email" },
  { id: "call", label: "Teléfono" },
  { id: "internal_note", label: "Otro" },
];

const OUTCOME_OPTS: { id: UiOutcome; label: string }[] = [
  { id: "contacted", label: "Contactado" },
  { id: "promised_payment", label: "Prometió pagar" },
  { id: "no_response", label: "Sin respuesta" },
  { id: "wrong_contact", label: "Contacto incorrecto" },
  { id: "disputed", label: "En disputa" },
  { id: "needs_followup", label: "Requiere seguimiento" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getChannelIcon(type: CollectionActionType) {
  switch (type) {
    case "whatsapp":
      return <MessageCircle className="h-3 w-3" aria-hidden />;
    case "email":
      return <Mail className="h-3 w-3" aria-hidden />;
    case "call":
      return <Phone className="h-3 w-3" aria-hidden />;
    default:
      return <FileText className="h-3 w-3" aria-hidden />;
  }
}

function getChannelLabel(type: CollectionActionType): string {
  const map: Partial<Record<CollectionActionType, string>> = {
    whatsapp: "WhatsApp",
    email: "Email",
    call: "Teléfono",
    internal_note: "Otro",
    meeting: "Reunión",
    payment_promise: "Promesa de pago",
    dispute: "Disputa",
    escalation: "Escalación",
  };
  return map[type] ?? type;
}

function getOutcomeLabel(action: CollectionAction): string {
  const uiOutcome = (action.metadata as Record<string, unknown> | null)?.ui_outcome;
  const LABELS: Record<string, string> = {
    contacted: "Contactado",
    promised_payment: "Prometió pagar",
    no_response: "Sin respuesta",
    wrong_contact: "Contacto incorrecto",
    disputed: "En disputa",
    needs_followup: "Requiere seguimiento",
    paused: "Sin respuesta",
    pending_review: "Requiere seguimiento",
    escalated: "Escalado",
    paid: "Pagado",
    no_action: "Sin acción",
  };
  if (typeof uiOutcome === "string" && uiOutcome in LABELS) return LABELS[uiOutcome];
  return LABELS[action.status] ?? action.status;
}

function getBadgeClass(action: CollectionAction): string {
  const key =
    typeof (action.metadata as Record<string, unknown> | null)?.ui_outcome === "string"
      ? String((action.metadata as Record<string, unknown>).ui_outcome)
      : action.status;
  const CLASSES: Record<string, string> = {
    contacted: "bg-emerald-50 text-emerald-700 border-emerald-200",
    promised_payment: "bg-blue-50 text-blue-700 border-blue-200",
    no_response: "bg-slate-100 text-slate-500 border-slate-200",
    wrong_contact: "bg-orange-50 text-orange-600 border-orange-200",
    disputed: "bg-red-50 text-red-700 border-red-200",
    needs_followup: "bg-amber-50 text-amber-700 border-amber-200",
    paused: "bg-slate-100 text-slate-500 border-slate-200",
    pending_review: "bg-amber-50 text-amber-700 border-amber-200",
    escalated: "bg-red-50 text-red-700 border-red-200",
    paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  return CLASSES[key] ?? "bg-slate-100 text-slate-500 border-slate-200";
}

// ─── Pill ─────────────────────────────────────────────────────────────────────

function Pill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-[12px] font-medium transition ${
        active
          ? "border-[var(--copilot-accent)] bg-[var(--copilot-accent)] text-white"
          : "border-[var(--copilot-border)] bg-white text-[var(--copilot-ink-muted)] hover:border-[var(--copilot-accent)]/40"
      }`}
    >
      {label}
    </button>
  );
}

// ─── History item ─────────────────────────────────────────────────────────────

function HistoryItem({
  action,
  onSave,
  onDelete,
}: {
  action: CollectionAction;
  onSave: (id: string, patch: CollectionActionPatch) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [editChannel, setEditChannel] = useState<CollectionActionType>(action.actionType);
  const [editOutcome, setEditOutcome] = useState<UiOutcome>(actionToUiOutcome(action));
  const [editNote, setEditNote] = useState(action.notes ?? "");
  const [editNextFollowUp, setEditNextFollowUp] = useState(action.nextActionDate ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleEdit = () => {
    setEditChannel(action.actionType);
    setEditOutcome(actionToUiOutcome(action));
    setEditNote(action.notes ?? "");
    setEditNextFollowUp(action.nextActionDate ?? "");
    setMode("edit");
  };

  const handleSave = async () => {
    setSaving(true);
    const ok = await onSave(action.id, {
      actionType: editChannel,
      status: outcomeToStatus(editOutcome),
      notes: editNote.trim() || null,
      nextActionDate: editNextFollowUp || null,
      metadata: { ...(action.metadata ?? {}), ui_outcome: editOutcome },
    });
    setSaving(false);
    if (ok) setMode("view");
  };

  const handleDelete = async () => {
    setDeleting(true);
    await onDelete(action.id);
    setDeleting(false);
  };

  if (mode === "delete") {
    return (
      <div className="flex flex-col gap-2 py-3">
        <p className="text-[12px] text-[var(--copilot-ink)]">
          ¿Eliminar esta gestión? Esta acción no se puede deshacer.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("view")}
            disabled={deleting}
            className="rounded-lg border border-[var(--copilot-border)] px-3 py-1.5 text-[11px] font-medium text-[var(--copilot-ink-muted)] hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {deleting ? "Eliminando…" : "Eliminar"}
          </button>
        </div>
      </div>
    );
  }

  if (mode === "edit") {
    return (
      <div className="space-y-3 py-3">
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">Canal</p>
          <div className="flex flex-wrap gap-1.5">
            {CHANNEL_OPTS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setEditChannel(c.id)}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
                  editChannel === c.id
                    ? "border-[var(--copilot-accent)] bg-[var(--copilot-accent)] text-white"
                    : "border-[var(--copilot-border)] text-[var(--copilot-ink-muted)] hover:border-[var(--copilot-accent)]/40"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">Resultado</p>
          <div className="flex flex-wrap gap-1.5">
            {OUTCOME_OPTS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setEditOutcome(o.id)}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
                  editOutcome === o.id
                    ? "border-[var(--copilot-accent)] bg-[var(--copilot-accent)] text-white"
                    : "border-[var(--copilot-border)] text-[var(--copilot-ink-muted)] hover:border-[var(--copilot-accent)]/40"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">Nota</p>
          <textarea
            value={editNote}
            onChange={(e) => setEditNote(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-[var(--copilot-border)] bg-white px-2.5 py-1.5 text-[12px] text-[var(--copilot-ink)] focus:border-[var(--copilot-accent)] focus:outline-none"
            placeholder="Nota de la gestión…"
          />
        </div>
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">Próx. seguimiento</p>
          <input
            type="date"
            value={editNextFollowUp}
            onChange={(e) => setEditNextFollowUp(e.target.value)}
            className="rounded-lg border border-[var(--copilot-border)] bg-white px-2.5 py-1.5 text-[12px] text-[var(--copilot-ink)] focus:border-[var(--copilot-accent)] focus:outline-none"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("view")}
            disabled={saving}
            className="rounded-lg border border-[var(--copilot-border)] px-3 py-1.5 text-[11px] font-medium text-[var(--copilot-ink-muted)] hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-lg bg-[var(--copilot-accent)] px-3 py-1.5 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 py-3">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)]">
        {getChannelIcon(action.actionType)}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium text-[var(--copilot-ink-muted)]">
            {formatActionDate(action.createdAt)}
          </span>
          <span className="text-[10px] text-[var(--copilot-ink-muted)]/60">
            {getChannelLabel(action.actionType)}
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getBadgeClass(action)}`}
          >
            {getOutcomeLabel(action)}
          </span>
        </div>
        {action.notes ? (
          <p className="text-[12px] text-[var(--copilot-ink)]">{action.notes}</p>
        ) : null}
        {(action.promiseDate || action.promiseAmount != null) ? (() => {
          const dateFmt = formatYmd(action.promiseDate);
          const amountFmt = action.promiseAmount != null && action.promiseCurrency
            ? ` · ${action.promiseCurrency === "USD" ? "U$S" : "$"} ${action.promiseAmount.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
            : "";
          const label = dateFmt
            ? `Promesa de pago: ${dateFmt}${amountFmt}`
            : `Promesa de pago registrada sin fecha${amountFmt}`;
          return <p className="text-[11px] text-blue-600">{label}</p>;
        })() : null}
        {action.nextActionDate ? (() => {
          const dateFmt = formatYmd(action.nextActionDate);
          if (!dateFmt) return null;
          const todayStr = new Date().toISOString().slice(0, 10);
          const isOverdue = action.nextActionDate < todayStr;
          const isToday = action.nextActionDate === todayStr;
          const badgeCls = isOverdue
            ? "bg-rose-50 text-rose-700 border-rose-200"
            : isToday
            ? "bg-amber-50 text-amber-700 border-amber-200"
            : "bg-sky-50 text-sky-700 border-sky-200";
          const badgeLabel = isOverdue
            ? "Seguimiento vencido"
            : isToday
            ? "Seguimiento hoy"
            : "Próx. seguimiento";
          return (
            <p className="flex items-center gap-1.5 text-[11px]">
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${badgeCls}`}>
                {badgeLabel}
              </span>
              <span className="text-[var(--copilot-ink-muted)]">{dateFmt}</span>
            </p>
          );
        })() : null}
      </div>
      <div className="flex shrink-0 gap-1 self-start pt-0.5">
        <button
          type="button"
          onClick={handleEdit}
          className="rounded-lg p-1 text-[var(--copilot-ink-muted)] hover:bg-slate-100"
          aria-label="Editar gestión"
        >
          <PenLine className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setMode("delete")}
          className="rounded-lg p-1 text-[var(--copilot-ink-muted)] hover:bg-rose-50 hover:text-rose-600"
          aria-label="Eliminar gestión"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CollectionFollowupForm({
  companyId,
  initialValues,
  prefillKey,
}: {
  companyId: string;
  initialValues?: CollectionFollowupInitialValues | null;
  prefillKey?: string | number;
}) {
  const { actions, loading, error, create, update, archive } = useCollectionActions(companyId);

  const handleHistorySave = useCallback(
    async (id: string, patch: CollectionActionPatch): Promise<boolean> => {
      const result = await update(id, patch);
      return result !== null;
    },
    [update]
  );

  const handleHistoryDelete = useCallback(
    async (id: string): Promise<boolean> => archive(id),
    [archive]
  );

  const [channel, setChannel] = useState<CollectionActionType>("whatsapp");
  const [outcome, setOutcome] = useState<UiOutcome>("contacted");
  const [note, setNote] = useState("");
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [promiseDate, setPromiseDate] = useState("");
  const [promiseAmount, setPromiseAmount] = useState("");
  const [promiseCurrency, setPromiseCurrency] = useState<CollectionCurrency>("UYU");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pendingSuggestion, setPendingSuggestion] = useState<CollectionFollowupInitialValues | null>(null);

  const noteRef = useRef(note);
  useEffect(() => { noteRef.current = note; }, [note]);

  useEffect(() => {
    if (!initialValues || prefillKey == null) return;
    const applyPrefill = (vals: CollectionFollowupInitialValues) => {
      if (vals.channel) setChannel(vals.channel as CollectionActionType);
      if (vals.outcome && OUTCOME_OPTS.some((o) => o.id === vals.outcome)) {
        setOutcome(vals.outcome as UiOutcome);
      }
      if (vals.note != null) setNote(vals.note);
      setPendingSuggestion(null);
    };
    if (!noteRef.current.trim()) {
      applyPrefill(initialValues);
    } else {
      setPendingSuggestion(initialValues);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillKey]);

  const handleSubmit = async () => {
    if (outcome === "promised_payment" && !promiseDate.trim()) {
      setSaveError("Ingresá una fecha de promesa de pago.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    const isPromise = outcome === "promised_payment";
    const result = await create({
      companyId,
      actionType: channel,
      status: outcomeToStatus(outcome),
      notes: note.trim() || null,
      contactDate: new Date().toISOString().slice(0, 10),
      nextActionDate: nextFollowUp || null,
      promiseDate: isPromise && promiseDate ? promiseDate : null,
      promiseAmount: isPromise && promiseAmount ? Number(promiseAmount) : null,
      promiseCurrency: isPromise ? promiseCurrency : null,
      metadata: { ui_outcome: outcome },
    });
    setSaving(false);
    if (result) {
      setSaved(true);
      setNote("");
      setNextFollowUp("");
      setPromiseDate("");
      setPromiseAmount("");
      setTimeout(() => setSaved(false), 3000);
    } else {
      setSaveError("No se pudo registrar la gestión. Intentá de nuevo.");
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--copilot-border)] bg-white/70 p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-[var(--copilot-accent)]" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink)]">
          Gestión de cobranza
        </span>
      </div>
      <p className="mb-2 text-[12.5px] text-[var(--copilot-ink-muted)]">
        Registrá qué pasó después de contactar al cliente.
      </p>
      <p className="mb-4 text-[11px] leading-relaxed text-[var(--copilot-ink-muted)]">
        {COLLECTION_UX.registerDoesNotPay} {COLLECTION_UX.promiseNotPayment}
      </p>

      {/* Última gestión — compact summary */}
      {!loading && actions.length > 0 ? (
        <div className="mb-4 rounded-xl border border-[var(--copilot-border)]/60 bg-[rgba(44,40,37,0.02)] px-3.5 py-3">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
            Última gestión
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[var(--copilot-accent)]">
              {getChannelIcon(actions[0].actionType)}
            </span>
            <span className="text-[11px] text-[var(--copilot-ink-muted)]">
              {getChannelLabel(actions[0].actionType)}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getBadgeClass(actions[0])}`}
            >
              {getOutcomeLabel(actions[0])}
            </span>
            <span className="text-[11px] text-[var(--copilot-ink-muted)]">
              · {formatRelative(actions[0].createdAt)}
            </span>
          </div>
          {actions[0].nextActionDate ? (() => {
            const dateFmt = formatYmd(actions[0].nextActionDate);
            return dateFmt ? (
              <p className="mt-1 text-[11px] text-[var(--copilot-ink-muted)]">
                Próximo seguimiento: {dateFmt}
              </p>
            ) : null;
          })() : null}
        </div>
      ) : null}

      {/* Form */}
      <div className="space-y-3">
        {/* Pending suggestion banner */}
        {pendingSuggestion ? (
          <div className="flex items-start gap-2 rounded-xl border border-[var(--copilot-border)] bg-[rgba(44,40,37,0.02)] p-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-[var(--copilot-ink)]">Sugerencia disponible</p>
              <p className="mt-0.5 text-[11px] text-[var(--copilot-ink-muted)]">{pendingSuggestion.note}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (pendingSuggestion.channel) setChannel(pendingSuggestion.channel as CollectionActionType);
                if (pendingSuggestion.outcome && OUTCOME_OPTS.some((o) => o.id === pendingSuggestion.outcome)) {
                  setOutcome(pendingSuggestion.outcome as UiOutcome);
                }
                if (pendingSuggestion.note != null) setNote(pendingSuggestion.note);
                setPendingSuggestion(null);
              }}
              className="shrink-0 rounded-lg border border-[var(--copilot-accent)] px-3 py-1 text-[11px] font-semibold text-[var(--copilot-accent)] transition hover:bg-[var(--copilot-accent-soft)]"
            >
              Usar sugerencia
            </button>
          </div>
        ) : null}

        {/* Canal */}
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
            Canal
          </p>
          <div className="flex flex-wrap gap-2">
            {CHANNEL_OPTS.map((opt) => (
              <Pill
                key={opt.id}
                label={opt.label}
                active={channel === opt.id}
                onClick={() => setChannel(opt.id)}
              />
            ))}
          </div>
        </div>

        {/* Resultado */}
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
            Resultado
          </p>
          <div className="flex flex-wrap gap-2">
            {OUTCOME_OPTS.map((opt) => (
              <Pill
                key={opt.id}
                label={opt.label}
                active={outcome === opt.id}
                onClick={() => setOutcome(opt.id)}
              />
            ))}
          </div>
        </div>

        {/* Promise fields */}
        {outcome === "promised_payment" ? (
          <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600/70">
              Promesa de pago
            </p>
            <div className="flex flex-wrap gap-2 overflow-x-auto">
              <div className="min-w-[120px] flex-1">
                <label className="mb-1 block text-[10px] text-[var(--copilot-ink-muted)]">
                  Fecha de promesa
                </label>
                <input
                  type="date"
                  value={promiseDate}
                  onChange={(e) => setPromiseDate(e.target.value)}
                  className="w-full rounded-lg border border-[var(--copilot-border)] bg-white px-2.5 py-1.5 text-[12px] text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)]"
                />
              </div>
              <div className="min-w-[100px] flex-1">
                <label className="mb-1 block text-[10px] text-[var(--copilot-ink-muted)]">
                  Monto (opcional)
                </label>
                <input
                  type="number"
                  value={promiseAmount}
                  onChange={(e) => setPromiseAmount(e.target.value)}
                  placeholder="0"
                  min={0}
                  className="w-full rounded-lg border border-[var(--copilot-border)] bg-white px-2.5 py-1.5 text-[12px] text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-[var(--copilot-ink-muted)]">
                  Moneda
                </label>
                <select
                  value={promiseCurrency}
                  onChange={(e) => setPromiseCurrency(e.target.value as CollectionCurrency)}
                  className="rounded-lg border border-[var(--copilot-border)] bg-white px-2.5 py-1.5 text-[12px] text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)]"
                >
                  <option value="UYU">$ UYU</option>
                  <option value="USD">U$S USD</option>
                </select>
              </div>
            </div>
          </div>
        ) : null}

        {/* Nota */}
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
            Nota (opcional)
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 1000))}
            placeholder="Ej: prometió pagar el viernes, llamar nuevamente si no responde."
            rows={3}
            className="w-full resize-none rounded-xl border border-[var(--copilot-border)] bg-white px-3 py-2.5 text-[12.5px] text-[var(--copilot-ink)] outline-none placeholder:text-[var(--copilot-ink-muted)]/50 focus:border-[var(--copilot-accent)]"
          />
          {note.length > 900 ? (
            <p className="mt-1 text-right text-[10px] text-[var(--copilot-ink-muted)]/60">
              {note.length}/1000
            </p>
          ) : null}
        </div>

        {/* Próximo seguimiento */}
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
            Próximo seguimiento (opcional)
          </p>
          <input
            type="date"
            value={nextFollowUp}
            onChange={(e) => setNextFollowUp(e.target.value)}
            className="rounded-xl border border-[var(--copilot-border)] bg-white px-3 py-2 text-[12px] text-[var(--copilot-ink)] outline-none focus:border-[var(--copilot-accent)]"
          />
        </div>
      </div>

      {/* Submit */}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--copilot-accent)] px-4 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-50"
        >
          <ClipboardList className="h-3.5 w-3.5" aria-hidden />
          {saving ? "Registrando..." : "Registrar gestión"}
        </button>
        {saved ? (
          <span className="flex items-center gap-1.5 text-[12px] text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            Gestión registrada
          </span>
        ) : null}
        {saveError ? (
          <span className="text-[12px] text-red-600">{saveError}</span>
        ) : null}
      </div>

      {/* History */}
      <div className="mt-5 border-t border-[var(--copilot-border)]/60 pt-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]/70">
          Historial de gestiones
        </p>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="h-6 w-6 shrink-0 animate-pulse rounded-full bg-[var(--copilot-border)]/60" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-32 animate-pulse rounded bg-[var(--copilot-border)]/60" />
                  <div className="h-3 w-48 animate-pulse rounded bg-[var(--copilot-border)]/40" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="text-[12px] text-[var(--copilot-ink-muted)]">
            No se pudieron cargar las gestiones.
          </p>
        ) : actions.length === 0 ? (
          <p className="text-[12.5px] text-[var(--copilot-ink-muted)]">
            Sin gestiones registradas
          </p>
        ) : (
          <div className="divide-y divide-[var(--copilot-border)]/40">
            {actions.slice(0, 20).map((action) => (
              <HistoryItem
                key={action.id}
                action={action}
                onSave={handleHistorySave}
                onDelete={handleHistoryDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
