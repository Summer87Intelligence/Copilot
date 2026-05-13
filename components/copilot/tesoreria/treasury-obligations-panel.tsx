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
import { effectivePlannedObligationStatus } from "@/lib/treasury/treasury-obligation-status";
import { formatTreasuryMoney } from "@/lib/treasury/treasury-dashboard";
import {
  obligationFormSchema,
  parseMoneyInput,
  zodFieldErrors,
} from "@/lib/treasury/treasury-form-schemas";
import type { PlannedCashObligation, PlannedObligationType } from "@/lib/treasury/treasury-types";

const OBLIGATION_PRESETS: { type: PlannedObligationType; label: string }[] = [
  { type: "bps", label: "BPS" },
  { type: "dgi", label: "DGI" },
  { type: "bonus", label: "Aguinaldos" },
  { type: "vacation", label: "Licencias" },
  { type: "travel", label: "Viajes" },
  { type: "salary", label: "Sueldos" },
  { type: "service", label: "Servicios" },
  { type: "supplier", label: "Proveedores" },
  { type: "other", label: "Personalizado" },
];

type Props = {
  workspace: TreasuryWorkspace;
  asOfDate: string;
};

export function TreasuryObligationsPanel({ workspace, asOfDate }: Props) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    title: "",
    obligationType: "bps" as PlannedObligationType,
    amountEstimated: "",
    currencyCode: "UYU" as "UYU" | "USD",
    dueDate: new Date().toISOString().slice(0, 10),
    recurrence: "none",
    priority: "medium",
    notes: "",
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workspace.obligations.filter((o) => {
      if (!q) return true;
      return o.title.toLowerCase().includes(q) || (o.notes ?? "").toLowerCase().includes(q);
    });
  }, [workspace.obligations, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / TESORERIA_PAGE_SIZE));
  const pageItems = filtered.slice(page * TESORERIA_PAGE_SIZE, (page + 1) * TESORERIA_PAGE_SIZE);

  function statusLabel(row: PlannedCashObligation): string {
    const effective = effectivePlannedObligationStatus(row.status, row.dueDate, asOfDate);
    if (effective === "planned") return "pending";
    return effective;
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
      amount_estimated: parseMoneyInput(parsed.data.amountEstimated),
      currency_code: parsed.data.currencyCode,
      due_date: parsed.data.dueDate,
      recurrence: parsed.data.recurrence,
      priority: parsed.data.priority,
      notes: parsed.data.notes?.trim() || null,
    });
    setSaving(false);
    if (result) {
      setDrawerOpen(false);
      setErrors({});
    }
  }

  return (
    <section className="space-y-4">
      <CopilotSectionTitle
        title="Obligaciones futuras"
        subtitle="Compromisos de caja con estados operativos."
        action={
          <CopilotPrimaryButton type="button" onClick={() => setDrawerOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva obligación
          </CopilotPrimaryButton>
        }
      />

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
                <th className={TESORERIA_TH_CLASS}>Prioridad</th>
                <th className={TESORERIA_TH_CLASS}>Estado</th>
                <th className={TESORERIA_TH_CLASS}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((row) => (
                <tr key={row.id}>
                  <td className={TESORERIA_TD_CLASS}>{row.title}</td>
                  <td className={TESORERIA_TD_CLASS}>{row.obligationType}</td>
                  <td className={TESORERIA_TD_CLASS}>
                    {formatTreasuryMoney(row.amountEstimated, row.currencyCode)}
                  </td>
                  <td className={TESORERIA_TD_CLASS}>{row.dueDate}</td>
                  <td className={TESORERIA_TD_CLASS}>{row.priority}</td>
                  <td className={TESORERIA_TD_CLASS}>
                    <CopilotBadge tone={statusLabel(row) === "overdue" ? "danger" : "neutral"}>
                      {statusLabel(row)}
                    </CopilotBadge>
                  </td>
                  <td className={TESORERIA_TD_CLASS}>
                    <div className="flex flex-wrap gap-2">
                      <CopilotGhostButton type="button" onClick={() => void workspace.confirmObligation(row.id)}>
                        Confirmar
                      </CopilotGhostButton>
                      <CopilotGhostButton type="button" onClick={() => void workspace.paidObligation(row.id)}>
                        Pagada
                      </CopilotGhostButton>
                      <CopilotGhostButton type="button" onClick={() => void workspace.cancelObligation(row.id)}>
                        Cancelar
                      </CopilotGhostButton>
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
            <h3 className="text-lg font-semibold text-[var(--copilot-ink)]">Nueva obligación</h3>
            <form className="mt-4 space-y-3" onSubmit={handleCreate}>
              <label className="block text-sm">
                Plantilla
                <select
                  className={TESORERIA_FIELD_CLASS}
                  value={form.obligationType}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      obligationType: e.target.value as PlannedObligationType,
                      title: f.title || OBLIGATION_PRESETS.find((p) => p.type === e.target.value)?.label || "",
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
                      setForm((f) => ({
                        ...f,
                        currencyCode: e.target.value as "UYU" | "USD",
                      }))
                    }
                  >
                    <option value="UYU">UYU</option>
                    <option value="USD">USD</option>
                  </select>
                </label>
              </div>
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
    </section>
  );
}
