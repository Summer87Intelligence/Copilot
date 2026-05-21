"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";

import {
  CopilotBadge,
  CopilotGhostButton,
  CopilotPrimaryButton,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { CopilotEmptyPanel } from "@/components/copilot/copilot-empty-panel";
import {
  TESORERIA_FIELD_CLASS,
  TESORERIA_TABLE_CLASS,
  TESORERIA_TD_CLASS,
  TESORERIA_TH_CLASS,
} from "@/components/copilot/tesoreria/tesoreria-ui";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import { formatTreasuryMoney } from "@/lib/treasury/treasury-dashboard";
import {
  RECURRING_PAYMENT_CATEGORIES,
  type TreasuryRecurringPayment,
} from "@/lib/treasury/treasury-recurring-payments";

type Props = { workspace: TreasuryWorkspace };

type FormState = {
  title: string;
  direction: "income" | "expense";
  category: string;
  currency: "UYU" | "USD";
  amount: string;
  frequency: "weekly" | "monthly" | "yearly";
  dayOfMonth: string;
  startsOn: string;
  endsOn: string;
  notes: string;
};

const initialForm: FormState = {
  title: "",
  direction: "expense",
  category: "Suscripciones",
  currency: "USD",
  amount: "",
  frequency: "monthly",
  dayOfMonth: "10",
  startsOn: new Date().toISOString().slice(0, 10),
  endsOn: "",
  notes: "",
};

function recurrencePayload(form: FormState) {
  return {
    recurrence_type:
      form.frequency === "yearly"
        ? "yearly"
        : form.frequency === "weekly"
          ? "custom"
          : "monthly",
    recurrence_interval: form.frequency === "weekly" ? 7 : 1,
    next_occurrence_date: form.startsOn,
  };
}

function metadataPayload(form: FormState) {
  return {
    direction: form.direction,
    starts_on: form.startsOn,
    ends_on: form.endsOn.trim() || null,
    day_of_month: form.dayOfMonth ? Number(form.dayOfMonth) : null,
    frequency: form.frequency,
    notes: form.notes.trim() || null,
  };
}

export function TreasuryRecurringPaymentsPanel({ workspace }: Props) {
  const [items, setItems] = useState<TreasuryRecurringPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await copilotApiFetch("/api/copilot/treasury/recurring-obligations");
      const json = (await res.json()) as {
        ok?: boolean;
        data?: { items?: TreasuryRecurringPayment[] };
      };
      if (res.ok && json.ok && json.data?.items) {
        setItems(json.data.items);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(initialForm);
    setDrawerOpen(true);
  }

  function openEdit(row: TreasuryRecurringPayment) {
    const meta = row.metadata ?? {};
    const frequency =
      meta.frequency === "weekly" ||
      meta.frequency === "monthly" ||
      meta.frequency === "yearly"
        ? meta.frequency
        : row.recurrenceType === "yearly"
          ? "yearly"
          : row.recurrenceInterval === 7
            ? "weekly"
            : "monthly";
    setEditingId(row.id);
    setForm({
      title: row.title,
      direction: meta.direction === "income" ? "income" : "expense",
      category: row.category,
      currency: row.currency,
      amount: String(row.amount),
      frequency,
      dayOfMonth:
        typeof meta.day_of_month === "number" ? String(meta.day_of_month) : "10",
      startsOn: String(meta.starts_on ?? row.nextOccurrenceDate),
      endsOn: typeof meta.ends_on === "string" ? meta.ends_on : "",
      notes: typeof meta.notes === "string" ? meta.notes : "",
    });
    setDrawerOpen(true);
  }

  async function runGenerateHorizon() {
    await copilotApiFetch("/api/copilot/treasury/recurring-obligations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ within_days: 30, persist: true }),
    });
    await workspace.refetch();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount.replace(",", "."));
    if (!form.title.trim() || !Number.isFinite(amount) || amount <= 0) {
      workspace.notify("error", "Completá nombre y monto válido.");
      return;
    }
    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        category: form.category,
        currency: form.currency,
        amount,
        auto_generate: true,
        active: true,
        ...recurrencePayload(form),
        metadata: metadataPayload(form),
      };

      const res = editingId
        ? await copilotApiFetch(`/api/copilot/treasury/recurring-obligations/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await copilotApiFetch("/api/copilot/treasury/recurring-obligations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

      const json = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !json.ok) {
        workspace.notify("error", json.message ?? "No se pudo guardar el recurrente.");
        return;
      }
      workspace.notify(
        "success",
        json.message ?? (editingId ? "Recurrente actualizado." : "Recurrente creado.")
      );
      setDrawerOpen(false);
      setEditingId(null);
      setForm(initialForm);
      await load();
      await workspace.refetch();
      if (!editingId) await runGenerateHorizon();
    } finally {
      setSaving(false);
    }
  }

  async function setActive(id: string, active: boolean) {
    const res = await copilotApiFetch(`/api/copilot/treasury/recurring-obligations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    const json = (await res.json()) as { ok?: boolean; message?: string };
    if (!res.ok || !json.ok) {
      workspace.notify("error", json.message ?? "No se pudo actualizar.");
      return;
    }
    workspace.notify("success", active ? "Recurrente reactivado." : "Recurrente pausado.");
    void load();
  }

  async function handleDelete(row: TreasuryRecurringPayment) {
    const confirmed = window.confirm(
      "¿Eliminar este recurrente? No se generarán nuevos pagos futuros."
    );
    if (!confirmed) return;

    const cancelPending = window.confirm(
      "¿También cancelar los pagos futuros pendientes ya generados por este recurrente? (Los pagados no se modifican.)"
    );

    const res = await copilotApiFetch(
      `/api/copilot/treasury/recurring-obligations/${row.id}?cancel_pending_obligations=${cancelPending ? "true" : "false"}`,
      { method: "DELETE" }
    );
    const json = (await res.json()) as { ok?: boolean; message?: string };
    if (!res.ok || !json.ok) {
      workspace.notify("error", json.message ?? "No se pudo eliminar.");
      return;
    }
    workspace.notify("success", json.message ?? "Recurrente eliminado.");
    void load();
    await workspace.refetch();
  }

  return (
    <section className="space-y-4">
      <CopilotSectionTitle
        title="Recurrentes"
        subtitle="Copilot generará automáticamente el pago futuro en cada período (ej. Netflix USD 60 mensual)."
        action={
          <CopilotPrimaryButton type="button" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo recurrente
          </CopilotPrimaryButton>
        }
      />

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Cargando…
        </p>
      ) : items.length === 0 ? (
        <CopilotEmptyPanel
          title="Sin pagos recurrentes"
          paragraphs={[
            "Creá reglas para suscripciones, servicios o sueldos. Cada vencimiento aparece en Pagos futuros sin duplicar.",
          ]}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--copilot-border)] bg-white/50">
          <table className={TESORERIA_TABLE_CLASS}>
            <thead>
              <tr>
                <th className={TESORERIA_TH_CLASS}>Nombre</th>
                <th className={TESORERIA_TH_CLASS}>Tipo</th>
                <th className={TESORERIA_TH_CLASS}>Monto</th>
                <th className={TESORERIA_TH_CLASS}>Próximo</th>
                <th className={TESORERIA_TH_CLASS}>Estado</th>
                <th className={TESORERIA_TH_CLASS}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td className={TESORERIA_TD_CLASS}>{row.title}</td>
                  <td className={TESORERIA_TD_CLASS}>
                    {row.metadata?.direction === "income" ? "Ingreso" : "Egreso"} · {row.category}
                  </td>
                  <td className={TESORERIA_TD_CLASS}>
                    {formatTreasuryMoney(row.amount, row.currency)}
                  </td>
                  <td className={TESORERIA_TD_CLASS}>{row.nextOccurrenceDate}</td>
                  <td className={TESORERIA_TD_CLASS}>
                    <CopilotBadge tone={row.active ? "success" : "neutral"}>
                      {row.active ? "Activo" : "Pausado"}
                    </CopilotBadge>
                  </td>
                  <td className={TESORERIA_TD_CLASS}>
                    <div className="flex flex-wrap gap-2">
                      <CopilotGhostButton type="button" onClick={() => openEdit(row)}>
                        Editar
                      </CopilotGhostButton>
                      {row.active ? (
                        <CopilotGhostButton type="button" onClick={() => void setActive(row.id, false)}>
                          Pausar
                        </CopilotGhostButton>
                      ) : (
                        <CopilotGhostButton type="button" onClick={() => void setActive(row.id, true)}>
                          Reactivar
                        </CopilotGhostButton>
                      )}
                      <CopilotGhostButton
                        type="button"
                        className="text-rose-700"
                        onClick={() => void handleDelete(row)}
                      >
                        Eliminar
                      </CopilotGhostButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
          <form
            className="flex h-full w-full max-w-md flex-col bg-white shadow-xl"
            onSubmit={(e) => void handleSubmit(e)}
          >
            <div className="border-b border-[var(--copilot-border)] px-4 py-3">
              <h3 className="text-sm font-semibold">
                {editingId ? "Editar recurrente" : "Nuevo recurrente"}
              </h3>
              <p className="text-xs text-[var(--copilot-ink-muted)]">
                {editingId
                  ? "Los cambios aplican a futuras generaciones."
                  : "Copilot generará automáticamente el pago futuro cada período."}
              </p>
            </div>
            <div className="flex-1 space-y-3 overflow-auto p-4">
              <label className="block text-xs">
                Nombre
                <input
                  className={`${TESORERIA_FIELD_CLASS} mt-1`}
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Netflix"
                />
              </label>
              <label className="block text-xs">
                Tipo
                <select
                  className={`${TESORERIA_FIELD_CLASS} mt-1`}
                  value={form.direction}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      direction: e.target.value as "income" | "expense",
                    }))
                  }
                >
                  <option value="expense">Egreso</option>
                  <option value="income">Ingreso</option>
                </select>
              </label>
              <label className="block text-xs">
                Categoría
                <select
                  className={`${TESORERIA_FIELD_CLASS} mt-1`}
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                >
                  {RECURRING_PAYMENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs">
                  Moneda
                  <select
                    className={`${TESORERIA_FIELD_CLASS} mt-1`}
                    value={form.currency}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, currency: e.target.value as "UYU" | "USD" }))
                    }
                  >
                    <option value="UYU">UYU</option>
                    <option value="USD">USD</option>
                  </select>
                </label>
                <label className="block text-xs">
                  Monto
                  <input
                    className={`${TESORERIA_FIELD_CLASS} mt-1`}
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                </label>
              </div>
              <label className="block text-xs">
                Frecuencia
                <select
                  className={`${TESORERIA_FIELD_CLASS} mt-1`}
                  value={form.frequency}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      frequency: e.target.value as FormState["frequency"],
                    }))
                  }
                >
                  <option value="monthly">Mensual</option>
                  <option value="weekly">Semanal</option>
                  <option value="yearly">Anual</option>
                </select>
              </label>
              {form.frequency === "monthly" ? (
                <label className="block text-xs">
                  Día del mes
                  <input
                    type="number"
                    min={1}
                    max={31}
                    className={`${TESORERIA_FIELD_CLASS} mt-1`}
                    value={form.dayOfMonth}
                    onChange={(e) => setForm((f) => ({ ...f, dayOfMonth: e.target.value }))}
                  />
                </label>
              ) : null}
              <label className="block text-xs">
                Fecha de inicio
                <input
                  type="date"
                  className={`${TESORERIA_FIELD_CLASS} mt-1`}
                  value={form.startsOn}
                  onChange={(e) => setForm((f) => ({ ...f, startsOn: e.target.value }))}
                />
              </label>
              <label className="block text-xs">
                Fecha de fin (opcional)
                <input
                  type="date"
                  className={`${TESORERIA_FIELD_CLASS} mt-1`}
                  value={form.endsOn}
                  onChange={(e) => setForm((f) => ({ ...f, endsOn: e.target.value }))}
                />
              </label>
              <label className="block text-xs">
                Notas
                <input
                  className={`${TESORERIA_FIELD_CLASS} mt-1`}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </label>
            </div>
            <div className="flex gap-2 border-t border-[var(--copilot-border)] p-4">
              <CopilotPrimaryButton type="submit" disabled={saving}>
                {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear recurrente"}
              </CopilotPrimaryButton>
              <CopilotGhostButton
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  setEditingId(null);
                }}
              >
                Cancelar
              </CopilotGhostButton>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
