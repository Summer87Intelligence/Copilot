"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";

import {
  CopilotBadge,
  CopilotGhostButton,
  CopilotPrimaryButton,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { CopilotEmptyPanel } from "@/components/copilot/copilot-empty-panel";
import { TreasuryFormField, treasuryInputClassName } from "@/components/copilot/tesoreria/treasury-form-fields";
import {
  TESORERIA_PAGE_SIZE,
  TESORERIA_TABLE_CLASS,
  TESORERIA_TD_CLASS,
  TESORERIA_TH_CLASS,
} from "@/components/copilot/tesoreria/tesoreria-ui";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import { formatTreasuryMoney } from "@/lib/treasury/treasury-dashboard";
import {
  buildTreasuryAccountMetadata,
  readTreasuryAccountAlias,
  readTreasuryAccountInitialBalance,
  treasuryAccountFormSchema,
  zodFieldErrors,
  type TreasuryAccountFormValues,
} from "@/lib/treasury/treasury-form-schemas";
import type { TreasuryAccount, TreasuryAccountType } from "@/lib/treasury/treasury-types";

const ACCOUNT_TYPES: { value: TreasuryAccountType; label: string }[] = [
  { value: "cash", label: "Caja" },
  { value: "bank", label: "Banco" },
  { value: "wallet", label: "Wallet" },
  { value: "credit_card", label: "Tarjeta" },
  { value: "investment", label: "Inversión" },
];

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  cash: "Caja",
  bank: "Banco",
  wallet: "Wallet",
  credit_card: "Tarjeta",
  investment: "Inversión",
};

type Props = {
  workspace: TreasuryWorkspace;
  embedded?: boolean;
};

const emptyForm: TreasuryAccountFormValues = {
  name: "",
  alias: "",
  type: "bank",
  currencyCode: "UYU",
  bankName: "Santander",
  accountNumber: "",
  initialBalance: "",
};

export function TreasuryAccountsPanel({ workspace, embedded = false }: Props) {
  const { canWrite } = useCopilotPermissions();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<TreasuryAccount | null>(null);
  const [form, setForm] = useState<TreasuryAccountFormValues>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workspace.accounts.filter((account) => {
      if (!q) return true;
      const alias = readTreasuryAccountAlias(account.metadata) ?? "";
      return (
        account.name.toLowerCase().includes(q) ||
        alias.toLowerCase().includes(q) ||
        (account.bankName ?? "").toLowerCase().includes(q)
      );
    });
  }, [workspace.accounts, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / TESORERIA_PAGE_SIZE));
  const pageItems = filtered.slice(page * TESORERIA_PAGE_SIZE, (page + 1) * TESORERIA_PAGE_SIZE);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setDrawerOpen(true);
  }

  function openEdit(account: TreasuryAccount) {
    setEditing(account);
    setForm({
      name: account.name,
      alias: readTreasuryAccountAlias(account.metadata) ?? "",
      type: account.type,
      currencyCode: account.currencyCode,
      bankName: account.bankName ?? "",
      accountNumber: account.accountNumber ?? "",
      initialBalance:
        readTreasuryAccountInitialBalance(account.metadata)?.toString() ?? "",
    });
    setErrors({});
    setDrawerOpen(true);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || saving || !drawerOpen) return;
      setDrawerOpen(false);
      setEditing(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen, saving]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = treasuryAccountFormSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setSaving(true);
    const body = {
      name: parsed.data.name,
      type: parsed.data.type,
      currency_code: parsed.data.currencyCode,
      bank_name: parsed.data.bankName?.trim() || null,
      account_number: parsed.data.accountNumber?.trim() || null,
      metadata: buildTreasuryAccountMetadata(parsed.data),
    };
    const result = editing
      ? await workspace.updateAccount(editing.id, body)
      : await workspace.createAccount(body);
    setSaving(false);
    if (result) {
      setDrawerOpen(false);
      setErrors({});
    }
  }

  return (
    <section className="space-y-4">
      {embedded ? (
        canWrite ? (
          <div className="flex justify-end">
            <CopilotPrimaryButton type="button" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva cuenta
            </CopilotPrimaryButton>
          </div>
        ) : null
      ) : (
        <CopilotSectionTitle
          title="Cuentas de tesorería"
          subtitle="Cuentas usadas para organizar movimientos de tesorería."
          action={
            canWrite ? (
              <CopilotPrimaryButton type="button" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Nueva cuenta
              </CopilotPrimaryButton>
            ) : null
          }
        />
      )}

      <input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(0);
        }}
        placeholder="Buscar por nombre, alias o banco"
        className={treasuryInputClassName()}
        aria-label="Buscar cuentas"
      />

      {workspace.loading && workspace.accounts.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando cuentas…
        </div>
      ) : filtered.length === 0 ? (
        <CopilotEmptyPanel
          title="Sin cuentas de tesorería"
          paragraphs={["Creá cuentas de caja o banco para asociar movimientos y calcular la posición."]}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/50">
          <table className={TESORERIA_TABLE_CLASS}>
            <thead>
              <tr>
                <th className={TESORERIA_TH_CLASS}>Nombre</th>
                <th className={TESORERIA_TH_CLASS}>Alias</th>
                <th className={TESORERIA_TH_CLASS}>Tipo</th>
                <th className={TESORERIA_TH_CLASS}>Moneda</th>
                <th className={TESORERIA_TH_CLASS}>Banco</th>
                <th className={TESORERIA_TH_CLASS}>Saldo inicial</th>
                <th className={TESORERIA_TH_CLASS}>Estado</th>
                <th className={TESORERIA_TH_CLASS}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((account) => {
                const initialBalance = readTreasuryAccountInitialBalance(account.metadata);
                return (
                  <tr key={account.id}>
                    <td className={TESORERIA_TD_CLASS}>{account.name}</td>
                    <td className={TESORERIA_TD_CLASS}>
                      {readTreasuryAccountAlias(account.metadata) ?? "—"}
                    </td>
                    <td className={TESORERIA_TD_CLASS}>{ACCOUNT_TYPE_LABEL[account.type] ?? account.type}</td>
                    <td className={TESORERIA_TD_CLASS}>{account.currencyCode}</td>
                    <td className={TESORERIA_TD_CLASS}>{account.bankName ?? "—"}</td>
                    <td className={TESORERIA_TD_CLASS}>
                      {initialBalance != null
                        ? formatTreasuryMoney(initialBalance, account.currencyCode)
                        : "—"}
                    </td>
                    <td className={TESORERIA_TD_CLASS}>
                      <CopilotBadge tone={account.active ? "success" : "neutral"}>
                        {account.active ? "Activa" : "Inactiva"}
                      </CopilotBadge>
                    </td>
                    <td className={TESORERIA_TD_CLASS}>
                      {canWrite ? (
                        <div className="flex flex-wrap gap-2">
                          <CopilotGhostButton type="button" onClick={() => openEdit(account)}>
                            Editar
                          </CopilotGhostButton>
                          {account.active ? (
                            <CopilotGhostButton
                              type="button"
                              onClick={() => void workspace.deactivateAccount(account.id)}
                            >
                              Desactivar
                            </CopilotGhostButton>
                          ) : null}
                        </div>
                      ) : <span className="text-xs text-[var(--copilot-ink-muted)]">—</span>}
                    </td>
                  </tr>
                );
              })}
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
            <CopilotGhostButton type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
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

      {drawerOpen ? (
        <div
          className="fixed inset-0 z-[var(--copilot-z-drawer)] flex justify-end bg-[var(--copilot-overlay-backdrop)]"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) { setDrawerOpen(false); setEditing(null); } }}
        >
          <div className="h-full w-full max-w-lg overflow-y-auto bg-[var(--copilot-card)] p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-[var(--copilot-ink)]">
              {editing ? "Editar cuenta" : "Nueva cuenta"}
            </h3>
            <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
              <TreasuryFormField label="Nombre" htmlFor="account-name" error={errors.name}>
                <input
                  id="account-name"
                  className={treasuryInputClassName(errors.name)}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </TreasuryFormField>
              <TreasuryFormField label="Alias" htmlFor="account-alias" error={errors.alias}>
                <input
                  id="account-alias"
                  className={treasuryInputClassName(errors.alias)}
                  value={form.alias}
                  onChange={(e) => setForm((f) => ({ ...f, alias: e.target.value }))}
                />
              </TreasuryFormField>
              <TreasuryFormField label="Tipo" htmlFor="account-type" error={errors.type}>
                <select
                  id="account-type"
                  className={treasuryInputClassName(errors.type)}
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, type: e.target.value as TreasuryAccountType }))
                  }
                >
                  {ACCOUNT_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </TreasuryFormField>
              <TreasuryFormField label="Moneda" htmlFor="account-currency" error={errors.currencyCode}>
                <select
                  id="account-currency"
                  className={treasuryInputClassName(errors.currencyCode)}
                  value={form.currencyCode}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      currencyCode: e.target.value as TreasuryAccountFormValues["currencyCode"],
                    }))
                  }
                >
                  <option value="UYU">UYU</option>
                  <option value="USD">USD</option>
                </select>
              </TreasuryFormField>
              <TreasuryFormField label="Banco" htmlFor="account-bank" error={errors.bankName}>
                <input
                  id="account-bank"
                  className={treasuryInputClassName(errors.bankName)}
                  value={form.bankName}
                  onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                />
              </TreasuryFormField>
              <TreasuryFormField
                label="Número de cuenta"
                htmlFor="account-number"
                error={errors.accountNumber}
              >
                <input
                  id="account-number"
                  className={treasuryInputClassName(errors.accountNumber)}
                  value={form.accountNumber}
                  onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))}
                />
              </TreasuryFormField>
              <TreasuryFormField
                label="Saldo inicial"
                htmlFor="account-initial-balance"
                error={errors.initialBalance}
              >
                <input
                  id="account-initial-balance"
                  type="number"
                  min="0"
                  step="0.01"
                  className={treasuryInputClassName(errors.initialBalance)}
                  value={form.initialBalance}
                  onChange={(e) => setForm((f) => ({ ...f, initialBalance: e.target.value }))}
                />
              </TreasuryFormField>
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
    </section>
  );
}
