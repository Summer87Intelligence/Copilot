"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Plus, XCircle } from "lucide-react";

import type { TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";

import { CopilotBadge, CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import { CopilotButton } from "@/components/copilot/ui/copilot-button";
import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import { CopilotPagination } from "@/components/copilot/ui/copilot-pagination";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { TreasuryMovementAccounting, TreasuryMovementAccountingMatchStatus } from "@/lib/treasury/treasury-types";
import { CopilotEmptyPanel } from "@/components/copilot/copilot-empty-panel";
import {
  TESORERIA_FIELD_CLASS,
  TESORERIA_FILTER_CHIP_ACTIVE,
  TESORERIA_FILTER_CHIP_IDLE,
  TESORERIA_PAGE_SIZE,
  TESORERIA_TABLE_CLASS,
  TESORERIA_TD_CLASS,
  TESORERIA_TH_CLASS,
} from "@/components/copilot/tesoreria/tesoreria-ui";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import { formatTreasuryMoney } from "@/lib/treasury/treasury-dashboard";
import {
  manualCashFormSchema,
  parseMoneyInput,
  zodFieldErrors,
} from "@/lib/treasury/treasury-form-schemas";
import { isManualCashMovementDeletable } from "@/lib/treasury/treasury-manual-cash-movements";
import type { ManualCashMovement } from "@/lib/treasury/treasury-types";
import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";

type Props = {
  workspace: TreasuryWorkspace;
};

type FormState = {
  movementType: "income" | "expense" | "transfer";
  ledgerType: "cash" | "bank" | "virtual_wallet" | "credit_card";
  accountId: string;
  concept: string;
  category: string;
  amount: string;
  currencyCode: "UYU" | "USD";
  movementDate: string;
  tags: string;
  notes: string;
  adjustmentDirection: "increase" | "decrease";
};

type CurrencyFilter = "all" | TreasuryCurrencyCode;
type TypeFilter = "all" | "income" | "expense" | "adjustment";
type AccountingFilter =
  | "all"
  | "sin_contabilizar"
  | "contabilizados"
  | "coincide"
  | "no_coincide"
  | "requiere_revision";

const ACCOUNTING_FILTER_LABELS: Record<AccountingFilter, string> = {
  all: "Todos",
  sin_contabilizar: "Sin contabilizar",
  contabilizados: "Contabilizados",
  coincide: "Asiento coincide",
  no_coincide: "No coincide",
  requiere_revision: "Requiere revisión",
};

const MATCH_STATUS_LABELS: Record<TreasuryMovementAccountingMatchStatus, string> = {
  pending: "Pendiente",
  matched: "Coincide",
  amount_mismatch: "Dif. importe",
  currency_mismatch: "Dif. moneda",
  date_mismatch: "Dif. fecha",
  missing_zeta_entry: "Sin asiento",
  manually_confirmed: "Confirmado",
};

const MATCH_STATUS_BADGE_CLASS: Record<TreasuryMovementAccountingMatchStatus, string> = {
  pending: "bg-gray-100 text-gray-600",
  matched: "bg-emerald-100 text-emerald-800",
  amount_mismatch: "bg-amber-100 text-amber-800",
  currency_mismatch: "bg-amber-100 text-amber-800",
  date_mismatch: "bg-amber-100 text-amber-800",
  missing_zeta_entry: "bg-rose-100 text-rose-700",
  manually_confirmed: "bg-blue-100 text-blue-700",
};

const TYPE_LABELS: Record<string, string> = {
  income: "Ingreso",
  expense: "Egreso",
  adjustment: "Ajuste",
  transfer: "Transferencia",
};

const initialForm: FormState = {
  movementType: "expense",
  ledgerType: "cash",
  accountId: "",
  concept: "",
  category: "",
  amount: "",
  currencyCode: "UYU",
  movementDate: new Date().toISOString().slice(0, 10),
  tags: "",
  notes: "",
  adjustmentDirection: "decrease",
};

export function TreasuryManualCashPanel({ workspace }: Props) {
  const { canWrite } = useCopilotPermissions();
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState<CurrencyFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [page, setPage] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ManualCashMovement | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [accountingFilter, setAccountingFilter] = useState<AccountingFilter>("all");
  const [accountingMap, setAccountingMap] = useState<Map<string, TreasuryMovementAccounting>>(new Map());
  const [accountingLoading, setAccountingLoading] = useState(false);
  const [savingAccountingId, setSavingAccountingId] = useState<string | null>(null);

  const loadAccounting = useCallback(async () => {
    if (workspace.manualMovements.length === 0) return;
    setAccountingLoading(true);
    try {
      const ids = workspace.manualMovements.map((m) => m.id).join(",");
      const res = await copilotApiFetch(`/api/copilot/treasury/accounting?movement_ids=${ids}`);
      const json = (await res.json().catch(() => null)) as { ok?: boolean; records?: TreasuryMovementAccounting[] } | null;
      if (json?.ok && json.records) {
        const map = new Map<string, TreasuryMovementAccounting>();
        for (const r of json.records) map.set(r.movementId, r);
        setAccountingMap(map);
      }
    } finally {
      setAccountingLoading(false);
    }
  }, [workspace.manualMovements]);

  useEffect(() => {
    void loadAccounting();
  }, [loadAccounting]);

  async function togglePosted(movementId: string, current: boolean) {
    setSavingAccountingId(movementId);
    try {
      const res = await copilotApiFetch(`/api/copilot/treasury/movements/${movementId}/accounting`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accounting_posted: !current }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: { record: TreasuryMovementAccounting } } | null;
      if (json?.ok && json.data?.record) {
        setAccountingMap((prev) => new Map(prev).set(movementId, json.data!.record));
      }
    } finally {
      setSavingAccountingId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workspace.manualMovements
      .filter((m) => currencyFilter === "all" || m.currencyCode === currencyFilter)
      .filter((m) => typeFilter === "all" || m.movementType === typeFilter)
      .filter((m) => {
        if (accountingFilter === "all") return true;
        const acc = accountingMap.get(m.id);
        if (accountingFilter === "sin_contabilizar") return !acc?.accountingPosted;
        if (accountingFilter === "contabilizados") return acc?.accountingPosted === true;
        if (accountingFilter === "coincide") return acc?.accountingMatchStatus === "matched";
        if (accountingFilter === "no_coincide") {
          return acc != null && ["amount_mismatch", "currency_mismatch", "date_mismatch"].includes(acc.accountingMatchStatus);
        }
        if (accountingFilter === "requiere_revision") {
          return !acc?.accountingPosted || acc?.accountingMatchStatus === "pending" || acc?.accountingMatchStatus === "missing_zeta_entry";
        }
        return true;
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
      })
      .sort(
        (a, b) =>
          b.movementDate.localeCompare(a.movementDate) || b.createdAt.localeCompare(a.createdAt)
      );
  }, [workspace.manualMovements, search, dateFrom, dateTo, currencyFilter, typeFilter, accountingFilter, accountingMap]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / TESORERIA_PAGE_SIZE));
  const pageItems = filtered.slice(page * TESORERIA_PAGE_SIZE, (page + 1) * TESORERIA_PAGE_SIZE);

  function openCreate() {
    setEditing(null);
    setForm(initialForm);
    setDrawerOpen(true);
  }

  function openEdit(row: ManualCashMovement) {
    setEditing(row);
    const tags = Array.isArray(row.metadata?.tags)
      ? (row.metadata?.tags as string[]).join(", ")
      : typeof row.metadata?.tags === "string"
        ? row.metadata.tags
        : "";
    setForm({
      movementType:
        row.movementType === "adjustment"
          ? "expense"
          : (row.movementType as FormState["movementType"]),
      ledgerType: row.ledgerType,
      accountId: row.accountId ?? "",
      concept: row.concept,
      category: row.category ?? "",
      amount: String(row.amount),
      currencyCode: row.currencyCode,
      movementDate: row.movementDate,
      tags,
      notes: row.notes ?? "",
      adjustmentDirection:
        row.metadata?.adjustment_direction === "increase" ? "increase" : "decrease",
    });
    setDrawerOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = manualCashFormSchema.safeParse({
      movementType: form.movementType,
      ledgerType: form.ledgerType,
      accountId: form.accountId,
      concept: form.concept,
      category: form.category,
      amount: form.amount,
      currencyCode: form.currencyCode,
      movementDate: form.movementDate,
      tags: form.tags,
      notes: form.notes,
    });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setSaving(true);
    const metadata: Record<string, unknown> = {};
    if (parsed.data.tags?.trim()) {
      metadata.tags = parsed.data.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
    }
    const body: Record<string, unknown> = {
      ledger_type: parsed.data.ledgerType,
      movement_type: parsed.data.movementType,
      account_id: parsed.data.accountId || null,
      concept: parsed.data.concept,
      category: parsed.data.category?.trim() || null,
      amount: parseMoneyInput(parsed.data.amount),
      currency_code: parsed.data.currencyCode,
      movement_date: parsed.data.movementDate,
      notes: parsed.data.notes?.trim() || null,
      metadata: Object.keys(metadata).length ? metadata : null,
    };
    if (form.movementType === "transfer") {
      const existingPair = editing?.metadata?.transfer_pair_id;
      body.transfer_pair_id =
        typeof existingPair === "string" && existingPair.length > 0
          ? existingPair
          : crypto.randomUUID();
    }
    const result = editing
      ? await workspace.updateManual(editing.id, body)
      : await workspace.createManual(body);
    setSaving(false);
    if (result) {
      setDrawerOpen(false);
      setErrors({});
    }
  }

  return (
    <section className="space-y-4">
      <CopilotSectionTitle
        title="Movimientos de caja"
        subtitle="Ingresos, egresos y ajustes confirmados que impactan la caja."
        action={
          canWrite ? (
            <CopilotButton type="button" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo movimiento
            </CopilotButton>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "UYU", "USD"] as CurrencyFilter[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              setCurrencyFilter(c);
              setPage(0);
            }}
            className={`${copilotButtonClassName({ variant: "ghost", size: "sm" })} !rounded-full ${
              currencyFilter === c ? TESORERIA_FILTER_CHIP_ACTIVE : TESORERIA_FILTER_CHIP_IDLE
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
            onClick={() => {
              setTypeFilter(t);
              setPage(0);
            }}
            className={`${copilotButtonClassName({ variant: "ghost", size: "sm" })} !rounded-full ${
              typeFilter === t ? TESORERIA_FILTER_CHIP_ACTIVE : TESORERIA_FILTER_CHIP_IDLE
            }`}
          >
            {t === "all" ? "Todos" : TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Accounting filter */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium text-[var(--copilot-ink-muted)]">Contabilidad:</span>
        {(Object.keys(ACCOUNTING_FILTER_LABELS) as AccountingFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => { setAccountingFilter(f); setPage(0); }}
            className={`${copilotButtonClassName({ variant: "ghost", size: "sm" })} !rounded-full ${
              accountingFilter === f ? TESORERIA_FILTER_CHIP_ACTIVE : TESORERIA_FILTER_CHIP_IDLE
            }`}
          >
            {ACCOUNTING_FILTER_LABELS[f]}
          </button>
        ))}
        {accountingLoading && <Loader2 className="h-3 w-3 animate-spin text-[var(--copilot-ink-muted)]" />}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink-muted)]">Desde</span>
          <input
            type="date"
            className={TESORERIA_FIELD_CLASS}
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink-muted)]">Hasta</span>
          <input
            type="date"
            className={TESORERIA_FIELD_CLASS}
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="block text-sm sm:col-span-2 lg:col-span-1">
          <span className="mb-1 block text-xs font-medium text-[var(--copilot-ink-muted)]">Buscar</span>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Concepto, categoría o notas"
            className={TESORERIA_FIELD_CLASS}
            aria-label="Buscar movimientos"
          />
        </label>
      </div>

      {workspace.loading && workspace.manualMovements.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando movimientos…
        </div>
      ) : filtered.length === 0 ? (
        <CopilotEmptyPanel
          title="Sin movimientos"
          paragraphs={[
            "Registrá ingresos, egresos o ajustes para ver el flujo de caja del workspace.",
          ]}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/50">
          <table className={TESORERIA_TABLE_CLASS}>
            <thead>
              <tr>
                <th className={TESORERIA_TH_CLASS}>Fecha</th>
                <th className={TESORERIA_TH_CLASS}>Concepto</th>
                <th className={TESORERIA_TH_CLASS}>Tipo</th>
                <th className={TESORERIA_TH_CLASS}>Moneda</th>
                <th className={TESORERIA_TH_CLASS}>Monto</th>
                <th className={TESORERIA_TH_CLASS}>Cuenta</th>
                <th className={TESORERIA_TH_CLASS}>Estado</th>
                <th className={TESORERIA_TH_CLASS}>Contabilizado</th>
                <th className={TESORERIA_TH_CLASS}>Asiento Zeta</th>
                <th className={TESORERIA_TH_CLASS}>Coincidencia</th>
                <th className={TESORERIA_TH_CLASS}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((row) => (
                <tr key={row.id}>
                  <td className={TESORERIA_TD_CLASS}>{row.movementDate}</td>
                  <td className={TESORERIA_TD_CLASS}>{row.concept}</td>
                  <td className={TESORERIA_TD_CLASS}>
                    {TYPE_LABELS[row.movementType] ?? row.movementType}
                  </td>
                  <td className={TESORERIA_TD_CLASS}>{row.currencyCode}</td>
                  <td className={TESORERIA_TD_CLASS}>
                    {formatTreasuryMoney(row.amount, row.currencyCode)}
                  </td>
                  <td className={TESORERIA_TD_CLASS}>
                    {row.accountId ? workspace.accountById.get(row.accountId)?.name ?? row.accountId : "—"}
                  </td>
                  <td className={TESORERIA_TD_CLASS}>
                    <CopilotBadge tone={row.status === "active" ? "success" : "neutral"}>
                      {row.status === "active" ? "Activo" : "Archivado"}
                    </CopilotBadge>
                  </td>
                  {/* Contabilizado */}
                  <td className={TESORERIA_TD_CLASS}>
                    <button
                      type="button"
                      disabled={savingAccountingId === row.id}
                      onClick={() => void togglePosted(row.id, accountingMap.get(row.id)?.accountingPosted ?? false)}
                      className="flex items-center gap-1 text-xs"
                      title="Marcar / desmarcar como contabilizado en Zeta"
                    >
                      {savingAccountingId === row.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-[var(--copilot-ink-muted)]" />
                      ) : accountingMap.get(row.id)?.accountingPosted ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-[var(--copilot-ink-muted)]" />
                      )}
                      <span className={accountingMap.get(row.id)?.accountingPosted ? "text-emerald-700 font-medium" : "text-[var(--copilot-ink-muted)]"}>
                        {accountingMap.get(row.id)?.accountingPosted ? "Sí" : "No"}
                      </span>
                    </button>
                  </td>
                  {/* Asiento Zeta */}
                  <td className={TESORERIA_TD_CLASS}>
                    {(() => {
                      const acc = accountingMap.get(row.id);
                      if (!acc?.zetaAccountingEntryNumber) return <span className="text-[var(--copilot-ink-muted)]">—</span>;
                      return (
                        <span className="text-xs font-medium text-[var(--copilot-ink)]">
                          {acc.zetaAccountingEntryNumber}
                          {acc.zetaAccountingEntryDate && (
                            <span className="ml-1 text-[var(--copilot-ink-muted)]">
                              · {acc.zetaAccountingEntryDate.slice(5).replace("-", "/")}
                            </span>
                          )}
                        </span>
                      );
                    })()}
                  </td>
                  {/* Coincidencia */}
                  <td className={TESORERIA_TD_CLASS}>
                    {(() => {
                      const acc = accountingMap.get(row.id);
                      if (!acc) return <span className="text-[var(--copilot-ink-muted)]">—</span>;
                      const cls = MATCH_STATUS_BADGE_CLASS[acc.accountingMatchStatus];
                      return (
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
                          {MATCH_STATUS_LABELS[acc.accountingMatchStatus]}
                        </span>
                      );
                    })()}
                  </td>
                  <td className={TESORERIA_TD_CLASS}>
                    {canWrite ? (
                      <div className="flex flex-wrap gap-2">
                        <CopilotButton
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => openEdit(row)}
                          disabled={!isManualCashMovementDeletable(row)}
                          title={
                            isManualCashMovementDeletable(row)
                              ? "Editar movimiento"
                              : "Solo movimientos creados manualmente"
                          }
                        >
                          Editar
                        </CopilotButton>
                        {isManualCashMovementDeletable(row) ? (
                          <CopilotButton
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              const msg = row.reconciled
                                ? "Este movimiento está conciliado. Eliminarlo puede afectar la conciliación.\n\n¿Eliminar este movimiento de caja? Esta acción no se puede deshacer."
                                : "¿Eliminar este movimiento de caja? Esta acción no se puede deshacer.";
                              if (window.confirm(msg)) void workspace.deleteManual(row.id);
                            }}
                          >
                            Eliminar
                          </CopilotButton>
                        ) : null}
                        {row.status === "active" && isManualCashMovementDeletable(row) ? (
                          <CopilotButton
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() => void workspace.archiveManual(row.id)}
                          >
                            Anular
                          </CopilotButton>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--copilot-ink-muted)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > TESORERIA_PAGE_SIZE ? (
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--copilot-ink-muted)]">
            {filtered.length} movimiento{filtered.length !== 1 ? "s" : ""}
            {pageCount > 1 && ` · Página ${page + 1} de ${pageCount}`}
          </span>
          <CopilotPagination page={page} pageCount={pageCount} onPageChange={setPage} />
        </div>
      ) : null}

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30">
          <div className="h-full w-full max-w-lg overflow-y-auto bg-[var(--copilot-card)] p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-[var(--copilot-ink)]">
              {editing ? "Editar movimiento" : "Nuevo movimiento"}
            </h3>
            <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
              <label className="block text-sm">
                Tipo
                <select
                  className={TESORERIA_FIELD_CLASS}
                  value={form.movementType}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      movementType: e.target.value as FormState["movementType"],
                    }))
                  }
                >
                  <option value="income">Ingreso</option>
                  <option value="expense">Egreso</option>
                  <option value="transfer">Transferencia interna</option>
                </select>
              </label>
              <label className="block text-sm">
                Ledger
                <select
                  className={TESORERIA_FIELD_CLASS}
                  value={form.ledgerType}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      ledgerType: e.target.value as FormState["ledgerType"],
                    }))
                  }
                >
                  <option value="cash">Caja</option>
                  <option value="bank">Banco</option>
                  <option value="virtual_wallet">Wallet</option>
                  <option value="credit_card">Tarjeta</option>
                </select>
              </label>
              <label className="block text-sm">
                Cuenta
                <select
                  className={TESORERIA_FIELD_CLASS}
                  value={form.accountId}
                  onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
                >
                  <option value="">Sin cuenta</option>
                  {workspace.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currencyCode})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Concepto
                <input
                  className={TESORERIA_FIELD_CLASS}
                  value={form.concept}
                  onChange={(e) => setForm((f) => ({ ...f, concept: e.target.value }))}
                  required
                />
                {errors.concept ? (
                  <span className="mt-1 block text-xs text-rose-700" role="alert">
                    {errors.concept}
                  </span>
                ) : null}
              </label>
              <label className="block text-sm">
                Categoría
                <input
                  className={TESORERIA_FIELD_CLASS}
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  Monto
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={TESORERIA_FIELD_CLASS}
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    required
                  />
                </label>
                <label className="block text-sm">
                  Moneda
                  <select
                    className={TESORERIA_FIELD_CLASS}
                    value={form.currencyCode}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        currencyCode: e.target.value as FormState["currencyCode"],
                      }))
                    }
                  >
                    <option value="UYU">UYU</option>
                    <option value="USD">USD</option>
                  </select>
                </label>
              </div>
              <label className="block text-sm">
                Fecha efectiva
                <input
                  type="date"
                  className={TESORERIA_FIELD_CLASS}
                  value={form.movementDate}
                  onChange={(e) => setForm((f) => ({ ...f, movementDate: e.target.value }))}
                  required
                />
              </label>
              <label className="block text-sm">
                Tags (coma)
                <input
                  className={TESORERIA_FIELD_CLASS}
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                Observaciones
                <textarea
                  className={TESORERIA_FIELD_CLASS}
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </label>
              <div className="flex gap-2 pt-2">
                <CopilotButton type="submit" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
                </CopilotButton>
                <CopilotButton type="button" variant="secondary" onClick={() => setDrawerOpen(false)}>
                  Cancelar
                </CopilotButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}