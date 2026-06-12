"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import { formatTreasuryMoney } from "@/lib/treasury/treasury-dashboard";
import { effectivePlannedObligationStatus } from "@/lib/treasury/treasury-obligation-status";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import type { PlannedCashObligation } from "@/lib/treasury/treasury-types";
import { TESORERIA_FIELD_CLASS, TESORERIA_FORM_LABEL_CLASS, TESORERIA_PAYMENT_FIELD } from "./tesoreria-ui";

const STATUS_LABEL: Record<string, string> = {
  planned: "Pendiente",
  confirmed: "Confirmado",
  paid: "Pagado",
  cancelled: "Cancelado",
  overdue: "Vencido",
};

const STATUS_CLS: Record<string, string> = {
  overdue: "bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text)] ring-1 ring-rose-200",
  planned: "bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text)] ring-1 ring-amber-200",
  confirmed: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  paid: "bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text)] ring-1 ring-emerald-200",
  cancelled: "bg-[var(--copilot-accent-soft)] text-[var(--copilot-ink-muted)] ring-1 ring-[var(--copilot-border)]",
};

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
          <span className={TESORERIA_FORM_LABEL_CLASS}>{TESORERIA_PAYMENT_FIELD.concepto}</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={TESORERIA_FIELD_CLASS} />
        </label>
        <label className="block">
          <span className={TESORERIA_FORM_LABEL_CLASS}>{TESORERIA_PAYMENT_FIELD.monto}</span>
          <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={TESORERIA_FIELD_CLASS} />
        </label>
        <label className="block">
          <span className={TESORERIA_FORM_LABEL_CLASS}>{TESORERIA_PAYMENT_FIELD.vencimiento}</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={TESORERIA_FIELD_CLASS} />
        </label>
      </div>
      {error ? <p className="mt-1 text-xs text-[var(--copilot-danger-text)]">{error}</p> : null}
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-[var(--copilot-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--copilot-on-accent)] disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]">
          {saving ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-3 py-1.5 text-xs text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-panel-bg)]">
          Cancelar
        </button>
      </div>
    </div>
  );
}

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
    <div className="border-t border-emerald-100 bg-[var(--copilot-tone-positive-bg)] px-3 py-3">
      <p className="mb-2 text-xs font-semibold text-[var(--copilot-success-text-strong)]">Marcar como pagado</p>
      <label className="mb-2 block">
        <span className={TESORERIA_FORM_LABEL_CLASS}>
          {TESORERIA_PAYMENT_FIELD.monto} final ({obl.currencyCode})
        </span>
        <input type="number" min="0.01" step="0.01" value={amountFinal} onChange={(e) => setAmountFinal(e.target.value)} className={`${TESORERIA_FIELD_CLASS} w-36`} />
      </label>
      <label className="mb-3 flex items-center gap-2 text-xs">
        <input type="checkbox" checked={registerMovement} onChange={(e) => setRegisterMovement(e.target.checked)} className="h-3.5 w-3.5" />
        <span className="text-[var(--copilot-ink)]">Registrar egreso en caja automáticamente</span>
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={() => void confirm()} disabled={saving} className="rounded-lg bg-[var(--copilot-success-button-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--copilot-on-accent)] hover:bg-[var(--copilot-success-button-hover)] disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]">
          {saving ? "Marcando…" : "Confirmar pago"}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-3 py-1.5 text-xs text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-panel-bg)]">
          Cancelar
        </button>
      </div>
    </div>
  );
}

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
    <div className="border-t border-amber-100 bg-[var(--copilot-tone-warning-bg)] px-3 py-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--copilot-warning-text)]" aria-hidden />
        <p className="text-xs text-[var(--copilot-warning-text-strong)]">
          Se cancelará este pago. No afectará caja y el registro quedará como cancelado.
        </p>
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => void confirm()} disabled={saving} className="rounded-lg border border-[var(--copilot-warning-border)] bg-[var(--copilot-badge-warning-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--copilot-warning-text-strong)] disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]">
          {saving ? "Cancelando…" : "Confirmar cancelación"}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-3 py-1.5 text-xs text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-panel-bg)]">
          No cancelar
        </button>
      </div>
    </div>
  );
}

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
    <li className="overflow-hidden rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/85 shadow-sm">
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusCls}`}>
              {STATUS_LABEL[effective] ?? effective}
            </span>
            <span className="text-[10px] text-[var(--copilot-ink-muted)]">{obl.currencyCode}</span>
            <span className="text-[10px] text-[var(--copilot-ink-muted)]">
              {TESORERIA_PAYMENT_FIELD.vencimiento}: {obl.dueDate}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs font-medium text-[var(--copilot-ink)]">{obl.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-bold tabular-nums text-[var(--copilot-danger-text)]">
            {formatTreasuryMoney(amount, obl.currencyCode)}
          </span>
          {isPending && canWrite ? (
            <div className="flex gap-1">
              <button type="button" onClick={() => setMode(mode === "markPaid" ? "view" : "markPaid")} className="rounded-lg border border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] px-2 py-1 text-[10px] font-semibold text-[var(--copilot-success-text)] hover:bg-[var(--copilot-badge-success-bg)]">
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

export function TreasuryProgramadosPanel({
  workspace,
  asOfDate,
  historialOnly = false,
}: {
  workspace: TreasuryWorkspace;
  asOfDate: string;
  historialOnly?: boolean;
}) {
  const [showPaid, setShowPaid] = useState(true);

  const outflows = useMemo(
    () => workspace.obligations.filter((o) => o.direction === "outflow"),
    [workspace.obligations]
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

  if (!historialOnly) {
    return null;
  }

  return (
    <section className="space-y-4">
      <CopilotSectionTitle
        title="Historial"
        subtitle="Pagos pagados o cancelados recientes. No afectan la proyección de caja."
      />

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-[var(--copilot-soft-bg)]" />
          ))}
        </div>
      ) : paid.length === 0 ? (
        <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/60 px-4 py-6 text-center">
          <p className="text-sm font-medium text-[var(--copilot-ink)]">Sin historial reciente</p>
          <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
            Los pagos confirmados o cancelados aparecerán acá.
          </p>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setShowPaid((v) => !v)}
            className="text-xs font-medium text-[var(--copilot-ink-muted)] hover:underline"
          >
            {showPaid ? "Ocultar" : "Ver"} historial ({paid.length})
          </button>
          {showPaid ? (
            <ul className="space-y-2">
              {paid.map((o) => (
                <ProgramadoRow key={o.id} obl={o} workspace={workspace} asOfDate={asOfDate} />
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}
