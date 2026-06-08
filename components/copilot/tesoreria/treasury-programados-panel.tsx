"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import { formatTreasuryMoney } from "@/lib/treasury/treasury-dashboard";
import { effectivePlannedObligationStatus } from "@/lib/treasury/treasury-obligation-status";
import { SCHEDULED_PAYMENT_CATEGORIES } from "@/lib/treasury/treasury-scheduled-payments";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import type { PlannedCashObligation, TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";
import { TESORERIA_FIELD_CLASS } from "./tesoreria-ui";

const TODAY = () => new Date().toISOString().slice(0, 10);

const STATUS_LABEL: Record<string, string> = {
  planned: "Pendiente",
  confirmed: "Confirmado",
  paid: "Pagado",
  cancelled: "Cancelado",
  overdue: "Vencido",
};

const STATUS_CLS: Record<string, string> = {
  overdue: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  planned: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  confirmed: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  paid: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  cancelled: "bg-[var(--copilot-accent-soft)] text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)]",
};

// ─── New payment form ──────────────────────────────────────────────────────────

function NewPaymentForm({
  workspace,
  onClose,
}: {
  workspace: TreasuryWorkspace;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Otros");
  const [currency, setCurrency] = useState<TreasuryCurrencyCode>("UYU");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(TODAY());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    const amt = parseFloat(amount.replace(",", "."));
    if (!Number.isFinite(amt) || amt <= 0) { setError("El monto debe ser > 0."); return; }
    if (!name.trim()) { setError("El concepto es requerido."); return; }
    if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) { setError("Fecha inválida."); return; }

    setSaving(true);
    try {
      const res = await copilotApiFetch("/api/copilot/treasury/scheduled-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), category, currency, amount: amt, due_date: dueDate, recurrence: "none" }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (json?.ok) {
        workspace.notify("success", "Pago programado creado.");
        void workspace.refetch();
        onClose();
      } else {
        setError(json?.message ?? "Error al crear pago.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/90 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-[var(--copilot-ink)]">Nuevo pago programado</p>
        <button type="button" onClick={onClose} className="text-xs text-[var(--copilot-ink-muted)] hover:underline">Cerrar</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 block">
          <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink-muted)]">Concepto</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={TESORERIA_FIELD_CLASS} placeholder="Ej. DGI IRAE mayo" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink-muted)]">Categoría</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={TESORERIA_FIELD_CLASS}>
            {SCHEDULED_PAYMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink-muted)]">Moneda</span>
          <select value={currency} onChange={(e) => setCurrency(e.target.value as TreasuryCurrencyCode)} className={TESORERIA_FIELD_CLASS}>
            <option value="UYU">UYU</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink-muted)]">Monto</span>
          <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={TESORERIA_FIELD_CLASS} placeholder="0" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink-muted)]">Vencimiento</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={TESORERIA_FIELD_CLASS} />
        </label>
      </div>

      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      <p className="mt-2 text-[11px] text-[var(--copilot-ink-muted)]">
        No afecta caja hasta que lo marcás como pagado.
      </p>
      <button type="button" onClick={() => void save()} disabled={saving} className="mt-3 w-full rounded-xl bg-[var(--copilot-accent)] py-2 text-sm font-semibold text-white disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)] hover:opacity-90">
        {saving ? "Guardando…" : "Crear pago programado"}
      </button>
    </div>
  );
}

// ─── Edit payment form (inline) ────────────────────────────────────────────────

function EditPaymentRow({
  obl,
  workspace,
  onClose,
}: {
  obl: PlannedCashObligation;
  workspace: TreasuryWorkspace;
  onClose: () => void;
}) {
  const [name, setName] = useState(obl.title);
  const [amount, setAmount] = useState(String(obl.amountFinal ?? obl.amountEstimated));
  const [dueDate, setDueDate] = useState(obl.dueDate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    const amt = parseFloat(amount.replace(",", "."));
    if (!Number.isFinite(amt) || amt <= 0) { setError("El monto debe ser > 0."); return; }
    if (!name.trim()) { setError("El concepto es requerido."); return; }
    setSaving(true);
    try {
      const res = await copilotApiFetch(`/api/copilot/treasury/scheduled-payments/${obl.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), amount: amt, due_date: dueDate }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (json?.ok) {
        workspace.notify("success", "Pago actualizado.");
        void workspace.refetch();
        onClose();
      } else {
        setError(json?.message ?? "Error al actualizar.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/60 px-3 py-3">
      <div className="grid grid-cols-3 gap-2">
        <label className="col-span-2 block">
          <span className="mb-1 block text-[11px] font-medium text-[var(--copilot-ink-muted)]">Concepto</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={`${TESORERIA_FIELD_CLASS} text-xs`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-[var(--copilot-ink-muted)]">Monto</span>
          <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${TESORERIA_FIELD_CLASS} text-xs`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-[var(--copilot-ink-muted)]">Vencimiento</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${TESORERIA_FIELD_CLASS} text-xs`} />
        </label>
      </div>
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-[var(--copilot-accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]">
          {saving ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-3 py-1.5 text-xs text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-panel-bg)]">
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Mark paid confirm ─────────────────────────────────────────────────────────

function MarkPaidConfirm({
  obl,
  workspace,
  onClose,
}: {
  obl: PlannedCashObligation;
  workspace: TreasuryWorkspace;
  onClose: () => void;
}) {
  const [amountFinal, setAmountFinal] = useState(String(obl.amountFinal ?? obl.amountEstimated));
  const [registerMovement, setRegisterMovement] = useState(true);
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    const amt = parseFloat(amountFinal.replace(",", "."));
    setSaving(true);
    try {
      const ok = await workspace.paidObligation(obl.id, {
        amountFinal: Number.isFinite(amt) && amt > 0 ? amt : undefined,
        registerCashMovement: registerMovement,
      });
      if (ok) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-emerald-100 bg-emerald-50/60 px-3 py-3">
      <p className="mb-2 text-xs font-semibold text-emerald-900">Marcar como pagado</p>
      <label className="mb-2 block">
        <span className="mb-1 block text-[11px] font-medium text-[var(--copilot-ink-muted)]">Monto final pagado ({obl.currencyCode})</span>
        <input type="number" min="0.01" step="0.01" value={amountFinal} onChange={(e) => setAmountFinal(e.target.value)} className={`${TESORERIA_FIELD_CLASS} w-36 text-xs`} />
      </label>
      <label className="mb-3 flex items-center gap-2 text-xs">
        <input type="checkbox" checked={registerMovement} onChange={(e) => setRegisterMovement(e.target.checked)} className="h-3.5 w-3.5" />
        <span className="text-[var(--copilot-ink)]">Registrar egreso en caja automáticamente</span>
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={() => void confirm()} disabled={saving} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]">
          {saving ? "Marcando…" : "Confirmar pago"}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-3 py-1.5 text-xs text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-panel-bg)]">
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Cancel confirm ────────────────────────────────────────────────────────────

function CancelConfirm({
  obl,
  workspace,
  onClose,
}: {
  obl: PlannedCashObligation;
  workspace: TreasuryWorkspace;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    setSaving(true);
    try {
      await workspace.cancelObligation(obl.id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-amber-100 bg-amber-50/60 px-3 py-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
        <p className="text-xs text-amber-900">
          Se cancelará este pago. No afectará caja y el registro quedará como cancelado.
        </p>
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => void confirm()} disabled={saving} className="rounded-lg border border-amber-200 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]">
          {saving ? "Cancelando…" : "Confirmar cancelación"}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-3 py-1.5 text-xs text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-panel-bg)]">
          No cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Scheduled payment row ─────────────────────────────────────────────────────

function ProgramadoRow({
  obl,
  workspace,
  asOfDate,
}: {
  obl: PlannedCashObligation;
  workspace: TreasuryWorkspace;
  asOfDate: string;
}) {
  const { canWrite } = useCopilotPermissions();
  const [mode, setMode] = useState<"view" | "edit" | "markPaid" | "cancel">("view");
  const effective = effectivePlannedObligationStatus(obl.status, obl.dueDate, asOfDate);
  const statusCls = STATUS_CLS[effective] ?? STATUS_CLS["planned"];
  const amount = obl.amountFinal ?? obl.amountEstimated;
  const isPending = effective !== "paid" && effective !== "cancelled";

  return (
    <li className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/85 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusCls}`}>
              {STATUS_LABEL[effective] ?? effective}
            </span>
            <span className="text-[10px] text-[var(--copilot-ink-muted)]">{obl.currencyCode}</span>
            <span className="text-[10px] text-[var(--copilot-ink-muted)]">Vence: {obl.dueDate}</span>
          </div>
          <p className="mt-0.5 truncate text-xs font-medium text-[var(--copilot-ink)]">{obl.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-bold tabular-nums text-rose-700">
            {formatTreasuryMoney(amount, obl.currencyCode)}
          </span>
          {isPending && canWrite ? (
            <div className="flex gap-1">
              <button type="button" onClick={() => setMode(mode === "markPaid" ? "view" : "markPaid")} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100">
                Pagar
              </button>
              <button type="button" onClick={() => setMode(mode === "edit" ? "view" : "edit")} className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-2 py-1 text-[10px] text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-panel-bg)]">
                Editar
              </button>
              <button type="button" onClick={() => setMode(mode === "cancel" ? "view" : "cancel")} className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-2 py-1 text-[10px] text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-panel-bg)]">
                Cancelar
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {mode === "markPaid" ? (
        <MarkPaidConfirm obl={obl} workspace={workspace} onClose={() => setMode("view")} />
      ) : null}
      {mode === "edit" ? (
        <EditPaymentRow obl={obl} workspace={workspace} onClose={() => setMode("view")} />
      ) : null}
      {mode === "cancel" ? (
        <CancelConfirm obl={obl} workspace={workspace} onClose={() => setMode("view")} />
      ) : null}
    </li>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────

export function TreasuryProgramadosPanel({
  workspace,
  asOfDate,
}: {
  workspace: TreasuryWorkspace;
  asOfDate: string;
}) {
  const { canWrite } = useCopilotPermissions();
  const [showNew, setShowNew] = useState(false);
  const [showPaid, setShowPaid] = useState(false);

  const outflows = useMemo(
    () => workspace.obligations.filter((o) => o.direction === "outflow"),
    [workspace.obligations]
  );

  const pending = useMemo(
    () =>
      outflows
        .filter((o) => {
          const s = effectivePlannedObligationStatus(o.status, o.dueDate, asOfDate);
          return s !== "paid" && s !== "cancelled";
        })
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [outflows, asOfDate]
  );

  const paid = useMemo(
    () =>
      outflows
        .filter((o) => {
          const s = effectivePlannedObligationStatus(o.status, o.dueDate, asOfDate);
          return s === "paid" || s === "cancelled";
        })
        .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
        .slice(0, 20),
    [outflows, asOfDate]
  );

  const loading = workspace.loading && workspace.lastFetchedAt == null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">Pagos programados</h2>
          <p className="text-xs text-[var(--copilot-ink-muted)]">
            Pagos con fecha futura. No afectan caja hasta confirmarse como pagados.
          </p>
        </div>
        {canWrite ? (
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            className="shrink-0 rounded-xl bg-[var(--copilot-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            + Nuevo
          </button>
        ) : null}
      </div>

      {showNew ? (
        <NewPaymentForm workspace={workspace} onClose={() => setShowNew(false)} />
      ) : null}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-[rgba(44,40,37,0.07)]" />
          ))}
        </div>
      ) : (
        <>
          {pending.length === 0 && !showNew ? (
            <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/60 px-4 py-6 text-center">
              <p className="text-sm font-medium text-[var(--copilot-ink)]">Sin pagos programados</p>
              <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
                Programá pagos futuros para verlos en la proyección de caja.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {pending.map((o) => (
                <ProgramadoRow key={o.id} obl={o} workspace={workspace} asOfDate={asOfDate} />
              ))}
            </ul>
          )}

          {paid.length > 0 ? (
            <div>
              <button
                type="button"
                onClick={() => setShowPaid((v) => !v)}
                className="text-xs font-medium text-[var(--copilot-ink-muted)] hover:underline"
              >
                {showPaid ? "Ocultar" : "Ver"} historial ({paid.length})
              </button>
              {showPaid ? (
                <ul className="mt-2 space-y-2">
                  {paid.map((o) => (
                    <ProgramadoRow key={o.id} obl={o} workspace={workspace} asOfDate={asOfDate} />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
