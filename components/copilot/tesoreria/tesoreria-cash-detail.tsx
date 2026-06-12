"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, X } from "lucide-react";

import { CopilotButton } from "@/components/copilot/ui/copilot-button";
import { CopilotPagination } from "@/components/copilot/ui/copilot-pagination";
import { premiumCardClass } from "@/components/copilot/ui/copilot-visual-system";
import {
  TESORERIA_FIELD_CLASS,
  TESORERIA_PAGE_SIZE,
  TESORERIA_SELECT_CLASS,
} from "@/components/copilot/tesoreria/tesoreria-ui";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";
import { formatTreasuryMoney } from "@/lib/treasury/treasury-dashboard";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import { sortManualCashMovementsNewestFirst } from "@/lib/treasury/treasury-manual-cash-movements";
import type { ManualCashMovement, TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";

type MovementTypeFilter = "all" | "income" | "expense";
type CurrencyFilter = "all" | TreasuryCurrencyCode;

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

      <div className="mt-4 space-y-0.5 border-t border-[var(--copilot-border)] pt-3">
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
          valueClass="text-[var(--copilot-success-text)]"
          muted
        />
        <CompositionRow
          label="Ingresos manuales"
          value={
            pos && pos.manualIncome > 0
              ? `+ ${formatTreasuryMoney(pos.manualIncome, currency)}`
              : "—"
          }
          valueClass="text-[var(--copilot-success-text)]"
          muted
        />
        <CompositionRow
          label="Egresos manuales"
          value={
            pos && pos.manualExpense > 0
              ? `− ${formatTreasuryMoney(pos.manualExpense, currency)}`
              : "—"
          }
          valueClass="text-[var(--copilot-danger-text)]"
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
        <div className="mt-3 rounded-lg border border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] px-3 py-2 text-[11px] text-[var(--copilot-warning-text-strong)]">
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
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currency, setCurrency] = useState<CurrencyFilter>("all");
  const [typeFilter, setTypeFilter] = useState<MovementTypeFilter>("all");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = workspace.manualMovements
      .filter((m) => m.status === "active" && m.affectsCashflow && !isOpeningBalanceProxy(m))
      .filter((m) => currency === "all" || m.currencyCode === currency)
      .filter((m) => {
        if (typeFilter === "all") return true;
        return m.movementType === typeFilter;
      })
      .filter((m) => {
        if (dateFrom && m.movementDate < dateFrom) return false;
        if (dateTo && m.movementDate > dateTo) return false;
        if (!q) return true;
        return (
          m.concept.toLowerCase().includes(q) ||
          (m.category ?? "").toLowerCase().includes(q) ||
          (m.notes ?? "").toLowerCase().includes(q)
        );
      });
    return sortManualCashMovementsNewestFirst(rows);
  }, [workspace.manualMovements, search, dateFrom, dateTo, currency, typeFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / TESORERIA_PAGE_SIZE));
  const pageItems = filtered.slice(page * TESORERIA_PAGE_SIZE, (page + 1) * TESORERIA_PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [search, dateFrom, dateTo, currency, typeFilter]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink-muted)]">Desde</span>
          <input
            type="date"
            className={TESORERIA_FIELD_CLASS}
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink-muted)]">Hasta</span>
          <input
            type="date"
            className={TESORERIA_FIELD_CLASS}
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
        <label className="block text-sm sm:col-span-2 lg:col-span-1">
          <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink-muted)]">Buscar</span>
          <input
            type="search"
            className={TESORERIA_FIELD_CLASS}
            placeholder="Concepto o notas"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink-muted)]">Moneda</span>
          <select
            className={TESORERIA_SELECT_CLASS}
            value={currency}
            onChange={(e) => setCurrency(e.target.value as CurrencyFilter)}
          >
            <option value="all">Todas</option>
            <option value="UYU">UYU</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink-muted)]">Tipo</span>
          <select
            className={TESORERIA_SELECT_CLASS}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as MovementTypeFilter)}
          >
            <option value="all">Todos</option>
            <option value="income">Ingreso</option>
            <option value="expense">Egreso</option>
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--copilot-ink-muted)]">
          Sin movimientos con esos filtros. Usá los botones superiores para cargar ingresos o egresos.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {pageItems.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-2.5 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--copilot-ink)]">{m.concept}</p>
                  <p className="text-xs text-[var(--copilot-ink-muted)]">
                    {m.movementDate} · {m.currencyCode} ·{" "}
                    {m.movementType === "income" ? "Ingreso" : m.movementType === "expense" ? "Egreso" : m.movementType}
                  </p>
                </div>
                <span
                  className={`ml-3 shrink-0 text-sm font-semibold tabular-nums ${
                    m.movementType === "income" ? "text-[var(--copilot-success-text)]" : "text-[var(--copilot-danger-text)]"
                  }`}
                >
                  {m.movementType === "income" ? "+" : "−"}
                  {formatTreasuryMoney(m.amount, m.currencyCode)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex flex-col items-center gap-2 pt-1">
            <span className="text-xs text-[var(--copilot-ink-muted)]">
              {filtered.length} registro{filtered.length === 1 ? "" : "s"} · página {page + 1} de {pageCount}
            </span>
            <CopilotPagination page={page} pageCount={pageCount} onPageChange={setPage} />
          </div>
        </>
      )}
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
