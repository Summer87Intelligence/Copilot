"use client";

import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";

import { CopilotButton } from "@/components/copilot/ui/copilot-button";
import { premiumCardClass } from "@/components/copilot/ui/copilot-visual-system";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";
import { formatTreasuryMoney } from "@/lib/treasury/treasury-dashboard";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import type { ManualCashMovement, TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";

const CURRENCIES: TreasuryCurrencyCode[] = ["UYU", "USD"];

function isOpeningBalanceProxy(m: ManualCashMovement): boolean {
  if (m.metadata?.kind === "opening_balance") return true;
  if (
    m.concept.toLowerCase().trim() === "caja inicial" &&
    typeof m.metadata?.planned_obligation_id === "string"
  ) {
    return true;
  }
  return false;
}

function CompositionRow({
  label,
  value,
  valueClass = "text-[var(--copilot-ink)]",
  muted,
}: {
  label: string;
  value: string;
  valueClass?: string;
  muted?: boolean;
}) {
  if (muted && value === "—") return null;
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="text-[var(--copilot-ink-muted)]">{label}</span>
      <span className={`shrink-0 tabular-nums font-medium ${valueClass}`}>{value}</span>
    </div>
  );
}

function CashCompositionBlock({
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

  const title = currency === "USD" ? "Dólares (USD)" : "Pesos (UYU)";
  const baselineDate = pos?.baselineDate ?? null;

  const pureAvailable =
    (pos?.openingBalance ?? 0) +
    (pos?.collectedFromClients ?? 0) +
    (pos?.manualIncome ?? 0) -
    (pos?.manualExpense ?? 0) +
    (pos?.adjustments ?? 0) +
    (pos?.transfersNet ?? 0);

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

  return (
    <div className={`${premiumCardClass} p-5`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[var(--copilot-ink)]">{title}</p>
          <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">Composición de caja disponible</p>
        </div>
        <p className="text-right text-lg font-semibold tabular-nums text-[var(--copilot-ink)]">
          {pos ? formatTreasuryMoney(pureAvailable, currency) : "—"}
        </p>
      </div>

      <div className="mt-4 space-y-0.5 border-t border-neutral-100 pt-3">
        <CompositionRow
          label={`Saldo cargado al ${baselineDate ?? "—"}`}
          value={pos && pos.openingConfigured ? formatTreasuryMoney(pos.openingBalance, currency) : "—"}
        />
        <CompositionRow
          label="Cobros Zeta posteriores"
          value={
            pos && pos.collectedFromClients > 0
              ? `+ ${formatTreasuryMoney(pos.collectedFromClients, currency)}`
              : "—"
          }
          valueClass="text-emerald-700"
          muted
        />
        <CompositionRow
          label="Ingresos manuales"
          value={
            pos && pos.manualIncome > 0
              ? `+ ${formatTreasuryMoney(pos.manualIncome, currency)}`
              : "—"
          }
          valueClass="text-emerald-700"
          muted
        />
        <CompositionRow
          label="Egresos manuales"
          value={
            pos && pos.manualExpense > 0
              ? `− ${formatTreasuryMoney(pos.manualExpense, currency)}`
              : "—"
          }
          valueClass="text-rose-700"
          muted
        />
        <CompositionRow
          label="Ajustes"
          value={pos && pos.adjustments !== 0 ? formatTreasuryMoney(pos.adjustments, currency) : "—"}
          muted
        />
        <CompositionRow
          label="Transferencias netas"
          value={pos && pos.transfersNet !== 0 ? formatTreasuryMoney(pos.transfersNet, currency) : "—"}
          muted
        />
      </div>

      {pos && !pos.openingConfigured ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          Saldo no configurado. Ingresá el saldo actual para que la caja sea correcta.
        </div>
      ) : null}

      {editing ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="number"
            min="0"
            step="1"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-32 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-2 py-1.5 text-sm focus:border-[var(--copilot-accent)] focus:outline-none"
            placeholder="0"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <CopilotButton type="button" size="sm" onClick={() => void save()} disabled={saving}>
            <Check className="h-3 w-3" aria-hidden />
            {saving ? "…" : "OK"}
          </CopilotButton>
          <CopilotButton type="button" variant="secondary" size="sm" onClick={() => setEditing(false)}>
            <X className="h-3 w-3" aria-hidden />
          </CopilotButton>
        </div>
      ) : canWrite ? (
        <CopilotButton
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setDraft(String(pos?.openingBalance ?? 0));
            setEditing(true);
          }}
          className="mt-3"
        >
          <Pencil className="h-3 w-3" aria-hidden />
          Editar saldo actual
        </CopilotButton>
      ) : null}
    </div>
  );
}

function RecentMovements({ workspace }: { workspace: TreasuryWorkspace }) {
  const active = workspace.manualMovements
    .filter((m) => m.status === "active" && m.affectsCashflow && !isOpeningBalanceProxy(m))
    .sort((a, b) => {
      if (b.movementDate !== a.movementDate) return b.movementDate.localeCompare(a.movementDate);
      return b.createdAt.localeCompare(a.createdAt);
    })
    .slice(0, 8);

  if (active.length === 0) {
    return (
      <p className="text-sm text-[var(--copilot-ink-muted)]">
        Sin movimientos recientes. Usá las acciones rápidas para cargar ingresos o egresos.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {active.map((m) => (
        <div
          key={m.id}
          className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white px-3 py-2.5 shadow-sm"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--copilot-ink)]">{m.concept}</p>
            <p className="text-xs text-[var(--copilot-ink-muted)]">
              {m.movementDate} · {m.currencyCode} · {m.movementType === "income" ? "Ingreso" : m.movementType === "expense" ? "Egreso" : m.movementType}
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
  );
}

export function TesoreriaCashDetail({ workspace }: { workspace: TreasuryWorkspace }) {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <p className="text-sm font-semibold text-[var(--copilot-ink)]">Composición de caja</p>
        <p className="text-xs text-[var(--copilot-ink-muted)]">
          Desglose del saldo disponible por moneda. El total coincide con las cards del encabezado.
        </p>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {CURRENCIES.map((currency) => (
            <CashCompositionBlock key={currency} currency={currency} workspace={workspace} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-sm font-semibold text-[var(--copilot-ink)]">Últimos movimientos</p>
        <RecentMovements workspace={workspace} />
      </section>
    </div>
  );
}
