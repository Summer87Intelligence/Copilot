"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";

import { CopilotBadge, CopilotGhostButton, CopilotPrimaryButton, CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import { CopilotEmptyPanel } from "@/components/copilot/copilot-empty-panel";
import {
  TESORERIA_FIELD_CLASS,
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
import { manualMovementAffectsCurrentCash } from "@/lib/treasury/treasury-cash-position";
import type { ManualCashMovement } from "@/lib/treasury/treasury-types";

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
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ManualCashMovement | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workspace.manualMovements.filter((m) => {
      if (!q) return true;
      return (
        m.concept.toLowerCase().includes(q) ||
        (m.category ?? "").toLowerCase().includes(q) ||
        (m.notes ?? "").toLowerCase().includes(q)
      );
    });
  }, [workspace.manualMovements, search]);

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
        title="Caja manual"
        subtitle="Movimientos reales de dinero: ingresos, egresos, ajustes y transferencias."
        action={
          <CopilotPrimaryButton type="button" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo movimiento
          </CopilotPrimaryButton>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Buscar concepto, categoría o notas"
          className={TESORERIA_FIELD_CLASS}
          aria-label="Buscar movimientos"
        />
      </div>

      {workspace.loading && workspace.manualMovements.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando movimientos…
        </div>
      ) : filtered.length === 0 ? (
        <CopilotEmptyPanel
          title="Sin movimientos manuales"
          paragraphs={[
            "Registrá ingresos, egresos o transferencias para ver el flujo de caja real del workspace.",
          ]}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--copilot-border)] bg-white/50">
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
                <th className={TESORERIA_TH_CLASS}>Afecta caja</th>
                <th className={TESORERIA_TH_CLASS}>Conciliado</th>
                <th className={TESORERIA_TH_CLASS}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((row) => (
                <tr key={row.id}>
                  <td className={TESORERIA_TD_CLASS}>{row.movementDate}</td>
                  <td className={TESORERIA_TD_CLASS}>{row.concept}</td>
                  <td className={TESORERIA_TD_CLASS}>{row.movementType}</td>
                  <td className={TESORERIA_TD_CLASS}>{row.currencyCode}</td>
                  <td className={TESORERIA_TD_CLASS}>
                    {formatTreasuryMoney(row.amount, row.currencyCode)}
                  </td>
                  <td className={TESORERIA_TD_CLASS}>
                    {row.accountId ? workspace.accountById.get(row.accountId)?.name ?? row.accountId : "—"}
                  </td>
                  <td className={TESORERIA_TD_CLASS}>
                    <CopilotBadge tone={row.status === "active" ? "success" : "neutral"}>
                      {row.status}
                    </CopilotBadge>
                  </td>
                  <td className={TESORERIA_TD_CLASS}>
                    {manualMovementAffectsCurrentCash(row, workspace.manualMovements)
                      ? "Sí"
                      : "No"}
                  </td>
                  <td className={TESORERIA_TD_CLASS}>
                    {row.reconciled ? "Sí" : "No"}
                  </td>
                  <td className={TESORERIA_TD_CLASS}>
                    <div className="flex flex-wrap gap-2">
                      <CopilotGhostButton
                        type="button"
                        onClick={() => openEdit(row)}
                        disabled={!isManualCashMovementDeletable(row)}
                        title={
                          isManualCashMovementDeletable(row)
                            ? "Editar movimiento"
                            : "Solo movimientos creados manualmente"
                        }
                      >
                        Editar
                      </CopilotGhostButton>
                      {isManualCashMovementDeletable(row) ? (
                        <CopilotGhostButton
                          type="button"
                          className="!text-rose-700 hover:!bg-rose-50/80"
                          onClick={() => {
                            const msg = row.reconciled
                              ? "Este movimiento está conciliado. Eliminarlo puede afectar la conciliación.\n\n¿Eliminar este movimiento de caja? Esta acción no se puede deshacer."
                              : "¿Eliminar este movimiento de caja? Esta acción no se puede deshacer.";
                            if (window.confirm(msg)) void workspace.deleteManual(row.id);
                          }}
                        >
                          Eliminar
                        </CopilotGhostButton>
                      ) : null}
                      {row.status === "active" && isManualCashMovementDeletable(row) ? (
                        <CopilotGhostButton
                          type="button"
                          onClick={() => void workspace.archiveManual(row.id)}
                        >
                          Archivar
                        </CopilotGhostButton>
                      ) : null}
                    </div>
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