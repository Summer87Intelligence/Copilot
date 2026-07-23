"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";

import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import {
  copilotCaptionClass,
  copilotInputClass,
} from "@/components/copilot/ui/copilot-visual-system";
import {
  CLIENT_BANK_ALIAS_TYPE_LABELS,
  type ClientBankAlias,
  type ClientBankAliasType,
} from "@/lib/bank-movements/client-bank-aliases";
import {
  BILLING_TYPE_LABELS,
  type BillingType,
  type ClientBillingConcept,
} from "@/lib/bank-movements/client-billing-concepts";

type Props = { companyId: string; canWrite: boolean };

const cardClass =
  "rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-5 shadow-sm";
const rowClass =
  "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--copilot-border)] px-3 py-2";

export function ClientBankIdentitySection({ companyId, canWrite }: Props) {
  return (
    <div className="space-y-4 px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">Identificación bancaria</h2>
        <p className={copilotCaptionClass}>
          Cómo aparece este cliente en el banco, conceptos habituales e historial de movimientos
          asociados. La memoria se deriva de asociaciones activas (no de duplicados ni revocadas).
        </p>
      </div>
      <AliasCard companyId={companyId} canWrite={canWrite} />
      <ConceptCard companyId={companyId} canWrite={canWrite} />
    </div>
  );
}

// ─── Alias bancarios ──────────────────────────────────────────────────────────

type AliasForm = {
  id: string | null;
  alias_text: string;
  alias_type: ClientBankAliasType;
  currency: "" | "UYU" | "USD";
  usual_amount: string;
};

function emptyAliasForm(): AliasForm {
  return { id: null, alias_text: "", alias_type: "bank_name", currency: "", usual_amount: "" };
}

function AliasCard({ companyId, canWrite }: Props) {
  const [items, setItems] = useState<ClientBankAlias[]>([]);
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState<AliasForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/copilot/clients/${companyId}/bank-aliases`);
      const json = (await res.json()) as { ok: boolean; aliases?: ClientBankAlias[] };
      if (json.ok) setItems(json.aliases ?? []);
    } finally {
      setReady(true);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = useCallback(async () => {
    if (!form) return;
    if (form.alias_text.trim().length < 3) {
      setError("El nombre debe tener al menos 3 caracteres.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        alias_text: form.alias_text.trim(),
        alias_type: form.alias_type,
        currency: form.currency || null,
        usual_amount: form.usual_amount ? Number(form.usual_amount) : null,
      };
      const res = await fetch(
        form.id
          ? `/api/copilot/clients/${companyId}/bank-aliases/${form.id}`
          : `/api/copilot/clients/${companyId}/bank-aliases`,
        {
          method: form.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "No se pudo guardar.");
        return;
      }
      setForm(null);
      await load();
    } finally {
      setBusy(false);
    }
  }, [form, companyId, load]);

  const archive = useCallback(
    async (alias: ClientBankAlias) => {
      if (!window.confirm("¿Archivar este nombre bancario?")) return;
      await fetch(`/api/copilot/clients/${companyId}/bank-aliases/${alias.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
      await load();
    },
    [companyId, load]
  );

  return (
    <section className={cardClass}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--copilot-ink)]">Alias bancarios</p>
          <p className={`${copilotCaptionClass} mt-0.5`}>
            Nombres con que llegan los pagos de este cliente al banco.
          </p>
        </div>
        {canWrite && !form ? (
          <button
            type="button"
            onClick={() => setForm(emptyAliasForm())}
            className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
          >
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
            Agregar
          </button>
        ) : null}
      </div>

      {error ? <p className="mb-2 text-xs text-[var(--copilot-danger-text-strong)]">{error}</p> : null}

      {form ? (
        <div className="mb-3 space-y-2 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] p-3">
          <label className="block text-xs">
            <span className="text-[var(--copilot-muted)]">¿Qué nombre aparece en el banco?</span>
            <input
              type="text"
              autoFocus
              value={form.alias_text}
              onChange={(e) => setForm({ ...form, alias_text: e.target.value })}
              placeholder="Ej.: JP SOLUCIONES SAS"
              className={copilotInputClass}
              maxLength={200}
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block text-xs">
              <span className="text-[var(--copilot-muted)]">Tipo</span>
              <select
                value={form.alias_type}
                onChange={(e) => setForm({ ...form, alias_type: e.target.value as ClientBankAliasType })}
                className={copilotInputClass}
              >
                {(["bank_name", "legal_name", "rut", "transfer_reference", "contact_name", "manual"] as ClientBankAliasType[]).map(
                  (t) => (
                    <option key={t} value={t}>
                      {CLIENT_BANK_ALIAS_TYPE_LABELS[t]}
                    </option>
                  )
                )}
              </select>
            </label>
            <label className="block text-xs">
              <span className="text-[var(--copilot-muted)]">Moneda (opcional)</span>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value as AliasForm["currency"] })}
                className={copilotInputClass}
              >
                <option value="">—</option>
                <option value="UYU">UYU</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <label className="block text-xs">
              <span className="text-[var(--copilot-muted)]">Monto habitual (opcional)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.usual_amount}
                onChange={(e) => setForm({ ...form, usual_amount: e.target.value })}
                className={copilotInputClass}
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setForm(null)} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
              Cancelar
            </button>
            <button type="button" disabled={busy} onClick={() => void submit()} className={copilotButtonClassName({ variant: "primary", size: "sm" })}>
              {busy ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      ) : null}

      {!ready ? (
        <p className={copilotCaptionClass}>Cargando…</p>
      ) : items.length === 0 ? (
        <p className={copilotCaptionClass}>Todavía no hay alias bancarios.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((a) => (
            <li key={a.id} className={rowClass}>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--copilot-ink)]">{a.alias_text}</p>
                <p className={copilotCaptionClass}>
                  {CLIENT_BANK_ALIAS_TYPE_LABELS[a.alias_type]}
                  {a.currency ? ` · ${a.currency}` : ""}
                  {a.usual_amount != null ? ` · ${a.usual_amount}` : ""}
                  {a.alias_type === "learned" ? " · aprendido" : ""}
                </p>
              </div>
              {canWrite ? (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label="Editar"
                    onClick={() =>
                      setForm({
                        id: a.id,
                        alias_text: a.alias_text,
                        alias_type: a.alias_type,
                        currency: (a.currency as AliasForm["currency"]) ?? "",
                        usual_amount: a.usual_amount != null ? String(a.usual_amount) : "",
                      })
                    }
                    className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="Archivar"
                    onClick={() => void archive(a)}
                    className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Conceptos habituales ─────────────────────────────────────────────────────

type ConceptForm = {
  id: string | null;
  label: string;
  currency: "UYU" | "USD";
  expected_amount: string;
  billing_type: BillingType;
  frequency: "" | "monthly" | "weekly" | "yearly";
  expected_day: string;
};

function emptyConceptForm(): ConceptForm {
  return {
    id: null,
    label: "",
    currency: "USD",
    expected_amount: "",
    billing_type: "recurring",
    frequency: "monthly",
    expected_day: "",
  };
}

function ConceptCard({ companyId, canWrite }: Props) {
  const [items, setItems] = useState<ClientBillingConcept[]>([]);
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState<ConceptForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/copilot/clients/${companyId}/billing-concepts`);
      const json = (await res.json()) as { ok: boolean; concepts?: ClientBillingConcept[] };
      if (json.ok) setItems(json.concepts ?? []);
    } finally {
      setReady(true);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = useCallback(async () => {
    if (!form) return;
    if (form.label.trim().length < 2) {
      setError("Escribí qué se cobra.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        label: form.label.trim(),
        currency: form.currency,
        expected_amount: form.expected_amount ? Number(form.expected_amount) : null,
        billing_type: form.billing_type,
        frequency: form.frequency || null,
        expected_day: form.expected_day ? Number(form.expected_day) : null,
      };
      const res = await fetch(
        form.id
          ? `/api/copilot/clients/${companyId}/billing-concepts/${form.id}`
          : `/api/copilot/clients/${companyId}/billing-concepts`,
        {
          method: form.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "No se pudo guardar.");
        return;
      }
      setForm(null);
      await load();
    } finally {
      setBusy(false);
    }
  }, [form, companyId, load]);

  const archive = useCallback(
    async (concept: ClientBillingConcept) => {
      if (!window.confirm("¿Archivar este concepto?")) return;
      await fetch(`/api/copilot/clients/${companyId}/billing-concepts/${concept.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
      await load();
    },
    [companyId, load]
  );

  return (
    <section className={cardClass}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--copilot-ink)]">Conceptos habituales de cobro</p>
          <p className={`${copilotCaptionClass} mt-0.5`}>
            Qué se le cobra normalmente a este cliente y por cuánto.
          </p>
        </div>
        {canWrite && !form ? (
          <button
            type="button"
            onClick={() => setForm(emptyConceptForm())}
            className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
          >
            <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
            Agregar
          </button>
        ) : null}
      </div>

      {error ? <p className="mb-2 text-xs text-[var(--copilot-danger-text-strong)]">{error}</p> : null}

      {form ? (
        <div className="mb-3 space-y-2 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] p-3">
          <label className="block text-xs">
            <span className="text-[var(--copilot-muted)]">¿Qué se cobra?</span>
            <input
              type="text"
              autoFocus
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Ej.: Pauta y redes"
              className={copilotInputClass}
              maxLength={120}
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="text-[var(--copilot-muted)]">Monto</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.expected_amount}
                onChange={(e) => setForm({ ...form, expected_amount: e.target.value })}
                className={copilotInputClass}
              />
            </label>
            <label className="block text-xs">
              <span className="text-[var(--copilot-muted)]">Moneda</span>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value as "UYU" | "USD" })}
                className={copilotInputClass}
              >
                <option value="USD">USD</option>
                <option value="UYU">UYU</option>
              </select>
            </label>
            <label className="block text-xs">
              <span className="text-[var(--copilot-muted)]">Tipo</span>
              <select
                value={form.billing_type}
                onChange={(e) => setForm({ ...form, billing_type: e.target.value as BillingType })}
                className={copilotInputClass}
              >
                {(["recurring", "one_time", "installment", "variable"] as BillingType[]).map((t) => (
                  <option key={t} value={t}>
                    {BILLING_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              <span className="text-[var(--copilot-muted)]">Frecuencia</span>
              <select
                value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value as ConceptForm["frequency"] })}
                className={copilotInputClass}
              >
                <option value="">—</option>
                <option value="monthly">Mensual</option>
                <option value="weekly">Semanal</option>
                <option value="yearly">Anual</option>
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setForm(null)} className={copilotButtonClassName({ variant: "ghost", size: "sm" })}>
              Cancelar
            </button>
            <button type="button" disabled={busy} onClick={() => void submit()} className={copilotButtonClassName({ variant: "primary", size: "sm" })}>
              {busy ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      ) : null}

      {!ready ? (
        <p className={copilotCaptionClass}>Cargando…</p>
      ) : items.length === 0 ? (
        <p className={copilotCaptionClass} data-client-billing-concepts-empty>
          No hay suficientes movimientos para identificar un concepto habitual.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((c) => (
            <li key={c.id} className={rowClass}>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--copilot-ink)]">{c.label}</p>
                <p className={copilotCaptionClass}>
                  {c.expected_amount != null ? `${c.currency} ${c.expected_amount}` : c.currency}
                  {" · "}
                  {BILLING_TYPE_LABELS[c.billing_type]}
                  {c.expected_day ? ` · día ${c.expected_day}` : ""}
                  {!c.active ? " · inactivo" : ""}
                </p>
              </div>
              {canWrite ? (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label="Editar"
                    onClick={() =>
                      setForm({
                        id: c.id,
                        label: c.label,
                        currency: c.currency,
                        expected_amount: c.expected_amount != null ? String(c.expected_amount) : "",
                        billing_type: c.billing_type,
                        frequency: (c.frequency as ConceptForm["frequency"]) ?? "",
                        expected_day: c.expected_day != null ? String(c.expected_day) : "",
                      })
                    }
                    className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="Archivar"
                    onClick={() => void archive(c)}
                    className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
