"use client";

import { useCallback, useEffect, useState } from "react";
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
  TESORERIA_TABLE_CLASS,
  TESORERIA_TD_CLASS,
  TESORERIA_TH_CLASS,
} from "@/components/copilot/tesoreria/tesoreria-ui";
import type { TreasuryWorkspace } from "@/hooks/use-treasury-workspace";
import { copilotApiFetch } from "@/lib/copilot-fetch";
import { formatTreasuryMoney } from "@/lib/treasury/treasury-dashboard";
import {
  filterGeneratedPaymentsByTemplate,
  formatNextOccurrenceDisplay,
  formatRecurrenceFrequency,
  getObligationStatusLabel,
  getRecurringTemplateStatusLabel,
} from "@/lib/treasury/treasury-recurring-payments-helpers";
import {
  RECURRING_PAYMENT_CATEGORIES,
  type TreasuryRecurringPayment,
} from "@/lib/treasury/treasury-recurring-payments";
import type { PlannedCashObligation } from "@/lib/treasury/treasury-types";

type Props = {
  workspace: TreasuryWorkspace;
  onGoToPagos?: () => void;
};

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

type ModalKind =
  | { type: "none" }
  | { type: "pause"; row: TreasuryRecurringPayment }
  | { type: "reactivate"; row: TreasuryRecurringPayment }
  | { type: "delete"; row: TreasuryRecurringPayment; cancelPending: boolean }
  | { type: "payments"; row: TreasuryRecurringPayment };

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

function obligationStatusTone(
  obl: PlannedCashObligation
): "success" | "neutral" | "warning" | "danger" {
  switch (obl.status) {
    case "paid": return "success";
    case "cancelled": return "neutral";
    case "overdue": return "danger";
    case "confirmed": return "warning";
    default: return "neutral";
  }
}

export function TreasuryRecurringPaymentsPanel({ workspace, onGoToPagos }: Props) {
  const [items, setItems] = useState<TreasuryRecurringPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState<ModalKind>({ type: "none" });
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const editingItem = editingId ? items.find((i) => i.id === editingId) ?? null : null;

  useEffect(() => {
    if (!openMenuId) return;
    function close() { setOpenMenuId(null); }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openMenuId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (submitting || saving) return;
      if (openMenuId) { setOpenMenuId(null); return; }
      if (modal.type !== "none") { setModal({ type: "none" }); return; }
      if (drawerOpen) { setDrawerOpen(false); setEditingId(null); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal, drawerOpen, openMenuId, submitting, saving]);

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

  async function confirmPause(row: TreasuryRecurringPayment) {
    setSubmitting(true);
    try {
      const res = await copilotApiFetch(
        `/api/copilot/treasury/recurring-obligations/${row.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: false }),
        }
      );
      const json = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !json.ok) {
        workspace.notify("error", json.message ?? "No se pudo pausar.");
        return;
      }
      workspace.notify("success", "Recurrente pausado.");
      setModal({ type: "none" });
      void load();
      await workspace.refetch();
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmReactivate(row: TreasuryRecurringPayment) {
    setSubmitting(true);
    try {
      const res = await copilotApiFetch(
        `/api/copilot/treasury/recurring-obligations/${row.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: true }),
        }
      );
      const json = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !json.ok) {
        workspace.notify("error", json.message ?? "No se pudo reactivar.");
        return;
      }
      workspace.notify("success", "Recurrente reactivado.");
      setModal({ type: "none" });
      void load();
      await workspace.refetch();
      await runGenerateHorizon();
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete(row: TreasuryRecurringPayment, cancelPending: boolean) {
    setSubmitting(true);
    try {
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
      setModal({ type: "none" });
      void load();
      await workspace.refetch();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-4">
      <CopilotSectionTitle
        title="Recurrentes"
        subtitle="Copilot genera pagos futuros automáticamente en cada período. Pausar suspende sin borrar historial."
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
                <th className={TESORERIA_TH_CLASS}>Categoría</th>
                <th className={TESORERIA_TH_CLASS}>Monto</th>
                <th className={TESORERIA_TH_CLASS}>Frecuencia</th>
                <th className={TESORERIA_TH_CLASS}>Próximo</th>
                <th className={TESORERIA_TH_CLASS}>Estado</th>
                <th className={TESORERIA_TH_CLASS}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td className={TESORERIA_TD_CLASS}>
                    <span className="font-medium">{row.title}</span>
                  </td>
                  <td className={TESORERIA_TD_CLASS}>
                    <span className="block text-[var(--copilot-ink)]">{row.category}</span>
                    <span className="text-[11px] text-[var(--copilot-ink-muted)]">
                      {row.metadata?.direction === "income" ? "Ingreso" : "Egreso"}
                    </span>
                  </td>
                  <td className={`${TESORERIA_TD_CLASS} tabular-nums`}>
                    {formatTreasuryMoney(row.amount, row.currency)}
                  </td>
                  <td className={TESORERIA_TD_CLASS}>
                    {formatRecurrenceFrequency(row)}
                  </td>
                  <td className={`${TESORERIA_TD_CLASS} tabular-nums`}>
                    {formatNextOccurrenceDisplay(row)}
                  </td>
                  <td className={TESORERIA_TD_CLASS}>
                    <CopilotBadge tone={row.active ? "success" : "neutral"}>
                      {getRecurringTemplateStatusLabel(row)}
                    </CopilotBadge>
                  </td>
                  <td className={TESORERIA_TD_CLASS}>
                    <div className="flex flex-wrap items-center gap-1">
                      <CopilotGhostButton
                        type="button"
                        onClick={() => openEdit(row)}
                      >
                        Editar
                      </CopilotGhostButton>
                      {row.active ? (
                        <CopilotGhostButton
                          type="button"
                          onClick={() => setModal({ type: "pause", row })}
                        >
                          Pausar
                        </CopilotGhostButton>
                      ) : (
                        <CopilotGhostButton
                          type="button"
                          onClick={() => setModal({ type: "reactivate", row })}
                        >
                          Reactivar
                        </CopilotGhostButton>
                      )}
                      <CopilotGhostButton
                        type="button"
                        onClick={() => setModal({ type: "payments", row })}
                      >
                        Ver pagos
                      </CopilotGhostButton>
                      <div className="relative">
                        <button
                          type="button"
                          className="rounded p-1 text-[var(--copilot-ink-muted)] transition hover:bg-[rgba(44,40,37,0.06)] hover:text-[var(--copilot-ink)]"
                          aria-label="Más opciones"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === row.id ? null : row.id);
                          }}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        {openMenuId === row.id ? (
                          <div className="absolute right-0 top-full z-10 mt-1 min-w-[120px] rounded-lg border border-[var(--copilot-border)] bg-white py-1 shadow-lg">
                            <button
                              type="button"
                              className="w-full px-3 py-1.5 text-left text-xs text-rose-600 transition hover:bg-rose-50"
                              onClick={() => {
                                setOpenMenuId(null);
                                setModal({ type: "delete", row, cancelPending: true });
                              }}
                            >
                              Eliminar
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal: Pausar ── */}
      {modal.type === "pause" ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !submitting) setModal({ type: "none" }); }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-[var(--copilot-border)] bg-white p-6 shadow-xl">
            <h3 className="text-sm font-semibold text-[var(--copilot-ink)]">
              Pausar &ldquo;{modal.row.title}&rdquo;
            </h3>
            <p className="mt-2 text-sm text-[var(--copilot-ink-muted)]">
              Pausar este recurrente suspende futuros pagos. No borra los pagos ya registrados
              ni el historial.
            </p>
            <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">
              Podés reactivarlo en cualquier momento desde esta pantalla.
            </p>
            <div className="mt-5 flex gap-2">
              <CopilotPrimaryButton
                type="button"
                disabled={submitting}
                onClick={() => void confirmPause(modal.row)}
              >
                {submitting ? "Pausando…" : "Pausar recurrente"}
              </CopilotPrimaryButton>
              <CopilotGhostButton
                type="button"
                disabled={submitting}
                onClick={() => setModal({ type: "none" })}
              >
                Cancelar
              </CopilotGhostButton>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Modal: Reactivar ── */}
      {modal.type === "reactivate" ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !submitting) setModal({ type: "none" }); }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-[var(--copilot-border)] bg-white p-6 shadow-xl">
            <h3 className="text-sm font-semibold text-[var(--copilot-ink)]">
              Reactivar &ldquo;{modal.row.title}&rdquo;
            </h3>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--copilot-ink-muted)]">Monto</dt>
                <dd className="tabular-nums font-medium">
                  {formatTreasuryMoney(modal.row.amount, modal.row.currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--copilot-ink-muted)]">Frecuencia</dt>
                <dd>{formatRecurrenceFrequency(modal.row)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--copilot-ink-muted)]">Próximo vencimiento</dt>
                <dd className="tabular-nums">
                  {modal.row.nextOccurrenceDate || "—"}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-[var(--copilot-ink-muted)]">
              Al reactivar, Copilot volverá a generar pagos futuros desde la próxima fecha
              válida. No se recrean pagos de períodos anteriores.
            </p>
            <div className="mt-5 flex gap-2">
              <CopilotPrimaryButton
                type="button"
                disabled={submitting}
                onClick={() => void confirmReactivate(modal.row)}
              >
                {submitting ? "Reactivando…" : "Reactivar"}
              </CopilotPrimaryButton>
              <CopilotGhostButton
                type="button"
                disabled={submitting}
                onClick={() => setModal({ type: "none" })}
              >
                Cancelar
              </CopilotGhostButton>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Modal: Eliminar ── */}
      {modal.type === "delete" ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !submitting) setModal({ type: "none" }); }}
        >
          <div className="w-full max-w-sm rounded-2xl border border-[var(--copilot-border)] bg-white p-6 shadow-xl">
            <h3 className="text-sm font-semibold text-rose-700">
              Eliminar &ldquo;{modal.row.title}&rdquo;
            </h3>
            <p className="mt-2 text-sm text-[var(--copilot-ink-muted)]">
              Eliminar este recurrente detendrá futuras generaciones. Los pagos ya pagados se
              conservan como historial.
            </p>
            <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-gray-300"
                checked={modal.cancelPending}
                onChange={(e) =>
                  setModal((m) =>
                    m.type === "delete" ? { ...m, cancelPending: e.target.checked } : m
                  )
                }
              />
              <span className="text-[var(--copilot-ink-muted)]">
                Cancelar también los pagos futuros pendientes ya generados
                <span className="block text-xs">
                  Los pagos ya pagados no se modifican.
                </span>
              </span>
            </label>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                disabled={submitting}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
                onClick={() => void confirmDelete(modal.row, modal.cancelPending)}
              >
                {submitting ? "Eliminando…" : "Eliminar recurrente"}
              </button>
              <CopilotGhostButton
                type="button"
                disabled={submitting}
                onClick={() => setModal({ type: "none" })}
              >
                Cancelar
              </CopilotGhostButton>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Drawer: Ver pagos generados ── */}
      {modal.type === "payments" ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/30"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setModal({ type: "none" }); }}
        >
          <div className="flex h-full w-full max-w-md flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--copilot-border)] px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold">
                  Pagos de &ldquo;{modal.row.title}&rdquo;
                </h3>
                <p className="text-xs text-[var(--copilot-ink-muted)]">
                  {formatTreasuryMoney(modal.row.amount, modal.row.currency)} ·{" "}
                  {formatRecurrenceFrequency(modal.row)}
                </p>
              </div>
              <button
                type="button"
                className="rounded p-1 text-[var(--copilot-ink-muted)] hover:text-[var(--copilot-ink)]"
                onClick={() => setModal({ type: "none" })}
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <GeneratedPaymentsList
              obligations={workspace.obligations}
              templateId={modal.row.id}
              onGoToPagos={onGoToPagos}
            />
          </div>
        </div>
      ) : null}

      {/* ── Drawer: Crear / Editar ── */}
      {drawerOpen ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/30"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) { setDrawerOpen(false); setEditingId(null); } }}
        >
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
            <div className="border-t border-[var(--copilot-border)]">
              <div className="flex gap-2 p-4">
                <CopilotPrimaryButton type="submit" disabled={saving}>
                  {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear recurrente"}
                </CopilotPrimaryButton>
                <CopilotGhostButton
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setDrawerOpen(false);
                    setEditingId(null);
                  }}
                >
                  Cancelar
                </CopilotGhostButton>
              </div>
              {editingItem ? (
                <div className="px-4 pb-4">
                  {editingItem.active ? (
                    <button
                      type="button"
                      className="text-left text-xs text-[var(--copilot-ink-muted)] transition hover:text-amber-700"
                      onClick={() => {
                        setDrawerOpen(false);
                        setEditingId(null);
                        setModal({ type: "pause", row: editingItem });
                      }}
                    >
                      Pausar recurrente
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="text-left text-xs text-[var(--copilot-ink-muted)] transition hover:text-rose-700"
                      onClick={() => {
                        setDrawerOpen(false);
                        setEditingId(null);
                        setModal({ type: "delete", row: editingItem, cancelPending: true });
                      }}
                    >
                      Eliminar recurrente
                    </button>
                  )}
                  <p className="mt-0.5 text-[11px] text-[var(--copilot-ink-muted)]">
                    Esto detiene futuras generaciones. No borra pagos ya pagados.
                  </p>
                </div>
              ) : null}
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

// ── Componente: lista de pagos generados ──────────────────────────────────────

type GeneratedPaymentsListProps = {
  obligations: readonly PlannedCashObligation[];
  templateId: string;
  onGoToPagos?: () => void;
};

function GeneratedPaymentsList({
  obligations,
  templateId,
  onGoToPagos,
}: GeneratedPaymentsListProps) {
  const payments = filterGeneratedPaymentsByTemplate(obligations, templateId).sort(
    (a, b) => b.dueDate.localeCompare(a.dueDate)
  );

  if (payments.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm text-[var(--copilot-ink-muted)]">
          No se encontraron pagos generados por este recurrente.
        </p>
        <p className="text-xs text-[var(--copilot-ink-muted)]">
          Los pagos aparecen cuando Copilot genera el horizonte (al crear o reactivar).
        </p>
        {onGoToPagos ? (
          <button
            type="button"
            className="mt-2 text-xs text-blue-600 underline hover:text-blue-800"
            onClick={onGoToPagos}
          >
            Ver pestaña Pagos
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-[var(--copilot-border)]">
              <th className="px-4 py-2 text-left font-semibold text-[var(--copilot-ink-muted)]">
                Fecha
              </th>
              <th className="px-4 py-2 text-right font-semibold text-[var(--copilot-ink-muted)]">
                Monto
              </th>
              <th className="px-4 py-2 text-left font-semibold text-[var(--copilot-ink-muted)]">
                Estado
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--copilot-border)]">
            {payments.map((obl) => (
              <tr key={obl.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-2 tabular-nums text-[var(--copilot-ink)]">
                  {obl.dueDate}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-[var(--copilot-ink)]">
                  {formatTreasuryMoney(
                    obl.amountFinal ?? obl.amountEstimated,
                    obl.currencyCode
                  )}
                </td>
                <td className="px-4 py-2">
                  <CopilotBadge tone={obligationStatusTone(obl)}>
                    {getObligationStatusLabel(obl.status)}
                  </CopilotBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {onGoToPagos ? (
        <div className="border-t border-[var(--copilot-border)] p-4">
          <button
            type="button"
            className="text-xs text-blue-600 underline hover:text-blue-800"
            onClick={onGoToPagos}
          >
            Ver todos en la pestaña Pagos
          </button>
        </div>
      ) : null}
    </div>
  );
}
