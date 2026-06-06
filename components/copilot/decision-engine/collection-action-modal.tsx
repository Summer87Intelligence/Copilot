"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";

import { copilotApiFetch } from "@/lib/copilot-fetch";
import {
  COLLECTION_API,
  COLLECTION_ACTION_TYPES,
  COLLECTION_PRIORITIES,
  COLLECTION_STATUSES,
  type CollectionActionType,
  type CollectionPriority,
  type CollectionStatus,
} from "@/lib/copilot-collection-types";
import type { RankedClient } from "@/lib/decision-engine/de-types";

type DefaultValues = {
  actionType?: CollectionActionType;
  status?: CollectionStatus;
  notes?: string;
};

type Props = {
  client: RankedClient;
  onClose: () => void;
  onSuccess: () => void;
  defaultValues?: DefaultValues;
};

const ACTION_TYPE_LABELS: Record<CollectionActionType, string> = {
  call:             "Llamada",
  whatsapp:         "WhatsApp",
  email:            "Email",
  meeting:          "Reunión",
  internal_note:    "Nota interna",
  payment_promise:  "Promesa de pago",
  dispute:          "Disputa",
  escalation:       "Escalamiento",
};

const PRIORITY_LABELS: Record<CollectionPriority, string> = {
  low:    "Baja",
  medium: "Media",
  high:   "Alta",
  urgent: "Urgente",
};

const STATUS_LABELS: Record<CollectionStatus, string> = {
  pending_review:   "Pendiente revisión",
  contacted:        "Contactado",
  promised_payment: "Promesa de pago",
  paid:             "Pagado",
  disputed:         "Disputado",
  escalated:        "Escalado",
  paused:           "Pausado",
};

export function CollectionActionModal({ client, onClose, onSuccess, defaultValues }: Props) {
  const [actionType, setActionType] = useState<CollectionActionType>(defaultValues?.actionType ?? "call");
  const [status, setStatus] = useState<CollectionStatus>(defaultValues?.status ?? "contacted");
  const [priority, setPriority] = useState<CollectionPriority>("medium");
  const [notes, setNotes] = useState(defaultValues?.notes ?? "");
  const [contactDate, setContactDate] = useState(new Date().toISOString().split("T")[0]!);
  const [promiseDate, setPromiseDate] = useState("");
  const [promiseAmount, setPromiseAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const showPromiseFields = actionType === "payment_promise";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        company_id:   client.company_id,
        action_type:  actionType,
        status,
        priority,
        notes:        notes.trim() || null,
        contact_date: contactDate || null,
      };

      if (showPromiseFields && promiseDate) {
        body.promise_date     = promiseDate;
        body.promise_amount   = promiseAmount ? Number(promiseAmount) : null;
        body.promise_currency = client.currency_code;
      }

      const res = await copilotApiFetch(COLLECTION_API.create, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(json.message ?? `HTTP ${res.status}`);
      }

      setSaved(true);
      window.setTimeout(() => {
        setSaved(false);
        onSuccess();
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-surface)] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--copilot-border)]">
          <div>
            <p className="text-sm font-semibold text-[var(--copilot-text)]">Registrar acción</p>
            <p className="text-xs text-[var(--copilot-text-muted)] mt-0.5">{client.company_name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--copilot-surface-alt)] transition-colors"
          >
            <X className="h-4 w-4 text-[var(--copilot-text-muted)]" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-[var(--copilot-text-muted)] font-medium">Tipo de acción</label>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value as CollectionActionType)}
                className="w-full rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface)] text-sm px-3 py-2 text-[var(--copilot-text)]"
              >
                {COLLECTION_ACTION_TYPES.map((t) => (
                  <option key={t} value={t}>{ACTION_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[var(--copilot-text-muted)] font-medium">Prioridad</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as CollectionPriority)}
                className="w-full rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface)] text-sm px-3 py-2 text-[var(--copilot-text)]"
              >
                {COLLECTION_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-[var(--copilot-text-muted)] font-medium">Estado</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as CollectionStatus)}
                className="w-full rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface)] text-sm px-3 py-2 text-[var(--copilot-text)]"
              >
                {COLLECTION_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-[var(--copilot-text-muted)] font-medium">Fecha contacto</label>
              <input
                type="date"
                value={contactDate}
                onChange={(e) => setContactDate(e.target.value)}
                className="w-full rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface)] text-sm px-3 py-2 text-[var(--copilot-text)]"
              />
            </div>
          </div>

          {showPromiseFields && (
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-[var(--copilot-surface-alt)] p-3">
              <div className="space-y-1">
                <label className="text-xs text-[var(--copilot-text-muted)] font-medium">Fecha promesa</label>
                <input
                  type="date"
                  value={promiseDate}
                  onChange={(e) => setPromiseDate(e.target.value)}
                  className="w-full rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface)] text-sm px-3 py-2 text-[var(--copilot-text)]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-[var(--copilot-text-muted)] font-medium">Monto ({client.currency_code})</label>
                <input
                  type="number"
                  value={promiseAmount}
                  onChange={(e) => setPromiseAmount(e.target.value)}
                  placeholder="0"
                  min={0}
                  className="w-full rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface)] text-sm px-3 py-2 text-[var(--copilot-text)]"
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs text-[var(--copilot-text-muted)] font-medium">Notas</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Resumen del contacto, acuerdos, obstáculos..."
              className="w-full rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-surface)] text-sm px-3 py-2 text-[var(--copilot-text)] resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded px-3 py-2">
              {error}
            </p>
          )}
          {saved ? (
            <p className="text-xs font-medium text-emerald-600">Gestión registrada</p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-[var(--copilot-text-secondary)] hover:bg-[var(--copilot-surface-alt)] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--copilot-accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-60 transition-opacity"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Guardar acción
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
