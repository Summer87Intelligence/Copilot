"use client";

import { useState } from "react";

import { CopilotButton } from "@/components/copilot/ui/copilot-button";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import { SCHEDULED_PAYMENT_CATEGORIES } from "@/lib/treasury/treasury-scheduled-payments";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import type { TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";
import { TESORERIA_FIELD_CLASS } from "./tesoreria-ui";

const CURRENCIES: TreasuryCurrencyCode[] = ["UYU", "USD"];

type MovementMode = "now" | "scheduled";

type QuickForm = {
  movementType: "income" | "expense";
  currency: TreasuryCurrencyCode;
  amount: string;
  concept: string;
  date: string;
  mode: MovementMode;
  category: string;
  dueDate: string;
};

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm(): QuickForm {
  const today = todayYmd();
  return {
    movementType: "expense",
    currency: "UYU",
    amount: "",
    concept: "",
    date: today,
    mode: "now",
    category: "Otros",
    dueDate: today,
  };
}

export function QuickMovementForm({
  workspace,
  onClose,
  initial,
}: {
  workspace: TreasuryWorkspace;
  onClose: () => void;
  initial?: Partial<QuickForm>;
}) {
  const [form, setForm] = useState<QuickForm>(() => ({ ...emptyForm(), ...initial }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof QuickForm>(key: K, value: QuickForm[K]) =>
    setForm((p) => ({ ...p, [key]: value }));

  const baselineForCurrency =
    workspace.cashPositions.find((p) => p.currency === form.currency)?.baselineDate ?? null;
  const isBeforeBaseline =
    form.mode === "now" &&
    baselineForCurrency !== null &&
    form.date < baselineForCurrency;

  const handleSubmit = async () => {
    setError(null);
    const amount = parseFloat(form.amount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("El monto debe ser mayor a 0.");
      return;
    }
    if (!form.concept.trim()) {
      setError("El concepto es requerido.");
      return;
    }
    const date = form.mode === "now" ? form.date : form.dueDate;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("Fecha inválida.");
      return;
    }

    setSaving(true);
    try {
      if (form.mode === "now") {
        const result = await workspace.createManual({
          movement_type: form.movementType,
          ledger_type: "cash",
          source: "manual",
          concept: form.concept.trim(),
          amount,
          currency_code: form.currency,
          movement_date: form.date,
          affects_cashflow: true,
        });
        if (result) onClose();
      } else {
        const res = await copilotApiFetch("/api/copilot/treasury/scheduled-payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.concept.trim(),
            category: form.category,
            currency: form.currency,
            amount,
            due_date: form.dueDate,
            recurrence: "none",
          }),
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
        if (json?.ok) {
          workspace.notify("success", "Pago programado creado.");
          void workspace.refetch();
          onClose();
        } else {
          setError(json?.message ?? "Error al programar pago.");
        }
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-base font-semibold text-[var(--copilot-ink)]">
            {form.movementType === "income" ? "Cargar ingreso" : form.mode === "scheduled" ? "Nuevo pago programado" : "Cargar egreso"}
          </p>
          <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
            {form.mode === "now"
              ? "Afecta la caja inmediatamente."
              : "Pago único con fecha futura. No afecta caja hasta confirmarse."}
          </p>
        </div>
        <CopilotButton type="button" variant="ghost" size="sm" onClick={onClose}>
          Cerrar
        </CopilotButton>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {(["now", "scheduled"] as MovementMode[]).map((m) => (
          <CopilotButton
            key={m}
            type="button"
            variant={form.mode === m ? "primary" : "secondary"}
            size="sm"
            onClick={() => set("mode", m)}
          >
            {m === "now" ? "Confirmar ahora" : "Programar"}
          </CopilotButton>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {(["income", "expense"] as const).map((t) => (
          <CopilotButton
            key={t}
            type="button"
            variant={form.movementType === t ? (t === "income" ? "primary" : "danger") : "secondary"}
            size="sm"
            onClick={() => set("movementType", t)}
          >
            {t === "income" ? "Ingreso" : "Egreso"}
          </CopilotButton>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink-muted)]">Moneda</span>
          <select
            value={form.currency}
            onChange={(e) => set("currency", e.target.value as TreasuryCurrencyCode)}
            className={TESORERIA_FIELD_CLASS}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink-muted)]">Monto</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={form.amount}
            onChange={(e) => set("amount", e.target.value)}
            className={TESORERIA_FIELD_CLASS}
            placeholder="0"
          />
        </label>

        <label className="col-span-2 block">
          <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink-muted)]">Concepto</span>
          <input
            type="text"
            value={form.concept}
            onChange={(e) => set("concept", e.target.value)}
            className={TESORERIA_FIELD_CLASS}
            placeholder="Descripción"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink-muted)]">
            {form.mode === "now" ? "Fecha" : "Vencimiento"}
          </span>
          <input
            type="date"
            value={form.mode === "now" ? form.date : form.dueDate}
            onChange={(e) =>
              form.mode === "now" ? set("date", e.target.value) : set("dueDate", e.target.value)
            }
            className={TESORERIA_FIELD_CLASS}
          />
        </label>

        {form.mode === "scheduled" ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink-muted)]">Categoría</span>
            <select
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              className={TESORERIA_FIELD_CLASS}
            >
              {SCHEDULED_PAYMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {isBeforeBaseline ? (
        <p className="mt-2 rounded-lg bg-[var(--copilot-tone-warning-bg)] px-3 py-2 text-[11px] text-[var(--copilot-warning-text)]">
          La fecha ingresada es anterior al corte del saldo cargado ({baselineForCurrency}). Este movimiento
          NO afectará la caja — ya está reflejado en el saldo actual.
        </p>
      ) : null}

      {error ? <p className="mt-2 text-xs text-[var(--copilot-danger-text)]">{error}</p> : null}

      <CopilotButton
        type="button"
        fullWidth
        className="mt-4"
        onClick={() => void handleSubmit()}
        disabled={saving}
      >
        {saving ? "Guardando…" : form.mode === "now" ? "Registrar movimiento" : "Programar pago"}
      </CopilotButton>
    </div>
  );
}
