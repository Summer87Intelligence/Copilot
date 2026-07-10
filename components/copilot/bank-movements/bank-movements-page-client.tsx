"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Landmark, Pencil, Plus, Trash2, X } from "lucide-react";

import { BankMovementsFiltersBar } from "@/components/copilot/bank-movements/bank-movements-filters-bar";
import { BankMovementsImportPanel } from "@/components/copilot/bank-movements/bank-movements-import-panel";
import { BankMovementsReconciliationPanel } from "@/components/copilot/bank-movements/bank-movements-reconciliation-panel";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import {
  COPILOT_GRID_GAP,
  COPILOT_PAGE_GAP,
  copilotCaptionClass,
  copilotCardStandardClass,
  copilotInputClass,
  copilotMetricLabelClass,
  copilotMetricValueClass,
  copilotSectionTitleClass,
} from "@/components/copilot/ui/copilot-visual-system";
import {
  DEFAULT_BANK_MOVEMENTS_LIST_FILTERS,
  filterBankMovements,
  type BankMovementsListFilters,
} from "@/lib/bank-movements/bank-movements-filters";
import { resolveImportedBankMovementAmount } from "@/lib/bank-movements/santander-excel-amount";
import {
  BANK_MOVEMENT_DIRECTION_LABELS,
  BANK_MOVEMENT_STATUS_LABELS,
  type BankMovement,
  type BankMovementDirection,
  type BankMovementStatus,
  type BankStatementImport,
} from "@/lib/bank-movements/bank-movements-types";

type BankTab = "importar" | "movimientos" | "conciliacion" | "historial";

const TABS: Array<{ id: BankTab; label: string }> = [
  { id: "importar", label: "Importar" },
  { id: "movimientos", label: "Movimientos" },
  { id: "conciliacion", label: "Conciliación" },
  { id: "historial", label: "Historial" },
];

type ListResponse<T> = { ok: boolean; data?: T[]; message?: string };
type WriteResponse = { ok: boolean; data?: BankMovement; error?: string };

const dateFormatter = new Intl.DateTimeFormat("es-UY", { dateStyle: "medium" });
const numberFormatter = new Intl.NumberFormat("es-UY", { minimumFractionDigits: 2 });

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

type FormState = {
  id: string | null;
  movement_date: string;
  description: string;
  amount: string;
  currency: "UYU" | "USD";
  direction: BankMovementDirection;
  account_label: string;
  bank_reference: string;
};

function emptyForm(): FormState {
  return {
    id: null,
    movement_date: todayYmd(),
    description: "",
    amount: "",
    currency: "UYU",
    direction: "inflow",
    account_label: "",
    bank_reference: "",
  };
}

function formFromMovement(m: BankMovement): FormState {
  return {
    id: m.id,
    movement_date: m.movement_date.slice(0, 10),
    description: m.description,
    amount: String(m.amount),
    currency: m.currency === "USD" ? "USD" : "UYU",
    direction: m.direction,
    account_label: m.account_label ?? "",
    bank_reference: m.bank_reference ?? "",
  };
}

export function BankMovementsPageClient() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<BankTab>("movimientos");
  const deepLinkApplied = useRef(false);

  // Deep link desde el cuaderno de trabajo: ?tab=reconciliation abre Conciliación
  // (el panel ya filtra "Con sugerencia" por defecto). No rompe la navegación normal.
  useEffect(() => {
    if (deepLinkApplied.current) return;
    const requestedTab = searchParams.get("tab");
    if (requestedTab === "reconciliation" || requestedTab === "conciliacion") {
      setTab("conciliacion");
    }
    deepLinkApplied.current = true;
  }, [searchParams]);
  const [movements, setMovements] = useState<BankMovement[]>([]);
  const [imports, setImports] = useState<BankStatementImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; message: string } | null>(null);
  const [movementFilters, setMovementFilters] = useState<BankMovementsListFilters>(
    DEFAULT_BANK_MOVEMENTS_LIST_FILTERS
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [movementsRes, importsRes] = await Promise.all([
        fetch("/api/copilot/bank-movements"),
        fetch("/api/copilot/bank-movements/imports"),
      ]);
      const movementsJson = (await movementsRes.json()) as ListResponse<BankMovement>;
      const importsJson = (await importsRes.json()) as ListResponse<BankStatementImport>;
      if (movementsJson.ok) setMovements(movementsJson.data ?? []);
      if (importsJson.ok) setImports(importsJson.data ?? []);
    } catch {
      // Estado vacío ya cubre el caso sin datos.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const counts = useMemo(() => {
    const monthPrefix = todayYmd().slice(0, 7);
    return {
      pending: movements.filter((m) => m.status === "pending" || m.status === "needs_review").length,
      inflowMonth: movements.filter(
        (m) => m.direction === "inflow" && m.movement_date.slice(0, 7) === monthPrefix
      ).length,
      outflowMonth: movements.filter(
        (m) => m.direction === "outflow" && m.movement_date.slice(0, 7) === monthPrefix
      ).length,
      reviewed: movements.filter((m) => m.status === "matched" || m.status === "ignored").length,
    };
  }, [movements]);

  const summaryCards = [
    { label: "Pendientes de identificar", value: counts.pending },
    { label: "Entradas del mes", value: counts.inflowMonth },
    { label: "Salidas del mes", value: counts.outflowMonth },
    { label: "Revisados", value: counts.reviewed },
  ];

  const filteredMovements = useMemo(
    () => filterBankMovements(movements, movementFilters),
    [movements, movementFilters]
  );

  const submitForm = useCallback(async () => {
    if (!form) return;
    const amountNumber = Number(form.amount);
    if (!form.description.trim() || !Number.isFinite(amountNumber) || amountNumber <= 0) {
      setFeedback({ tone: "error", message: "Completá descripción y un monto mayor a 0." });
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        movement_date: form.movement_date,
        description: form.description.trim(),
        amount: amountNumber,
        currency: form.currency,
        direction: form.direction,
        account_label: form.account_label.trim() || null,
        bank_reference: form.bank_reference.trim() || null,
      };
      const res = await fetch(
        form.id ? `/api/copilot/bank-movements/${form.id}` : "/api/copilot/bank-movements",
        {
          method: form.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = (await res.json()) as WriteResponse;
      if (!res.ok || !json.ok) {
        setFeedback({ tone: "error", message: json.error ?? "No se pudo guardar el movimiento." });
        return;
      }
      setForm(null);
      setFeedback({ tone: "ok", message: form.id ? "Movimiento actualizado." : "Movimiento creado." });
      await load();
    } finally {
      setSubmitting(false);
    }
  }, [form, load]);

  const changeStatus = useCallback(
    async (movement: BankMovement, status: BankMovementStatus) => {
      const res = await fetch(`/api/copilot/bank-movements/${movement.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = (await res.json()) as WriteResponse;
      if (!res.ok || !json.ok) {
        setFeedback({ tone: "error", message: json.error ?? "No se pudo cambiar el estado." });
        return;
      }
      setFeedback({ tone: "ok", message: `Marcado como ${BANK_MOVEMENT_STATUS_LABELS[status]}.` });
      await load();
    },
    [load]
  );

  const remove = useCallback(
    async (movement: BankMovement) => {
      if (!window.confirm("¿Eliminar este movimiento bancario?")) return;
      const res = await fetch(`/api/copilot/bank-movements/${movement.id}`, { method: "DELETE" });
      const json = (await res.json()) as WriteResponse;
      if (!res.ok || !json.ok) {
        setFeedback({ tone: "error", message: json.error ?? "No se pudo eliminar." });
        return;
      }
      setFeedback({ tone: "ok", message: "Movimiento eliminado." });
      await load();
    },
    [load]
  );

  return (
    <div className={COPILOT_PAGE_GAP}>
      <CopilotPageHeader
        title="Movimientos bancarios"
        description="Movimientos bancarios para revisar y conciliar manualmente."
      />

      {feedback ? (
        <div
          className={`rounded-xl border px-3 py-2 text-xs ${
            feedback.tone === "ok"
              ? "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]"
              : "border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className={`grid grid-cols-2 lg:grid-cols-4 ${COPILOT_GRID_GAP}`}>
        {summaryCards.map((card) => (
          <div key={card.label} className={copilotCardStandardClass}>
            <p className={copilotMetricLabelClass}>{card.label}</p>
            <p className={copilotMetricValueClass}>{loading ? "…" : card.value}</p>
          </div>
        ))}
      </div>

      <nav
        className="flex flex-wrap gap-2 rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-1.5 shadow-sm"
        aria-label="Secciones de movimientos bancarios"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={copilotButtonClassName({
              variant: tab === item.id ? "primary" : "ghost",
              size: "sm",
              className: tab === item.id ? "" : "!border-transparent",
            })}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "importar" ? (
        <BankMovementsImportPanel
          onImportComplete={load}
          onGoToMovements={() => setTab("movimientos")}
        />
      ) : null}

      {tab === "movimientos" ? (
        <section className={copilotCardStandardClass}>
          <div className="flex items-center justify-between gap-3">
            <h2 className={copilotSectionTitleClass}>Movimientos del banco</h2>
            <button
              type="button"
              onClick={() => setForm(form ? null : emptyForm())}
              className={copilotButtonClassName({ variant: "primary", size: "sm" })}
            >
              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
              Agregar movimiento
            </button>
          </div>

          {form ? (
            <MovementForm
              form={form}
              submitting={submitting}
              onChange={setForm}
              onCancel={() => setForm(null)}
              onSubmit={submitForm}
            />
          ) : null}

          <div className="mt-4">
            <BankMovementsFiltersBar
              mode="movements"
              filters={movementFilters}
              onChange={(next) => setMovementFilters(next as BankMovementsListFilters)}
              onClear={() => setMovementFilters(DEFAULT_BANK_MOVEMENTS_LIST_FILTERS)}
              showingCount={filteredMovements.length}
              totalCount={movements.length}
              countLabel="movimientos"
            />
          </div>

          {movements.length === 0 ? (
            <div className="mt-4">
              <p className={copilotCaptionClass}>
                {loading
                  ? "Cargando movimientos…"
                  : "Todavía no hay movimientos bancarios cargados."}
              </p>
              {!loading ? (
                <p className={`${copilotCaptionClass} mt-1`}>
                  En esta primera versión podés cargarlos manualmente. La importación automática
                  queda para una próxima etapa.
                </p>
              ) : null}
            </div>
          ) : filteredMovements.length === 0 ? (
            <div className="mt-4">
              <p className={copilotCaptionClass}>No hay movimientos con estos filtros.</p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-[var(--copilot-muted)]">
                    <th className="py-2 pr-3">Fecha</th>
                    <th className="py-2 pr-3">Descripción</th>
                    <th className="hidden py-2 pr-3 sm:table-cell">Fuente</th>
                    <th className="py-2 pr-3 text-right">Entrada</th>
                    <th className="py-2 pr-3 text-right">Salida</th>
                    <th className="py-2 pr-3">Estado</th>
                    <th className="py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMovements.map((m) => (
                    <tr key={m.id} className="border-t border-[var(--copilot-border)] align-top">
                      <td className="py-2 pr-3 whitespace-nowrap">{formatDate(m.movement_date)}</td>
                      <td className="py-2 pr-3">
                        {m.description}
                        {m.bank_reference ? (
                          <span className={`block ${copilotCaptionClass}`}>Ref: {m.bank_reference}</span>
                        ) : null}
                      </td>
                      <td className="hidden py-2 pr-3 sm:table-cell">{m.account_label ?? m.bank_name}</td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">
                        {m.direction === "inflow"
                          ? `${m.currency} ${numberFormatter.format(resolveImportedBankMovementAmount(m))}`
                          : "—"}
                      </td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">
                        {m.direction === "outflow"
                          ? `${m.currency} ${numberFormatter.format(resolveImportedBankMovementAmount(m))}`
                          : "—"}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">{BANK_MOVEMENT_STATUS_LABELS[m.status]}</td>
                      <td className="py-2">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setForm(formFromMovement(m))}
                            className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
                            aria-label="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                          </button>
                          {m.status !== "matched" ? (
                            <button
                              type="button"
                              onClick={() => void changeStatus(m, "matched")}
                              className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
                            >
                              Conciliar
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void changeStatus(m, "pending")}
                              className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
                            >
                              Reabrir
                            </button>
                          )}
                          {m.status !== "ignored" ? (
                            <button
                              type="button"
                              onClick={() => void changeStatus(m, "ignored")}
                              className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
                            >
                              Ignorar
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void remove(m)}
                            className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
                            aria-label="Eliminar"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === "conciliacion" ? (
        <BankMovementsReconciliationPanel
          onMovementUpdated={load}
          onViewMovement={() => setTab("movimientos")}
        />
      ) : null}

      {tab === "historial" ? (
        <section className={copilotCardStandardClass}>
          <h2 className={copilotSectionTitleClass}>Importaciones realizadas</h2>
          {imports.length === 0 ? (
            <p className={`${copilotCaptionClass} mt-2`}>
              {loading
                ? "Cargando historial…"
                : "Todavía no hay importaciones. Acá vas a ver cada extracto importado cuando la importación automática esté disponible."}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {imports.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[var(--copilot-border)] px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Landmark className="h-4 w-4 shrink-0 text-[var(--copilot-muted)]" aria-hidden />
                    <span className="truncate">
                      {item.file_name ?? item.bank_name} · {item.row_count} movimientos
                    </span>
                  </span>
                  <span className={`${copilotCaptionClass} whitespace-nowrap`}>
                    {formatDate(item.imported_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

function MovementForm({
  form,
  submitting,
  onChange,
  onCancel,
  onSubmit,
}: {
  form: FormState;
  submitting: boolean;
  onChange: (f: FormState) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="mt-4 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--copilot-text)]">
          {form.id ? "Editar movimiento" : "Nuevo movimiento"}
        </h3>
        <button type="button" onClick={onCancel} aria-label="Cerrar" className="text-[var(--copilot-muted)]">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Fecha</span>
          <input
            type="date"
            value={form.movement_date}
            onChange={(e) => onChange({ ...form, movement_date: e.target.value })}
            className={copilotInputClass}
            required
          />
        </label>
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Tipo</span>
          <select
            value={form.direction}
            onChange={(e) => onChange({ ...form, direction: e.target.value as BankMovementDirection })}
            className={copilotInputClass}
          >
            <option value="inflow">{BANK_MOVEMENT_DIRECTION_LABELS.inflow}</option>
            <option value="outflow">{BANK_MOVEMENT_DIRECTION_LABELS.outflow}</option>
          </select>
        </label>
        <label className="block text-xs sm:col-span-2">
          <span className="text-[var(--copilot-muted)]">Descripción</span>
          <input
            type="text"
            value={form.description}
            onChange={(e) => onChange({ ...form, description: e.target.value })}
            className={copilotInputClass}
            maxLength={500}
            required
          />
        </label>
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Monto</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={form.amount}
            onChange={(e) => onChange({ ...form, amount: e.target.value })}
            className={copilotInputClass}
            required
          />
        </label>
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Moneda</span>
          <select
            value={form.currency}
            onChange={(e) => onChange({ ...form, currency: e.target.value as "UYU" | "USD" })}
            className={copilotInputClass}
          >
            <option value="UYU">UYU</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Cuenta / fuente</span>
          <input
            type="text"
            value={form.account_label}
            onChange={(e) => onChange({ ...form, account_label: e.target.value })}
            className={copilotInputClass}
          />
        </label>
        <label className="block text-xs">
          <span className="text-[var(--copilot-muted)]">Referencia banco</span>
          <input
            type="text"
            value={form.bank_reference}
            onChange={(e) => onChange({ ...form, bank_reference: e.target.value })}
            className={copilotInputClass}
          />
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={submitting}
          className={copilotButtonClassName({ variant: "primary", size: "sm" })}
        >
          {submitting ? "Guardando…" : form.id ? "Guardar cambios" : "Crear movimiento"}
        </button>
      </div>
    </form>
  );
}
