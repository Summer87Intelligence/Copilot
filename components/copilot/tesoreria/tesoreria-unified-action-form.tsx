"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { CopilotButton } from "@/components/copilot/ui/copilot-button";
import { premiumCardClass } from "@/components/copilot/ui/copilot-visual-system";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import { SCHEDULED_PAYMENT_CATEGORIES } from "@/lib/treasury/treasury-scheduled-payments";
import {
  obligationFormSchema,
  parseMoneyInput,
  zodFieldErrors,
} from "@/lib/treasury/treasury-form-schemas";
import { RECURRING_PAYMENT_CATEGORIES } from "@/lib/treasury/treasury-recurring-payments";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import type { PlannedObligationType, TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";
import type { TesoreriaQuickAction } from "./tesoreria-page-header";
import {
  TESORERIA_FIELD_CLASS,
  TESORERIA_FORM_LABEL_CLASS,
  TESORERIA_SELECT_CLASS,
} from "./tesoreria-ui";

const CURRENCIES: TreasuryCurrencyCode[] = ["UYU", "USD"];

const OBLIGATION_PRESETS: { type: PlannedObligationType; label: string }[] = [
  { type: "dgi", label: "DGI" },
  { type: "bps", label: "BPS" },
  { type: "salary", label: "Sueldos" },
  { type: "supplier", label: "Proveedores" },
  { type: "rent", label: "Alquiler" },
  { type: "loan", label: "Préstamos" },
  { type: "service", label: "Servicios" },
  { type: "other", label: "Otros" },
];

const FORM_META: Record<
  TesoreriaQuickAction,
  { title: string; subtitle: string; submit: string }
> = {
  income: {
    title: "Cargar ingreso",
    subtitle: "Registra plata que entra y afecta la caja disponible.",
    submit: "Registrar ingreso",
  },
  expense: {
    title: "Cargar egreso",
    subtitle: "Registra plata que sale y afecta la caja disponible.",
    submit: "Registrar egreso",
  },
  scheduled: {
    title: "Nuevo pago programado",
    subtitle: "Pago único con fecha futura. No afecta caja hasta confirmarse.",
    submit: "Guardar pago programado",
  },
  recurring: {
    title: "Nuevo pago recurrente",
    subtitle: "Se repite automáticamente según la frecuencia elegida.",
    submit: "Guardar pago recurrente",
  },
};

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function FormShell({
  action,
  onClose,
  children,
  onSubmit,
  saving,
  error,
}: {
  action: TesoreriaQuickAction;
  onClose: () => void;
  children: React.ReactNode;
  onSubmit: () => void;
  saving: boolean;
  error: string | null;
}) {
  const meta = FORM_META[action];
  return (
    <div className={`${premiumCardClass} p-5 sm:p-6`} id="tesoreria-action-form">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-[var(--copilot-ink)]">{meta.title}</p>
          <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">{meta.subtitle}</p>
        </div>
        <CopilotButton type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar formulario">
          <X className="h-4 w-4" />
        </CopilotButton>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
      {error ? <p className="mt-3 text-xs text-[var(--copilot-danger-text)]">{error}</p> : null}
      <div className="mt-5 flex flex-wrap gap-2">
        <CopilotButton type="button" onClick={() => void onSubmit()} disabled={saving}>
          {saving ? "Guardando…" : meta.submit}
        </CopilotButton>
        <CopilotButton type="button" variant="secondary" onClick={onClose} disabled={saving}>
          Cancelar
        </CopilotButton>
      </div>
    </div>
  );
}

function Field({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className={TESORERIA_FORM_LABEL_CLASS}>{label}</span>
      {children}
    </label>
  );
}

export function TesoreriaUnifiedActionForm({
  action,
  workspace,
  onClose,
  onSuccess,
}: {
  action: TesoreriaQuickAction;
  workspace: TreasuryWorkspace;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [income, setIncome] = useState({
    date: todayYmd(),
    amount: "",
    currency: "UYU" as TreasuryCurrencyCode,
    concept: "",
    method: "manual",
    notes: "",
  });

  const [expense, setExpense] = useState({
    date: todayYmd(),
    amount: "",
    currency: "UYU" as TreasuryCurrencyCode,
    concept: "",
    category: "Otros",
    method: "transferencia",
    notes: "",
  });

  const [scheduled, setScheduled] = useState({
    dueDate: todayYmd(),
    amount: "",
    currency: "UYU" as TreasuryCurrencyCode,
    concept: "",
    category: "bps" as PlannedObligationType,
    status: "planned",
    notes: "",
  });

  const [recurring, setRecurring] = useState({
    dayOfMonth: "10",
    frequency: "monthly" as "weekly" | "monthly" | "yearly",
    amount: "",
    currency: "USD" as TreasuryCurrencyCode,
    concept: "",
    category: "Suscripciones",
    startsOn: todayYmd(),
    endsOn: "",
    notes: "",
  });

  const parseAmount = (raw: string) => {
    const n = parseFloat(raw.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const submitIncome = async () => {
    const amount = parseAmount(income.amount);
    if (!amount) {
      setError("El monto debe ser mayor a 0.");
      return;
    }
    if (!income.concept.trim()) {
      setError("El concepto es requerido.");
      return;
    }
    setSaving(true);
    try {
      const notes = [income.method ? `Origen: ${income.method}` : "", income.notes.trim()]
        .filter(Boolean)
        .join(" · ");
      const ok = await workspace.createManual({
        movement_type: "income",
        ledger_type: "cash",
        source: "manual",
        concept: income.concept.trim(),
        amount,
        currency_code: income.currency,
        movement_date: income.date,
        affects_cashflow: true,
        notes: notes || null,
      });
      if (ok) {
        onSuccess?.();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  const submitExpense = async () => {
    const amount = parseAmount(expense.amount);
    if (!amount) {
      setError("El monto debe ser mayor a 0.");
      return;
    }
    if (!expense.concept.trim()) {
      setError("El concepto es requerido.");
      return;
    }
    setSaving(true);
    try {
      const notes = [expense.method ? `Método: ${expense.method}` : "", expense.notes.trim()]
        .filter(Boolean)
        .join(" · ");
      const ok = await workspace.createManual({
        movement_type: "expense",
        ledger_type: "cash",
        source: "manual",
        concept: expense.concept.trim(),
        category: expense.category,
        amount,
        currency_code: expense.currency,
        movement_date: expense.date,
        affects_cashflow: true,
        notes: notes || null,
      });
      if (ok) {
        onSuccess?.();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  const submitScheduled = async () => {
    const parsed = obligationFormSchema.safeParse({
      title: scheduled.concept,
      obligationType: scheduled.category,
      amountEstimated: scheduled.amount,
      currencyCode: scheduled.currency,
      dueDate: scheduled.dueDate,
      recurrence: "none",
      priority: "medium",
      notes: scheduled.notes,
    });
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }
    setSaving(true);
    try {
      const result = await workspace.createObligation({
        title: parsed.data.title,
        obligation_type: parsed.data.obligationType,
        direction: "outflow",
        affects_cashflow: true,
        amount_estimated: parseMoneyInput(parsed.data.amountEstimated),
        currency_code: parsed.data.currencyCode,
        due_date: parsed.data.dueDate,
        recurrence: parsed.data.recurrence,
        priority: parsed.data.priority,
        status: scheduled.status === "confirmed" ? "confirmed" : "planned",
        notes: parsed.data.notes?.trim() || null,
      });
      if (result) {
        onSuccess?.();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  const submitRecurring = async () => {
    const amount = parseAmount(recurring.amount);
    if (!amount) {
      setError("El monto debe ser mayor a 0.");
      return;
    }
    if (!recurring.concept.trim()) {
      setError("El concepto es requerido.");
      return;
    }
    setSaving(true);
    try {
      const res = await copilotApiFetch("/api/copilot/treasury/recurring-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: recurring.concept.trim(),
          category: recurring.category,
          currency: recurring.currency,
          amount,
          recurrence_type:
            recurring.frequency === "yearly"
              ? "yearly"
              : recurring.frequency === "weekly"
                ? "custom"
                : "monthly",
          recurrence_interval: recurring.frequency === "weekly" ? 7 : 1,
          next_occurrence_date: recurring.startsOn,
          metadata: {
            direction: "expense",
            starts_on: recurring.startsOn,
            ends_on: recurring.endsOn.trim() || null,
            day_of_month: recurring.dayOfMonth ? Number(recurring.dayOfMonth) : null,
            frequency: recurring.frequency,
            notes: recurring.notes.trim() || null,
          },
        }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (json?.ok) {
        workspace.notify("success", "Pago recurrente creado.");
        void workspace.refetch();
        onSuccess?.();
        onClose();
      } else {
        setError(json?.message ?? "Error al crear recurrente.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = () => {
    setError(null);
    setFieldErrors({});
    if (action === "income") return void submitIncome();
    if (action === "expense") return void submitExpense();
    if (action === "scheduled") return void submitScheduled();
    return void submitRecurring();
  };

  if (action === "income") {
    return (
      <FormShell action={action} onClose={onClose} onSubmit={handleSubmit} saving={saving} error={error}>
        <Field label="Fecha">
          <input type="date" className={TESORERIA_FIELD_CLASS} value={income.date} onChange={(e) => setIncome((p) => ({ ...p, date: e.target.value }))} />
        </Field>
        <Field label="Monto">
          <input type="number" min="0.01" step="0.01" className={TESORERIA_FIELD_CLASS} value={income.amount} onChange={(e) => setIncome((p) => ({ ...p, amount: e.target.value }))} />
        </Field>
        <Field label="Moneda">
          <select className={TESORERIA_SELECT_CLASS} value={income.currency} onChange={(e) => setIncome((p) => ({ ...p, currency: e.target.value as TreasuryCurrencyCode }))}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Origen / método">
          <select className={TESORERIA_SELECT_CLASS} value={income.method} onChange={(e) => setIncome((p) => ({ ...p, method: e.target.value }))}>
            <option value="manual">Manual</option>
            <option value="transferencia">Transferencia</option>
            <option value="efectivo">Efectivo</option>
            <option value="otro">Otro</option>
          </select>
        </Field>
        <Field label="Concepto" className="sm:col-span-2">
          <input type="text" className={TESORERIA_FIELD_CLASS} value={income.concept} onChange={(e) => setIncome((p) => ({ ...p, concept: e.target.value }))} />
        </Field>
        <Field label="Notas (opcional)" className="sm:col-span-2">
          <textarea rows={2} className={TESORERIA_FIELD_CLASS} value={income.notes} onChange={(e) => setIncome((p) => ({ ...p, notes: e.target.value }))} />
        </Field>
      </FormShell>
    );
  }

  if (action === "expense") {
    return (
      <FormShell action={action} onClose={onClose} onSubmit={handleSubmit} saving={saving} error={error}>
        <Field label="Fecha">
          <input type="date" className={TESORERIA_FIELD_CLASS} value={expense.date} onChange={(e) => setExpense((p) => ({ ...p, date: e.target.value }))} />
        </Field>
        <Field label="Monto">
          <input type="number" min="0.01" step="0.01" className={TESORERIA_FIELD_CLASS} value={expense.amount} onChange={(e) => setExpense((p) => ({ ...p, amount: e.target.value }))} />
        </Field>
        <Field label="Moneda">
          <select className={TESORERIA_SELECT_CLASS} value={expense.currency} onChange={(e) => setExpense((p) => ({ ...p, currency: e.target.value as TreasuryCurrencyCode }))}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Categoría">
          <select className={TESORERIA_SELECT_CLASS} value={expense.category} onChange={(e) => setExpense((p) => ({ ...p, category: e.target.value }))}>
            {SCHEDULED_PAYMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Método">
          <select className={TESORERIA_SELECT_CLASS} value={expense.method} onChange={(e) => setExpense((p) => ({ ...p, method: e.target.value }))}>
            <option value="transferencia">Transferencia</option>
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="otro">Otro</option>
          </select>
        </Field>
        <Field label="Concepto" className="sm:col-span-2">
          <input type="text" className={TESORERIA_FIELD_CLASS} value={expense.concept} onChange={(e) => setExpense((p) => ({ ...p, concept: e.target.value }))} />
        </Field>
        <Field label="Notas (opcional)" className="sm:col-span-2">
          <textarea rows={2} className={TESORERIA_FIELD_CLASS} value={expense.notes} onChange={(e) => setExpense((p) => ({ ...p, notes: e.target.value }))} />
        </Field>
      </FormShell>
    );
  }

  if (action === "scheduled") {
    return (
      <FormShell action={action} onClose={onClose} onSubmit={handleSubmit} saving={saving} error={error}>
        <Field label="Fecha de pago">
          <input type="date" className={TESORERIA_FIELD_CLASS} value={scheduled.dueDate} onChange={(e) => setScheduled((p) => ({ ...p, dueDate: e.target.value }))} />
          {fieldErrors.dueDate ? <span className="mt-1 block text-xs text-[var(--copilot-danger-text)]">{fieldErrors.dueDate}</span> : null}
        </Field>
        <Field label="Monto">
          <input type="number" min="0.01" step="0.01" className={TESORERIA_FIELD_CLASS} value={scheduled.amount} onChange={(e) => setScheduled((p) => ({ ...p, amount: e.target.value }))} />
          {fieldErrors.amountEstimated ? <span className="mt-1 block text-xs text-[var(--copilot-danger-text)]">{fieldErrors.amountEstimated}</span> : null}
        </Field>
        <Field label="Moneda">
          <select className={TESORERIA_SELECT_CLASS} value={scheduled.currency} onChange={(e) => setScheduled((p) => ({ ...p, currency: e.target.value as TreasuryCurrencyCode }))}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Estado">
          <select className={TESORERIA_SELECT_CLASS} value={scheduled.status} onChange={(e) => setScheduled((p) => ({ ...p, status: e.target.value }))}>
            <option value="planned">Pendiente</option>
            <option value="confirmed">Confirmado</option>
          </select>
        </Field>
        <Field label="Categoría">
          <select className={TESORERIA_SELECT_CLASS} value={scheduled.category} onChange={(e) => setScheduled((p) => ({ ...p, category: e.target.value as PlannedObligationType }))}>
            {OBLIGATION_PRESETS.map((p) => (
              <option key={p.type} value={p.type}>{p.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Proveedor / concepto" className="sm:col-span-2">
          <input type="text" className={TESORERIA_FIELD_CLASS} value={scheduled.concept} onChange={(e) => setScheduled((p) => ({ ...p, concept: e.target.value }))} />
          {fieldErrors.title ? <span className="mt-1 block text-xs text-[var(--copilot-danger-text)]">{fieldErrors.title}</span> : null}
        </Field>
        <Field label="Notas (opcional)" className="sm:col-span-2">
          <textarea rows={2} className={TESORERIA_FIELD_CLASS} value={scheduled.notes} onChange={(e) => setScheduled((p) => ({ ...p, notes: e.target.value }))} />
        </Field>
      </FormShell>
    );
  }

  return (
    <FormShell action={action} onClose={onClose} onSubmit={handleSubmit} saving={saving} error={error}>
      <Field label="Día de cobro/pago">
        <input type="number" min="1" max="31" className={TESORERIA_FIELD_CLASS} value={recurring.dayOfMonth} onChange={(e) => setRecurring((p) => ({ ...p, dayOfMonth: e.target.value }))} />
      </Field>
      <Field label="Frecuencia">
        <select className={TESORERIA_SELECT_CLASS} value={recurring.frequency} onChange={(e) => setRecurring((p) => ({ ...p, frequency: e.target.value as "weekly" | "monthly" | "yearly" }))}>
          <option value="monthly">Mensual</option>
          <option value="weekly">Semanal</option>
          <option value="yearly">Anual</option>
        </select>
      </Field>
      <Field label="Monto">
        <input type="number" min="0.01" step="0.01" className={TESORERIA_FIELD_CLASS} value={recurring.amount} onChange={(e) => setRecurring((p) => ({ ...p, amount: e.target.value }))} />
      </Field>
      <Field label="Moneda">
        <select className={TESORERIA_SELECT_CLASS} value={recurring.currency} onChange={(e) => setRecurring((p) => ({ ...p, currency: e.target.value as TreasuryCurrencyCode }))}>
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Categoría">
        <select className={TESORERIA_SELECT_CLASS} value={recurring.category} onChange={(e) => setRecurring((p) => ({ ...p, category: e.target.value }))}>
          {RECURRING_PAYMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Fecha inicio">
        <input type="date" className={TESORERIA_FIELD_CLASS} value={recurring.startsOn} onChange={(e) => setRecurring((p) => ({ ...p, startsOn: e.target.value }))} />
      </Field>
      <Field label="Fecha fin (opcional)">
        <input type="date" className={TESORERIA_FIELD_CLASS} value={recurring.endsOn} onChange={(e) => setRecurring((p) => ({ ...p, endsOn: e.target.value }))} />
      </Field>
      <Field label="Proveedor / concepto" className="sm:col-span-2">
        <input type="text" className={TESORERIA_FIELD_CLASS} value={recurring.concept} onChange={(e) => setRecurring((p) => ({ ...p, concept: e.target.value }))} />
      </Field>
      <Field label="Notas (opcional)" className="sm:col-span-2">
        <textarea rows={2} className={TESORERIA_FIELD_CLASS} value={recurring.notes} onChange={(e) => setRecurring((p) => ({ ...p, notes: e.target.value }))} />
      </Field>
    </FormShell>
  );
}
