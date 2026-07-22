"use client";

import { useMemo, useState } from "react";

import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import {
  copilotCaptionClass,
  copilotInputClass,
  copilotMetricLabelClass,
} from "@/components/copilot/ui/copilot-visual-system";
import { EmptyState as DsEmptyState } from "@/components/copilot/ui/empty-state";
import type { BankMovement } from "@/lib/bank-movements/bank-movements-types";
import { resolveImportedBankMovementAmount } from "@/lib/bank-movements/santander-excel-amount";
import { isBankMovementUiHidden } from "@/lib/bank-movements/bank-movement-visibility";
import type { MovementReconciliationLevel } from "@/lib/bank/canonical/movement-reconciliation-level-labels";
import {
  deriveSimpleMovementState,
  SIMPLE_MOVEMENT_STATE_ACTION_LABEL,
  SIMPLE_MOVEMENT_STATE_LABEL,
  type SimpleMovementState,
} from "@/lib/bank-movements/simple-movement-association";

/**
 * FASE BANK-SIMPLE-FLOW-COMPLETION-001 — Conciliación pasa a ser una lista
 * plana de movimientos (sección 4 del enunciado), reemplazando la vista de
 * clusters por pagador / recibos / cola de revisión como flujo principal.
 * Nunca hace su propio fetch: recibe los movimientos ya cargados por
 * BankMovementsPageClient (misma fuente de verdad que Movimientos, sin
 * duplicar la llamada de red ni poder desincronizarse).
 */

type SortKey = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "date_desc", label: "Más recientes" },
  { value: "date_asc", label: "Más antiguos" },
  { value: "amount_desc", label: "Mayor importe" },
  { value: "amount_asc", label: "Menor importe" },
];

const STATUS_FILTER_OPTIONS: Array<{ value: SimpleMovementState | ""; label: string }> = [
  { value: "", label: "Todos" },
  { value: "sin_cliente", label: "Sin cliente" },
  { value: "asociado", label: "Asociado" },
  { value: "pendiente", label: "Pendiente" },
  { value: "ingreso_no_comercial", label: "Ingreso no comercial" },
  { value: "duplicado", label: "Duplicado" },
  { value: "oculto", label: "Oculto" },
];

export function SimpleReconciliationList({
  movements,
  movementLevels,
  movementDuplicates,
  movementClients,
  canWriteBank,
  onOpenAssociation,
  onRestore,
}: {
  movements: BankMovement[];
  movementLevels: Record<string, MovementReconciliationLevel>;
  movementDuplicates: Record<string, { canonicalMovementId: string }>;
  movementClients: Record<string, { clientCompanyId: string; clientName: string | null }>;
  canWriteBank: boolean;
  onOpenAssociation: (movementId: string) => void;
  onRestore: (movement: BankMovement) => void;
}) {
  const [search, setSearch] = useState("");
  const [currency, setCurrency] = useState<"" | "UYU" | "USD">("");
  const [statusFilter, setStatusFilter] = useState<SimpleMovementState | "">("");
  const [sort, setSort] = useState<SortKey>("date_desc");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const rows = useMemo(() => {
    return movements
      .filter((m) => m.direction === "inflow")
      .map((m) => {
        const hidden = isBankMovementUiHidden(m.metadata);
        const isDuplicate = Boolean(movementDuplicates[m.id]);
        const state = deriveSimpleMovementState({
          direction: m.direction,
          status: m.status,
          isDuplicate,
          isHidden: hidden,
          level: movementLevels[m.id],
        });
        return { movement: m, state, client: movementClients[m.id] ?? null };
      })
      .filter((row): row is typeof row & { state: SimpleMovementState } => row.state !== null);
  }, [movements, movementLevels, movementDuplicates, movementClients]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter && row.state !== statusFilter) return false;
      if (currency && row.movement.currency !== currency) return false;
      if (q) {
        const haystack = `${row.movement.description} ${row.client?.clientName ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, currency, search]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      switch (sort) {
        case "date_asc":
          return a.movement.movement_date.localeCompare(b.movement.movement_date);
        case "amount_desc":
          return resolveImportedBankMovementAmount(b.movement) - resolveImportedBankMovementAmount(a.movement);
        case "amount_asc":
          return resolveImportedBankMovementAmount(a.movement) - resolveImportedBankMovementAmount(b.movement);
        case "date_desc":
        default:
          return b.movement.movement_date.localeCompare(a.movement.movement_date);
      }
    });
    return copy;
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const actionFor = (state: SimpleMovementState, movement: BankMovement) => {
    if (state === "oculto") {
      if (!canWriteBank) return null;
      return (
        <button
          type="button"
          onClick={() => onRestore(movement)}
          className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
        >
          Volver a mostrar
        </button>
      );
    }
    if (state === "duplicado" || state === "ingreso_no_comercial") {
      const label = SIMPLE_MOVEMENT_STATE_ACTION_LABEL[state];
      if (!label) return null;
      return (
        <button
          type="button"
          onClick={() => onOpenAssociation(movement.id)}
          className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
        >
          {label}
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => onOpenAssociation(movement.id)}
        className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
      >
        {SIMPLE_MOVEMENT_STATE_ACTION_LABEL[state]}
      </button>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label className={copilotMetricLabelClass}>Buscar</label>
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Descripción o cliente…"
            className={copilotInputClass}
          />
        </div>
        <div>
          <label className={copilotMetricLabelClass}>Moneda</label>
          <select
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value as "" | "UYU" | "USD");
              setPage(1);
            }}
            className={copilotInputClass}
          >
            <option value="">Todas</option>
            <option value="UYU">UYU</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <div>
          <label className={copilotMetricLabelClass}>Estado</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as SimpleMovementState | "");
              setPage(1);
            }}
            className={copilotInputClass}
          >
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={copilotMetricLabelClass}>Orden</label>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={copilotInputClass}>
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <p className={`${copilotCaptionClass} ml-auto`}>{sorted.length} movimientos</p>
      </div>

      {sorted.length === 0 ? (
        <DsEmptyState
          variant="compact"
          title="No hay movimientos con estos filtros"
          description="Probá con otro estado, moneda o búsqueda."
        />
      ) : (
        <>
          {/* Desktop: tabla plana */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--copilot-border)] text-left text-xs font-semibold text-[var(--copilot-muted)]">
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Descripción Santander</th>
                  <th className="py-2 pr-3">Importe</th>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2 pr-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(({ movement, state, client }) => (
                  <tr key={movement.id} className="border-b border-[var(--copilot-border)]/60">
                    <td className="py-2 pr-3 whitespace-nowrap">{movement.movement_date}</td>
                    <td className="max-w-[320px] truncate py-2 pr-3" title={movement.description}>
                      {movement.description}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {movement.currency} {resolveImportedBankMovementAmount(movement).toLocaleString("es-UY")}
                    </td>
                    <td className="py-2 pr-3">{client?.clientName ?? "—"}</td>
                    <td className="py-2 pr-3">{SIMPLE_MOVEMENT_STATE_LABEL[state]}</td>
                    <td className="py-2 pr-3 text-right">{actionFor(state, movement)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <ul className="space-y-2 sm:hidden">
            {pageRows.map(({ movement, state, client }) => (
              <li key={movement.id} className="rounded-xl border border-[var(--copilot-border)] p-3">
                <p className="text-sm font-semibold text-[var(--copilot-text)]">
                  {movement.currency} {resolveImportedBankMovementAmount(movement).toLocaleString("es-UY")}
                </p>
                <p className={copilotCaptionClass}>{movement.movement_date}</p>
                <p className="mt-1 truncate text-sm text-[var(--copilot-text)]" title={movement.description}>
                  {movement.description}
                </p>
                <p className={`${copilotCaptionClass} mt-1`}>Cliente: {client?.clientName ?? "—"}</p>
                <p className={copilotCaptionClass}>{SIMPLE_MOVEMENT_STATE_LABEL[state]}</p>
                <div className="mt-2">{actionFor(state, movement)}</div>
              </li>
            ))}
          </ul>

          {totalPages > 1 ? (
            <nav className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
              >
                Anterior
              </button>
              <span className={copilotCaptionClass}>
                Página {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
              >
                Siguiente
              </button>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
