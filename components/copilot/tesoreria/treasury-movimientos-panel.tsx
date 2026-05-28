"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { formatTreasuryMoney } from "@/lib/treasury/treasury-dashboard";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import type { ManualCashMovement, TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";
import { TESORERIA_FIELD_CLASS } from "./tesoreria-ui";

type CurrencyFilter = "all" | TreasuryCurrencyCode;
type TypeFilter = "all" | "income" | "expense" | "adjustment";

const TYPE_LABELS: Record<string, string> = {
  income: "Ingreso",
  expense: "Egreso",
  adjustment: "Ajuste",
  transfer: "Transferencia",
};

// ─── Edit row ─────────────────────────────────────────────────────────────────

function EditRow({
  movement,
  workspace,
  onClose,
}: {
  movement: ManualCashMovement;
  workspace: TreasuryWorkspace;
  onClose: () => void;
}) {
  const [concept, setConcept] = useState(movement.concept);
  const [amount, setAmount] = useState(String(movement.amount));
  const [date, setDate] = useState(movement.movementDate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    const amt = parseFloat(amount.replace(",", "."));
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("El monto debe ser mayor a 0.");
      return;
    }
    if (!concept.trim()) {
      setError("El concepto es requerido.");
      return;
    }
    setSaving(true);
    try {
      const result = await workspace.updateManual(movement.id, {
        concept: concept.trim(),
        amount: amt,
        movement_date: date,
      });
      if (result) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-[var(--copilot-border)] bg-[rgba(255,255,255,0.6)] px-3 py-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
        Editando movimiento — este cambio recalcula la caja.
      </p>
      <div className="grid grid-cols-3 gap-2">
        <label className="col-span-2 block">
          <span className="mb-1 block text-[11px] font-medium text-[var(--copilot-ink-muted)]">Concepto</span>
          <input
            type="text"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            className={`${TESORERIA_FIELD_CLASS} text-xs`}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-[var(--copilot-ink-muted)]">Monto</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${TESORERIA_FIELD_CLASS} text-xs`}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-[var(--copilot-ink-muted)]">Fecha</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`${TESORERIA_FIELD_CLASS} text-xs`}
          />
        </label>
      </div>
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-[var(--copilot-accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[var(--copilot-border)] bg-white/70 px-3 py-1.5 text-xs text-[var(--copilot-ink-muted)] hover:bg-white"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Archive confirm ──────────────────────────────────────────────────────────

function ArchiveConfirm({
  movement,
  workspace,
  onClose,
}: {
  movement: ManualCashMovement;
  workspace: TreasuryWorkspace;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    setSaving(true);
    try {
      await workspace.archiveManual(movement.id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-[var(--copilot-border)] bg-amber-50/60 px-3 py-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
        <p className="text-xs text-amber-900">
          Este movimiento dejará de afectar la caja. El registro queda archivado y no se borrará.
        </p>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={saving}
          className="rounded-lg border border-amber-200 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-50 hover:bg-amber-200"
        >
          {saving ? "Anulando…" : "Confirmar anulación"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[var(--copilot-border)] bg-white/70 px-3 py-1.5 text-xs text-[var(--copilot-ink-muted)] hover:bg-white"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Movement row ─────────────────────────────────────────────────────────────

function MovimientoRow({
  movement,
  workspace,
}: {
  movement: ManualCashMovement;
  workspace: TreasuryWorkspace;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "archive">("view");
  const isEditable = movement.source === "manual";

  return (
    <li className="rounded-2xl border border-[var(--copilot-border)] bg-white/85 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                movement.movementType === "income"
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                  : movement.movementType === "expense"
                  ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                  : "bg-sky-50 text-sky-700 ring-1 ring-sky-200"
              }`}
            >
              {TYPE_LABELS[movement.movementType] ?? movement.movementType}
            </span>
            <span className="text-[10px] text-[var(--copilot-ink-muted)]">{movement.currencyCode}</span>
            <span className="text-[10px] text-[var(--copilot-ink-muted)]">{movement.movementDate}</span>
          </div>
          <p className="mt-0.5 truncate text-xs font-medium text-[var(--copilot-ink)]">
            {movement.concept}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`text-sm font-bold tabular-nums ${
              movement.movementType === "income" ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            {movement.movementType === "income" ? "+" : "−"}
            {formatTreasuryMoney(movement.amount, movement.currencyCode)}
          </span>
          {isEditable ? (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setMode(mode === "edit" ? "view" : "edit")}
                className="rounded-lg border border-[var(--copilot-border)] bg-white/70 px-2 py-1 text-[10px] font-medium text-[var(--copilot-ink-muted)] hover:bg-white"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => setMode(mode === "archive" ? "view" : "archive")}
                className="rounded-lg border border-[var(--copilot-border)] bg-white/70 px-2 py-1 text-[10px] font-medium text-[var(--copilot-ink-muted)] hover:bg-white"
              >
                Anular
              </button>
            </div>
          ) : (
            <span className="text-[10px] text-[var(--copilot-ink-muted)]">{movement.source}</span>
          )}
        </div>
      </div>

      {mode === "edit" ? (
        <EditRow movement={movement} workspace={workspace} onClose={() => setMode("view")} />
      ) : null}

      {mode === "archive" ? (
        <ArchiveConfirm movement={movement} workspace={workspace} onClose={() => setMode("view")} />
      ) : null}
    </li>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function TreasuryMovimientosPanel({ workspace }: { workspace: TreasuryWorkspace }) {
  const [currencyFilter, setCurrencyFilter] = useState<CurrencyFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const active = useMemo(() => {
    return workspace.manualMovements
      .filter((m) => m.status === "active")
      .filter((m) => currencyFilter === "all" || m.currencyCode === currencyFilter)
      .filter((m) => typeFilter === "all" || m.movementType === typeFilter)
      .sort((a, b) => b.movementDate.localeCompare(a.movementDate) || b.createdAt.localeCompare(a.createdAt));
  }, [workspace.manualMovements, currencyFilter, typeFilter]);

  const loading = workspace.loading && workspace.lastFetchedAt == null;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">Movimientos de caja</h2>
        <p className="text-xs text-[var(--copilot-ink-muted)]">
          Ingresos y egresos confirmados. Editá o anulá si hubo un error.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {(["all", "UYU", "USD"] as CurrencyFilter[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCurrencyFilter(c)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              currencyFilter === c
                ? "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)] ring-1 ring-[rgba(31,107,74,0.25)]"
                : "bg-white/70 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-white"
            }`}
          >
            {c === "all" ? "Todos" : c}
          </button>
        ))}
        <span className="mx-1 text-[var(--copilot-border)]">·</span>
        {(["all", "income", "expense", "adjustment"] as TypeFilter[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTypeFilter(t)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              typeFilter === t
                ? "bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)] ring-1 ring-[rgba(31,107,74,0.25)]"
                : "bg-white/70 text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)] hover:bg-white"
            }`}
          >
            {t === "all" ? "Todos" : TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-[rgba(44,40,37,0.07)]" />
          ))}
        </div>
      ) : active.length === 0 ? (
        <div className="rounded-xl border border-[var(--copilot-border)] bg-white/60 px-4 py-6 text-center">
          <p className="text-sm font-medium text-[var(--copilot-ink)]">Sin movimientos</p>
          <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
            Los movimientos confirmados aparecen aquí. Registrá uno desde la pestaña Caja.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {active.map((m) => (
            <MovimientoRow key={m.id} movement={m} workspace={workspace} />
          ))}
        </ul>
      )}
    </div>
  );
}
