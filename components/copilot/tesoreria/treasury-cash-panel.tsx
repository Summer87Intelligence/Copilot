"use client";

import { useEffect, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, CalendarClock, Lock, Pencil, Check, X, Plus } from "lucide-react";

import { copilotApiFetch } from "@/lib/copilot-fetch";
import { formatTreasuryMoney } from "@/lib/treasury/treasury-dashboard";
import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";
import { SCHEDULED_PAYMENT_CATEGORIES } from "@/lib/treasury/treasury-scheduled-payments";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import type { TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";
import {
  dangerFinancialCardClass,
  metricValueClass,
  positiveFinancialCardClass,
  softCalloutClass,
  subtleLabelClass,
} from "@/components/copilot/ui/copilot-visual-system";
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

// ─── Balance card ─────────────────────────────────────────────────────────────

function BalanceCard({
  currency,
  workspace,
}: {
  currency: TreasuryCurrencyCode;
  workspace: TreasuryWorkspace;
}) {
  const { canWrite } = useCopilotPermissions();
  const pos = workspace.cashPositions.find((p) => p.currency === currency);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(String(pos?.openingBalance ?? 0));
    setEditing(true);
  };

  const save = async () => {
    const amount = parseFloat(draft.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) {
      workspace.notify("error", "Monto inválido.");
      return;
    }
    setSaving(true);
    try {
      const res = await copilotApiFetch("/api/copilot/treasury/opening-balances", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency_code: currency, amount }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (json?.ok) {
        workspace.notify("success", `Saldo actual ${currency} actualizado.`);
        setEditing(false);
        void workspace.refetch();
      } else {
        workspace.notify("error", json?.message ?? "Error al guardar saldo.");
      }
    } finally {
      setSaving(false);
    }
  };

  const pureAvailable =
    (pos?.openingBalance ?? 0) +
    (pos?.collectedFromClients ?? 0) +  // post-baseline Zeta receipts
    (pos?.manualIncome ?? 0) -
    (pos?.manualExpense ?? 0) +
    (pos?.adjustments ?? 0) +
    (pos?.transfersNet ?? 0);
  const isNegative = pureAvailable < 0;
  const baselineDate = pos?.baselineDate ?? null;

  return (
    <div
      className={`rounded-2xl border px-4 py-4 shadow-sm transition-shadow ${
        isNegative
          ? dangerFinancialCardClass
          : positiveFinancialCardClass
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              isNegative
                ? "bg-rose-100 text-rose-800"
                : "bg-emerald-100 text-emerald-800"
            }`}
          >
            Caja disponible
          </span>
          <p className={`mt-1.5 text-[12px] ${subtleLabelClass}`}>
            Caja {currency}
          </p>
        </div>
      </div>
      <p
        className={`mt-2 text-2xl sm:text-[28px] ${
          isNegative ? "text-rose-800" : "text-emerald-950"
        } ${metricValueClass}`}
      >
        {pos ? formatTreasuryMoney(pureAvailable, currency) : "—"}
      </p>

      <div className="mt-2 space-y-1 text-[11px] text-[var(--copilot-ink-muted)]">
        <p>
          Saldo cargado al {baselineDate ?? "—"}:{" "}
          {pos ? formatTreasuryMoney(pos.openingBalance, currency) : "—"}
        </p>
        {pos && pos.collectedFromClients > 0 ? (
          <p className="text-emerald-700">
            + Cobros Zeta posteriores: {formatTreasuryMoney(pos.collectedFromClients, currency)}
          </p>
        ) : null}
        {pos && pos.manualIncome > 0 ? (
          <p className="text-emerald-700">+ Ingresos manuales: {formatTreasuryMoney(pos.manualIncome, currency)}</p>
        ) : null}
        {pos && pos.manualExpense > 0 ? (
          <p className="text-rose-700">− Egresos: {formatTreasuryMoney(pos.manualExpense, currency)}</p>
        ) : null}
        {pos && pos.adjustments !== 0 ? (
          <p>Ajustes: {formatTreasuryMoney(pos.adjustments, currency)}</p>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="number"
            min="0"
            step="1"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-32 rounded-lg border border-[var(--copilot-border)] bg-white px-2 py-1.5 text-sm focus:border-[var(--copilot-accent)] focus:outline-none"
            placeholder="0"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-lg bg-[var(--copilot-accent)] px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            <Check className="h-3 w-3" aria-hidden />
            {saving ? "…" : "OK"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-lg border border-[var(--copilot-border)] bg-white/70 px-2.5 py-1.5 text-xs text-[var(--copilot-ink-muted)] hover:bg-white"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </div>
      ) : canWrite ? (
        <button
          type="button"
          onClick={startEdit}
          className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${
            isNegative
              ? "text-rose-700 hover:text-rose-900"
              : "text-emerald-700 hover:text-emerald-900"
          }`}
        >
          <Pencil className="h-3 w-3" aria-hidden />
          Editar saldo actual
        </button>
      ) : null}

      {isNegative ? (
        <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] text-rose-700">
          Caja negativa — revisá movimientos o actualizá el saldo actual.
        </p>
      ) : null}
    </div>
  );
}

// ─── Quick movement form ───────────────────────────────────────────────────────

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
    <div className="rounded-2xl border border-[var(--copilot-border)] bg-white/90 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-[var(--copilot-ink)]">Registrar movimiento</p>
        <button type="button" onClick={onClose} className="text-xs text-[var(--copilot-ink-muted)] hover:underline">
          Cerrar
        </button>
      </div>

      {/* Mode */}
      <div className="mb-3 flex gap-2">
        {(["now", "scheduled"] as MovementMode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => set("mode", m)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              form.mode === m
                ? "bg-[var(--copilot-accent)] text-white"
                : "border border-[var(--copilot-border)] bg-white/70 text-[var(--copilot-ink-muted)] hover:bg-white"
            }`}
          >
            {m === "now" ? "Confirmar ahora" : "Programar"}
          </button>
        ))}
      </div>

      {/* Type (income/expense) */}
      <div className="mb-3 flex gap-2">
        {(["income", "expense"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => set("movementType", t)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              form.movementType === t
                ? t === "income"
                  ? "bg-emerald-600 text-white"
                  : "bg-rose-600 text-white"
                : "border border-[var(--copilot-border)] bg-white/70 text-[var(--copilot-ink-muted)] hover:bg-white"
            }`}
          >
            {t === "income" ? "Ingreso" : "Egreso"}
          </button>
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
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
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
              {SCHEDULED_PAYMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        ) : null}
      </div>

      {isBeforeBaseline ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
          La fecha ingresada es anterior al corte del saldo cargado ({baselineForCurrency}). Este movimiento
          NO afectará la caja — ya está reflejado en el saldo actual.
        </p>
      ) : null}

      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}

      <p className="mt-2 text-[11px] text-[var(--copilot-ink-muted)]">
        {form.mode === "now"
          ? "Este movimiento afectará la caja inmediatamente."
          : "No afecta caja hasta que lo marcás como pagado en Pagos próximos."}
      </p>

      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={saving}
        className="mt-3 w-full rounded-xl bg-[var(--copilot-accent)] py-2 text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90"
      >
        {saving ? "Guardando…" : form.mode === "now" ? "Registrar movimiento" : "Programar pago"}
      </button>
    </div>
  );
}

// ─── Recent movements mini-list ────────────────────────────────────────────────

function isOpeningBalanceProxy(m: { concept: string; metadata: Record<string, unknown> | null }): boolean {
  if (m.metadata?.kind === "opening_balance") return true;
  if (
    m.concept.toLowerCase().trim() === "caja inicial" &&
    typeof m.metadata?.planned_obligation_id === "string"
  )
    return true;
  return false;
}

function RecentMovements({ workspace }: { workspace: TreasuryWorkspace }) {
  const active = workspace.manualMovements
    .filter((m) => m.status === "active" && m.affectsCashflow && !isOpeningBalanceProxy(m))
    .sort((a, b) => {
      if (b.movementDate !== a.movementDate) return b.movementDate.localeCompare(a.movementDate);
      return b.createdAt.localeCompare(a.createdAt);
    })
    .slice(0, 5);

  if (active.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-[var(--copilot-ink-muted)]">Últimos movimientos</p>
      <div className="space-y-1.5">
        {active.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between rounded-xl border border-[var(--copilot-border)] bg-white/70 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-[var(--copilot-ink)]">{m.concept}</p>
              <p className="text-[10px] text-[var(--copilot-ink-muted)]">
                {m.movementDate} · {m.currencyCode}
              </p>
            </div>
            <span
              className={`ml-3 shrink-0 text-sm font-semibold tabular-nums ${
                m.movementType === "income" ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {m.movementType === "income" ? "+" : "−"}
              {formatTreasuryMoney(m.amount, m.currencyCode)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────

function TreasuryMovementGuide({
  onIncome,
  onExpense,
  onScheduled,
}: {
  onIncome: () => void;
  onExpense: () => void;
  onScheduled: () => void;
}) {
  const guides = [
    {
      id: "income",
      label: "Ingreso",
      hint: "Dinero que entra a caja.",
      icon: ArrowUpCircle,
      onClick: onIncome,
    },
    {
      id: "expense",
      label: "Egreso",
      hint: "Gasto o pago que sale de caja.",
      icon: ArrowDownCircle,
      onClick: onExpense,
    },
    {
      id: "scheduled",
      label: "Pago programado",
      hint: "Compromiso para una fecha futura.",
      icon: CalendarClock,
      onClick: onScheduled,
    },
  ] as const;

  return (
    <div className="rounded-2xl border border-[var(--copilot-border)] bg-white/85 p-4 shadow-sm">
      <p className="text-sm font-semibold text-[var(--copilot-ink)]">¿Qué querés registrar?</p>
      <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
        Elegí el tipo de movimiento. Los pagos futuros no afectan caja hasta confirmarse.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {guides.map((g) => {
          const Icon = g.icon;
          return (
            <button
              key={g.id}
              type="button"
              onClick={g.onClick}
              className="flex flex-col items-start gap-1 rounded-xl border border-[var(--copilot-border)] bg-white px-3 py-2.5 text-left transition hover:border-[var(--copilot-accent)]/40 hover:bg-[var(--copilot-accent-soft)]/30"
            >
              <Icon className="h-4 w-4 text-[var(--copilot-accent)]" aria-hidden />
              <span className="text-xs font-semibold text-[var(--copilot-ink)]">{g.label}</span>
              <span className="text-[10px] leading-snug text-[var(--copilot-ink-muted)]">
                {g.hint}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TreasuryCashPanel({ workspace }: { workspace: TreasuryWorkspace }) {
  const { canWrite } = useCopilotPermissions();
  const [showForm, setShowForm] = useState(false);
  const [formPreset, setFormPreset] = useState<Partial<QuickForm> | undefined>(undefined);

  const openForm = (preset: Partial<QuickForm>) => {
    setFormPreset(preset);
    setShowForm(true);
  };

  useEffect(() => {
    if (!showForm) setFormPreset(undefined);
  }, [showForm]);

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
        Este saldo es el dinero disponible que tenés cargado al corte, más cobros y movimientos
        confirmados después de esa fecha.
      </p>

      {canWrite ? (
        <TreasuryMovementGuide
          onIncome={() => openForm({ movementType: "income", mode: "now" })}
          onExpense={() => openForm({ movementType: "expense", mode: "now" })}
          onScheduled={() => openForm({ movementType: "expense", mode: "scheduled" })}
        />
      ) : (
        <div className="rounded-2xl border border-[var(--copilot-border)] bg-white/85 p-4 shadow-sm">
          <p className="text-sm font-semibold text-[var(--copilot-ink)]">¿Qué querés registrar?</p>
          <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
            Elegí el tipo de movimiento. Los pagos futuros no afectan caja hasta confirmarse.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {(
              [
                { id: "income", label: "Ingreso", hint: "Dinero que entra a caja.", icon: ArrowUpCircle },
                { id: "expense", label: "Egreso", hint: "Gasto o pago que sale de caja.", icon: ArrowDownCircle },
                { id: "scheduled", label: "Pago programado", hint: "Compromiso para una fecha futura.", icon: CalendarClock },
              ] as const
            ).map((g) => {
              const Icon = g.icon;
              return (
                <div
                  key={g.id}
                  title="Solo disponible para superadmin."
                  className="flex cursor-not-allowed flex-col items-start gap-1 rounded-xl border border-[var(--copilot-border)] bg-white/60 px-3 py-2.5 opacity-60"
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-4 w-4 text-[var(--copilot-ink-muted)]" aria-hidden />
                    <Lock className="h-3 w-3 text-[var(--copilot-ink-muted)]" aria-hidden />
                  </div>
                  <span className="text-xs font-semibold text-[var(--copilot-ink-muted)]">{g.label}</span>
                  <span className="text-[10px] leading-snug text-[var(--copilot-ink-muted)]">{g.hint}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-[var(--copilot-ink-muted)]">
            Solo superadmin puede registrar movimientos.
          </p>
        </div>
      )}

      {/* Balance cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CURRENCIES.map((currency) => (
          <BalanceCard key={currency} currency={currency} workspace={workspace} />
        ))}
      </div>

      {/* Quick movement — only for superadmin */}
      {canWrite ? showForm ? (
        <QuickMovementForm
          workspace={workspace}
          initial={formPreset}
          onClose={() => setShowForm(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full rounded-2xl border border-dashed border-emerald-200 bg-gradient-to-br from-white to-emerald-50/50 px-4 py-4 text-left shadow-sm transition-colors hover:from-white hover:to-emerald-50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100">
              <Plus className="h-4 w-4 text-emerald-800" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-900">
                Registrar movimiento
              </p>
              <p className="text-[11px] text-[var(--copilot-ink-muted)]">
                Ingreso, egreso o pago programado.
              </p>
            </div>
          </div>
        </button>
      ) : null}

      <RecentMovements workspace={workspace} />

      <div className={softCalloutClass}>
        <p className="text-center text-[11px] text-[var(--copilot-ink-muted)]">
          Tesorería muestra caja disponible. Cartera muestra facturación y deuda de clientes.
        </p>
      </div>
    </div>
  );
}
