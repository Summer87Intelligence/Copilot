"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Loader2, MoreHorizontal, Plus, X } from "lucide-react";

import {
  CopilotBadge,
  CopilotGhostButton,
  CopilotPrimaryButton,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { CopilotEmptyPanel } from "@/components/copilot/copilot-empty-panel";
import {
  TESORERIA_FIELD_CLASS,
  TESORERIA_PAGE_SIZE,
  TESORERIA_TABLE_CLASS,
  TESORERIA_TD_CLASS,
  TESORERIA_TH_CLASS,
} from "@/components/copilot/tesoreria/tesoreria-ui";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import { effectivePlannedObligationStatus } from "@/lib/treasury/treasury-obligation-status";
import { formatTreasuryMoney } from "@/lib/treasury/treasury-dashboard";
import {
  addDaysYmd,
  summarizeScheduledOutflows,
} from "@/lib/treasury/treasury-scheduled-payments";
import {
  obligationFormSchema,
  parseMoneyInput,
  zodFieldErrors,
} from "@/lib/treasury/treasury-form-schemas";
import { isRecurringGeneratedObligation } from "@/lib/treasury/treasury-recurring-payments";
import type { PlannedCashObligation, PlannedObligationType } from "@/lib/treasury/treasury-types";
import {
  buildDueStatusLabelWithTime,
  buildMetaWithDueTime,
  formatDueWithTime,
  getDueTime,
  getTreasuryPaymentActionsByStatus,
} from "@/lib/treasury/treasury-obligation-actions";

// ─── Local helpers ───────────────────────────────────────────────────────────

function currentHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

// ─── Constants ───────────────────────────────────────────────────────────────

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

function obligationCategoryLabel(row: PlannedCashObligation): string {
  const recurring = row.metadata?.recurring_category;
  if (typeof recurring === "string" && recurring.trim()) {
    return `${recurring.trim()} / ${row.obligationType}`;
  }
  const preset = OBLIGATION_PRESETS.find((p) => p.type === row.obligationType);
  return preset?.label ?? row.obligationType;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ObligationView = "next7" | "next30" | "overdue" | "all";

type ActiveModal =
  | { kind: "pay"; row: PlannedCashObligation }
  | { kind: "edit"; row: PlannedCashObligation }
  | { kind: "reschedule"; row: PlannedCashObligation }
  | { kind: "cancel"; row: PlannedCashObligation }
  | { kind: "delete"; row: PlannedCashObligation }
  | null;

type Props = {
  workspace: TreasuryWorkspace;
  asOfDate: string;
};

// ─── BaseModal ───────────────────────────────────────────────────────────────

function BaseModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-[var(--copilot-card)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--copilot-border)] px-5 py-4">
          <h3 className="text-base font-semibold text-[var(--copilot-ink)]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--copilot-ink-muted)] transition hover:bg-[rgba(44,40,37,0.06)] hover:text-[var(--copilot-ink)]"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// ─── PayModal ─────────────────────────────────────────────────────────────────

function PayModal({
  row,
  asOfDate,
  workspace,
  onClose,
}: {
  row: PlannedCashObligation;
  asOfDate: string;
  workspace: TreasuryWorkspace;
  onClose: () => void;
}) {
  const defaultAmount = String(row.amountFinal ?? row.amountEstimated);
  const [amountFinal, setAmountFinal] = useState(defaultAmount);
  const [registerCashMovement, setRegisterCashMovement] = useState(true);
  const [saving, setSaving] = useState(false);

  const parsedAmount = parseFloat(amountFinal);
  const validAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validAmount) return;
    setSaving(true);
    const originalAmount = row.amountFinal ?? row.amountEstimated;
    const ok = await workspace.paidObligation(row.id, {
      amountFinal: parsedAmount !== originalAmount ? parsedAmount : undefined,
      registerCashMovement,
    });
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <BaseModal title="Confirmar pago" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <dl className="space-y-1.5 rounded-xl bg-[var(--copilot-bg,#f5f4f2)] px-4 py-3 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--copilot-ink-muted)]">Concepto</dt>
            <dd className="max-w-[55%] text-right font-medium text-[var(--copilot-ink)]">
              {row.title}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--copilot-ink-muted)]">Categoría</dt>
            <dd className="text-[var(--copilot-ink)]">{obligationCategoryLabel(row)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--copilot-ink-muted)]">Moneda</dt>
            <dd className="text-[var(--copilot-ink)]">{row.currencyCode}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--copilot-ink-muted)]">Vencimiento</dt>
            <dd className="tabular-nums text-[var(--copilot-ink)]">
              {formatDueWithTime(row.dueDate, getDueTime(row))}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--copilot-ink-muted)]">Fecha de pago</dt>
            <dd className="tabular-nums text-[var(--copilot-ink)]">{asOfDate}</dd>
          </div>
        </dl>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-[var(--copilot-ink)]">
            Monto final ({row.currencyCode})
          </span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            className={TESORERIA_FIELD_CLASS}
            value={amountFinal}
            onChange={(e) => setAmountFinal(e.target.value)}
            required
          />
          <span className="mt-1 block text-xs text-[var(--copilot-ink-muted)]">
            Modificá si el monto real difiere del estimado.
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded accent-[var(--copilot-accent)]"
            checked={registerCashMovement}
            onChange={(e) => setRegisterCashMovement(e.target.checked)}
          />
          <span className="text-sm">
            <span className="font-medium text-[var(--copilot-ink)]">Registrar egreso en caja</span>
            <span className="mt-0.5 block text-xs text-[var(--copilot-ink-muted)]">
              Si está activo, este pago bajará la caja disponible.
            </span>
          </span>
        </label>

        {validAmount && registerCashMovement ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            Impacto estimado en caja:{" "}
            <span className="font-semibold tabular-nums">
              −{formatTreasuryMoney(parsedAmount, row.currencyCode)}
            </span>
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <CopilotGhostButton type="button" onClick={onClose} disabled={saving}>
            Cancelar
          </CopilotGhostButton>
          <CopilotPrimaryButton type="submit" disabled={saving || !validAmount}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar pago"}
          </CopilotPrimaryButton>
        </div>
      </form>
    </BaseModal>
  );
}

// ─── EditModal ────────────────────────────────────────────────────────────────

function EditModal({
  row,
  workspace,
  onClose,
}: {
  row: PlannedCashObligation;
  workspace: TreasuryWorkspace;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(row.title);
  const [obligationType, setObligationType] = useState<PlannedObligationType>(row.obligationType);
  const [amountEstimated, setAmountEstimated] = useState(String(row.amountEstimated));
  const [currencyCode, setCurrencyCode] = useState<"UYU" | "USD">(row.currencyCode as "UYU" | "USD");
  const [dueDate, setDueDate] = useState(row.dueDate);
  const [dueTime, setDueTime] = useState(getDueTime(row) ?? "");
  const [notes, setNotes] = useState(row.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const parsedAmount = parseFloat(amountEstimated);
  const validAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("El título es requerido."); return; }
    if (!validAmount) { setError("El monto debe ser mayor a 0."); return; }
    if (!dueDate) { setError("La fecha de vencimiento es requerida."); return; }
    setError("");
    setSaving(true);
    const result = await workspace.updateObligation(row.id, {
      title: title.trim(),
      obligation_type: obligationType,
      amount_estimated: parsedAmount,
      currency_code: currencyCode,
      due_date: dueDate,
      notes: notes.trim() || null,
      metadata: buildMetaWithDueTime(row.metadata as Record<string, unknown> | null, dueTime || null),
    });
    setSaving(false);
    if (result !== null) onClose();
  }

  return (
    <BaseModal title="Editar pago" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-[var(--copilot-ink)]">Título</span>
          <input
            className={TESORERIA_FIELD_CLASS}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-[var(--copilot-ink)]">Categoría</span>
          <select
            className={TESORERIA_FIELD_CLASS}
            value={obligationType}
            onChange={(e) => setObligationType(e.target.value as PlannedObligationType)}
          >
            {OBLIGATION_PRESETS.map((p) => (
              <option key={p.type} value={p.type}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-[var(--copilot-ink)]">Monto</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              className={TESORERIA_FIELD_CLASS}
              value={amountEstimated}
              onChange={(e) => setAmountEstimated(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-[var(--copilot-ink)]">Moneda</span>
            <select
              className={TESORERIA_FIELD_CLASS}
              value={currencyCode}
              onChange={(e) => setCurrencyCode(e.target.value as "UYU" | "USD")}
            >
              <option value="UYU">UYU</option>
              <option value="USD">USD</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-[var(--copilot-ink)]">Vencimiento</span>
            <input
              type="date"
              className={TESORERIA_FIELD_CLASS}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-[var(--copilot-ink)]">Hora (opcional)</span>
            <input
              type="time"
              className={TESORERIA_FIELD_CLASS}
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-[var(--copilot-ink)]">Notas</span>
          <textarea
            className={TESORERIA_FIELD_CLASS}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        {error ? (
          <p className="text-xs text-rose-700" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <CopilotGhostButton type="button" onClick={onClose} disabled={saving}>
            Cancelar
          </CopilotGhostButton>
          <CopilotPrimaryButton type="submit" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar cambios"}
          </CopilotPrimaryButton>
        </div>
      </form>
    </BaseModal>
  );
}

// ─── RescheduleModal ──────────────────────────────────────────────────────────

function RescheduleModal({
  row,
  workspace,
  onClose,
}: {
  row: PlannedCashObligation;
  workspace: TreasuryWorkspace;
  onClose: () => void;
}) {
  const [newDate, setNewDate] = useState(row.dueDate);
  const [newDueTime, setNewDueTime] = useState(getDueTime(row) ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isRecurring = isRecurringGeneratedObligation(row);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newDate) { setError("La nueva fecha es requerida."); return; }
    if (newDate === row.dueDate) { setError("La nueva fecha debe ser distinta a la actual."); return; }
    setError("");
    setSaving(true);
    const result = await workspace.updateObligation(row.id, {
      due_date: newDate,
      metadata: buildMetaWithDueTime(row.metadata as Record<string, unknown> | null, newDueTime || null),
    });
    setSaving(false);
    if (result !== null) onClose();
  }

  return (
    <BaseModal title="Reprogramar pago" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {isRecurring ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Este pago fue generado por una regla recurrente. Reprogramarlo solo afecta esta instancia.
          </div>
        ) : null}

        <dl className="space-y-1.5 rounded-xl bg-[var(--copilot-bg,#f5f4f2)] px-4 py-3 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--copilot-ink-muted)]">Concepto</dt>
            <dd className="font-medium text-[var(--copilot-ink)]">{row.title}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--copilot-ink-muted)]">Monto</dt>
            <dd className="tabular-nums text-[var(--copilot-ink)]">
              {formatTreasuryMoney(row.amountEstimated, row.currencyCode)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[var(--copilot-ink-muted)]">Vencimiento actual</dt>
            <dd className="tabular-nums text-rose-700">{row.dueDate}</dd>
          </div>
        </dl>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-[var(--copilot-ink)]">Nueva fecha</span>
            <input
              type="date"
              className={TESORERIA_FIELD_CLASS}
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-[var(--copilot-ink)]">Hora (opcional)</span>
            <input
              type="time"
              className={TESORERIA_FIELD_CLASS}
              value={newDueTime}
              onChange={(e) => setNewDueTime(e.target.value)}
            />
          </label>
        </div>

        {error ? (
          <p className="text-xs text-rose-700" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <CopilotGhostButton type="button" onClick={onClose} disabled={saving}>
            Cancelar
          </CopilotGhostButton>
          <CopilotPrimaryButton type="submit" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reprogramar"}
          </CopilotPrimaryButton>
        </div>
      </form>
    </BaseModal>
  );
}

// ─── CancelModal ──────────────────────────────────────────────────────────────

function CancelModal({
  row,
  workspace,
  onClose,
}: {
  row: PlannedCashObligation;
  workspace: TreasuryWorkspace;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    setSaving(true);
    const result = await workspace.cancelObligation(row.id);
    setSaving(false);
    if (result !== null) onClose();
  }

  return (
    <BaseModal title="Cancelar pago" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm font-medium text-[var(--copilot-ink)]">{row.title}</p>
        <p className="text-sm text-[var(--copilot-ink-muted)]">
          Cancelar este pago lo quitará de las próximas obligaciones, pero{" "}
          <strong className="text-[var(--copilot-ink)]">no registrará movimiento de caja</strong>.
        </p>
        <div className="flex justify-end gap-2">
          <CopilotGhostButton type="button" onClick={onClose} disabled={saving}>
            No, volver
          </CopilotGhostButton>
          <CopilotPrimaryButton
            type="button"
            className="!bg-rose-700 hover:!bg-rose-800"
            onClick={handleConfirm}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sí, cancelar"}
          </CopilotPrimaryButton>
        </div>
      </div>
    </BaseModal>
  );
}

// ─── DeleteModal ──────────────────────────────────────────────────────────────

function DeleteModal({
  row,
  workspace,
  onClose,
}: {
  row: PlannedCashObligation;
  workspace: TreasuryWorkspace;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    setSaving(true);
    const ok = await workspace.deleteScheduledPayment(row.id);
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <BaseModal title="Eliminar registro" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm font-medium text-[var(--copilot-ink)]">{row.title}</p>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Eliminar este registro no debe usarse para pagos reales ya ejecutados. Si el pago
          ocurrió, preferí <strong>Cancelar</strong> en vez de Eliminar.
        </div>
        <div className="flex justify-end gap-2">
          <CopilotGhostButton type="button" onClick={onClose} disabled={saving}>
            Cancelar
          </CopilotGhostButton>
          <CopilotPrimaryButton
            type="button"
            className="!bg-rose-700 hover:!bg-rose-800"
            onClick={handleConfirm}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Eliminar registro"}
          </CopilotPrimaryButton>
        </div>
      </div>
    </BaseModal>
  );
}

// ─── RowActionsCell ───────────────────────────────────────────────────────────

function RowActionsCell({
  row,
  asOfDate,
  onAction,
}: {
  row: PlannedCashObligation;
  asOfDate: string;
  onAction: (modal: ActiveModal) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const effective = effectivePlannedObligationStatus(row.status, row.dueDate, asOfDate);
  const actions = getTreasuryPaymentActionsByStatus(effective);

  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        menuRef.current && !menuRef.current.contains(target) &&
        triggerRef.current && !triggerRef.current.contains(target)
      ) {
        setMenuOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  function handleToggleMenu() {
    if (menuOpen) { setMenuOpen(false); return; }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setMenuOpen(true);
  }

  const menuItems: { label: string; onClick: () => void; danger?: boolean }[] = [];
  if (actions.canCancel) {
    menuItems.push({
      label: "Cancelar pago",
      onClick: () => onAction({ kind: "cancel", row }),
    });
  }
  menuItems.push({
    label: "Eliminar registro",
    onClick: () => onAction({ kind: "delete", row }),
    danger: true,
  });

  return (
    <div className="flex items-center gap-2">
      {actions.canPay ? (
        <CopilotPrimaryButton
          type="button"
          className="!py-1 !text-xs"
          onClick={() => onAction({ kind: "pay", row })}
        >
          Pagar
        </CopilotPrimaryButton>
      ) : null}

      {actions.canEdit ? (
        <CopilotGhostButton
          type="button"
          className="!py-1 !text-xs"
          onClick={() => onAction({ kind: "edit", row })}
        >
          Editar
        </CopilotGhostButton>
      ) : null}

      {actions.canReschedule ? (
        <CopilotGhostButton
          type="button"
          className="!py-1 !text-xs"
          onClick={() => onAction({ kind: "reschedule", row })}
        >
          Reprogramar
        </CopilotGhostButton>
      ) : null}

      {/* Trigger wrapper: ref used for position calculation */}
      <div ref={triggerRef} className="inline-flex">
        <CopilotGhostButton
          type="button"
          className="!p-1.5"
          onClick={handleToggleMenu}
          aria-label="Más acciones"
          aria-expanded={menuOpen}
        >
          <MoreHorizontal className="h-4 w-4" />
        </CopilotGhostButton>
      </div>

      {/* Fixed dropdown: escapes overflow-x-auto table container */}
      {menuOpen && menuPos ? (
        <div
          ref={menuRef}
          className="fixed z-[80] min-w-[160px] overflow-hidden rounded-xl border border-[var(--copilot-border)] bg-white shadow-lg"
          style={{ top: menuPos.top, right: menuPos.right }}
        >
          {menuItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                setMenuOpen(false);
                item.onClick();
              }}
              className={`block w-full px-4 py-2.5 text-left text-sm transition hover:bg-[rgba(44,40,37,0.04)] ${
                item.danger ? "text-rose-700" : "text-[var(--copilot-ink)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function TreasuryObligationsPanel({ workspace, asOfDate }: Props) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ObligationView>("next30");
  const [page, setPage] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [form, setForm] = useState({
    title: "",
    obligationType: "bps" as PlannedObligationType,
    amountEstimated: "",
    currencyCode: "UYU" as "UYU" | "USD",
    dueDate: new Date().toISOString().slice(0, 10),
    dueTime: "",
    recurrence: "none",
    priority: "medium",
    notes: "",
  });

  const horizonEnd = addDaysYmd(asOfDate, 30);
  const summaries = useMemo(() => {
    const paidObligations = workspace.obligations.filter(
      (o) => effectivePlannedObligationStatus(o.status, o.dueDate, asOfDate) === "paid"
    );
    return summarizeScheduledOutflows(
      [...workspace.overdue, ...workspace.upcoming30, ...paidObligations],
      { asOfDate, horizonEndDate: horizonEnd }
    );
  }, [workspace.overdue, workspace.upcoming30, workspace.obligations, asOfDate, horizonEnd]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let base = workspace.obligations;
    if (view === "next7") base = workspace.upcoming7;
    else if (view === "next30") base = workspace.upcoming30;
    else if (view === "overdue") base = workspace.overdue;
    return base.filter((o) => {
      if (!q) return true;
      return (
        o.title.toLowerCase().includes(q) || (o.notes ?? "").toLowerCase().includes(q)
      );
    });
  }, [workspace.obligations, workspace.upcoming7, workspace.upcoming30, workspace.overdue, search, view]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / TESORERIA_PAGE_SIZE));
  const pageItems = filtered.slice(page * TESORERIA_PAGE_SIZE, (page + 1) * TESORERIA_PAGE_SIZE);

  function statusBadgeTone(
    row: PlannedCashObligation
  ): "danger" | "warning" | "success" | "neutral" {
    const s = effectivePlannedObligationStatus(row.status, row.dueDate, asOfDate);
    if (s === "overdue") return "danger";
    if (s === "paid") return "success";
    if (s === "cancelled") return "neutral";
    const dueTime = getDueTime(row);
    if (dueTime && row.dueDate === asOfDate) {
      return currentHHMM() >= dueTime ? "danger" : "warning";
    }
    return "neutral";
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const parsed = obligationFormSchema.safeParse({
      title: form.title,
      obligationType: form.obligationType,
      amountEstimated: form.amountEstimated,
      currencyCode: form.currencyCode,
      dueDate: form.dueDate,
      recurrence: form.recurrence,
      priority: form.priority,
      notes: form.notes,
    });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setSaving(true);
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
      notes: parsed.data.notes?.trim() || null,
      metadata: buildMetaWithDueTime(null, form.dueTime || null),
    });
    setSaving(false);
    if (result) {
      setDrawerOpen(false);
      setErrors({});
      setForm({
        title: "",
        obligationType: "bps",
        amountEstimated: "",
        currencyCode: "UYU",
        dueDate: new Date().toISOString().slice(0, 10),
        dueTime: "",
        recurrence: "none",
        priority: "medium",
        notes: "",
      });
    }
  }

  return (
    <section className="space-y-4">
      <CopilotSectionTitle
        title="Pagos futuros"
        subtitle="Egresos programados por moneda: impuestos, sueldos, proveedores y más."
        action={
          <CopilotPrimaryButton type="button" onClick={() => setDrawerOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo pago
          </CopilotPrimaryButton>
        }
      />

      {/* KPI cards by currency */}
      <div className="grid gap-3 sm:grid-cols-2">
        {summaries.map((s) => (
          <div
            key={s.currency}
            className="rounded-xl border border-[var(--copilot-border)] bg-white/70 p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              {s.currency}
            </p>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--copilot-ink-muted)]">Egresos próx. 30 días</dt>
                <dd className="font-semibold tabular-nums text-[var(--copilot-ink)]">
                  {formatTreasuryMoney(s.next30Days, s.currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--copilot-ink-muted)]">Vencidos</dt>
                <dd className="font-semibold tabular-nums text-rose-700">
                  {formatTreasuryMoney(s.overdue, s.currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--copilot-ink-muted)]">Pagados del período</dt>
                <dd className="font-semibold tabular-nums text-emerald-700">
                  {formatTreasuryMoney(s.paidInPeriod, s.currency)}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      {/* View filter tabs */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["next7", "Próximos 7 días"],
            ["next30", "Próximos 30 días"],
            ["overdue", "Vencidos"],
            ["all", "Todos"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setView(id);
              setPage(0);
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              view === id
                ? "bg-[var(--copilot-accent)] text-white"
                : "border border-[var(--copilot-border)] bg-white text-[var(--copilot-ink-muted)] hover:bg-[rgba(44,40,37,0.03)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(0);
        }}
        placeholder="Buscar título o notas"
        className={TESORERIA_FIELD_CLASS}
        aria-label="Buscar obligaciones"
      />

      {workspace.loading && workspace.obligations.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando obligaciones…
        </div>
      ) : filtered.length === 0 ? (
        <CopilotEmptyPanel
          title="Sin obligaciones"
          paragraphs={["Planificá BPS, impuestos, sueldos y otros compromisos de caja."]}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--copilot-border)] bg-white/50">
          <table className={TESORERIA_TABLE_CLASS}>
            <thead>
              <tr>
                <th className={TESORERIA_TH_CLASS}>Título</th>
                <th className={TESORERIA_TH_CLASS}>Tipo</th>
                <th className={TESORERIA_TH_CLASS}>Monto</th>
                <th className={TESORERIA_TH_CLASS}>Vence</th>
                <th className={TESORERIA_TH_CLASS}>Estado</th>
                <th className={TESORERIA_TH_CLASS}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((row) => (
                <tr key={row.id}>
                  <td className={TESORERIA_TD_CLASS}>
                    <span>{row.title}</span>
                    {isRecurringGeneratedObligation(row) ? (
                      <span className="ml-2 inline-block">
                        <CopilotBadge tone="neutral">Recurrente</CopilotBadge>
                      </span>
                    ) : null}
                  </td>
                  <td className={TESORERIA_TD_CLASS}>{obligationCategoryLabel(row)}</td>
                  <td className={`${TESORERIA_TD_CLASS} tabular-nums`}>
                    {formatTreasuryMoney(row.amountEstimated, row.currencyCode)}
                  </td>
                  <td className={`${TESORERIA_TD_CLASS} tabular-nums`}>
                    {formatDueWithTime(row.dueDate, getDueTime(row))}
                  </td>
                  <td className={TESORERIA_TD_CLASS}>
                    <CopilotBadge tone={statusBadgeTone(row)}>
                      {buildDueStatusLabelWithTime(
                        effectivePlannedObligationStatus(row.status, row.dueDate, asOfDate),
                        row.dueDate,
                        asOfDate,
                        getDueTime(row),
                        currentHHMM()
                      )}
                    </CopilotBadge>
                  </td>
                  <td className={TESORERIA_TD_CLASS}>
                    <RowActionsCell
                      row={row}
                      asOfDate={asOfDate}
                      onAction={setActiveModal}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > TESORERIA_PAGE_SIZE ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--copilot-ink-muted)]">
            Página {page + 1} de {pageCount}
          </span>
          <div className="flex gap-2">
            <CopilotGhostButton
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </CopilotGhostButton>
            <CopilotGhostButton
              type="button"
              disabled={page + 1 >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </CopilotGhostButton>
          </div>
        </div>
      ) : null}

      {/* Create drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30">
          <div className="h-full w-full max-w-lg overflow-y-auto bg-[var(--copilot-card)] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--copilot-ink)]">Nueva obligación</h3>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg p-1 text-[var(--copilot-ink-muted)] hover:bg-[rgba(44,40,37,0.06)]"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form className="space-y-3" onSubmit={handleCreate}>
              <label className="block text-sm">
                Plantilla
                <select
                  className={TESORERIA_FIELD_CLASS}
                  value={form.obligationType}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      obligationType: e.target.value as PlannedObligationType,
                      title:
                        f.title || OBLIGATION_PRESETS.find((p) => p.type === e.target.value)?.label || "",
                    }))
                  }
                >
                  {OBLIGATION_PRESETS.map((p) => (
                    <option key={p.type} value={p.type}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Título
                <input
                  className={TESORERIA_FIELD_CLASS}
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  required
                />
                {errors.title ? (
                  <span className="mt-1 block text-xs text-rose-700" role="alert">
                    {errors.title}
                  </span>
                ) : null}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  Monto estimado
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={TESORERIA_FIELD_CLASS}
                    value={form.amountEstimated}
                    onChange={(e) => setForm((f) => ({ ...f, amountEstimated: e.target.value }))}
                    required
                  />
                </label>
                <label className="block text-sm">
                  Moneda
                  <select
                    className={TESORERIA_FIELD_CLASS}
                    value={form.currencyCode}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, currencyCode: e.target.value as "UYU" | "USD" }))
                    }
                  >
                    <option value="UYU">UYU</option>
                    <option value="USD">USD</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  Vencimiento
                  <input
                    type="date"
                    className={TESORERIA_FIELD_CLASS}
                    value={form.dueDate}
                    onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                    required
                  />
                </label>
                <label className="block text-sm">
                  Hora (opcional)
                  <input
                    type="time"
                    className={TESORERIA_FIELD_CLASS}
                    value={form.dueTime}
                    onChange={(e) => setForm((f) => ({ ...f, dueTime: e.target.value }))}
                  />
                </label>
              </div>
              <label className="block text-sm">
                Recurrencia
                <select
                  className={TESORERIA_FIELD_CLASS}
                  value={form.recurrence}
                  onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value }))}
                >
                  <option value="none">Ninguna</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensual</option>
                  <option value="quarterly">Trimestral</option>
                  <option value="yearly">Anual</option>
                </select>
              </label>
              <label className="block text-sm">
                Prioridad
                <select
                  className={TESORERIA_FIELD_CLASS}
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                >
                  <option value="low">Baja</option>
                  <option value="medium">Media</option>
                  <option value="high">Alta</option>
                  <option value="critical">Crítica</option>
                </select>
              </label>
              <label className="block text-sm">
                Notas
                <textarea
                  className={TESORERIA_FIELD_CLASS}
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </label>
              <div className="flex gap-2 pt-2">
                <CopilotPrimaryButton type="submit" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
                </CopilotPrimaryButton>
                <CopilotGhostButton type="button" onClick={() => setDrawerOpen(false)}>
                  Cancelar
                </CopilotGhostButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Modals */}
      {activeModal?.kind === "pay" ? (
        <PayModal
          row={activeModal.row}
          asOfDate={asOfDate}
          workspace={workspace}
          onClose={() => setActiveModal(null)}
        />
      ) : null}
      {activeModal?.kind === "edit" ? (
        <EditModal
          row={activeModal.row}
          workspace={workspace}
          onClose={() => setActiveModal(null)}
        />
      ) : null}
      {activeModal?.kind === "reschedule" ? (
        <RescheduleModal
          row={activeModal.row}
          workspace={workspace}
          onClose={() => setActiveModal(null)}
        />
      ) : null}
      {activeModal?.kind === "cancel" ? (
        <CancelModal
          row={activeModal.row}
          workspace={workspace}
          onClose={() => setActiveModal(null)}
        />
      ) : null}
      {activeModal?.kind === "delete" ? (
        <DeleteModal
          row={activeModal.row}
          workspace={workspace}
          onClose={() => setActiveModal(null)}
        />
      ) : null}
    </section>
  );
}
