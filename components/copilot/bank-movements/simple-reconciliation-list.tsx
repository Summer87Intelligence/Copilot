"use client";

import { useMemo, useState } from "react";

import { BankClientNameLink } from "@/components/copilot/bank-movements/bank-client-name-link";
import { buildBankReturnToQuery } from "@/lib/bank-movements/client-banking-navigation";

import { copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import {
  copilotCaptionClass,
  copilotMetricLabelClass,
  copilotInputClass,
} from "@/components/copilot/ui/copilot-visual-system";
import { EmptyState as DsEmptyState } from "@/components/copilot/ui/empty-state";
import { TablePagination } from "@/components/copilot/ui/table-pagination";
import type { BankMovement } from "@/lib/bank-movements/bank-movements-types";
import {
  BANK_MOVEMENT_DESCRIPTION_CLASS,
  getBankMovementDisplayDescription,
} from "@/lib/bank-movements/bank-movement-display";
import { resolveImportedBankMovementAmount } from "@/lib/bank-movements/santander-excel-amount";
import { isBankMovementUiHidden } from "@/lib/bank-movements/bank-movement-visibility";
import type { MovementReconciliationLevel } from "@/lib/bank/canonical/movement-reconciliation-level-labels";
import {
  deriveSimpleMovementState,
  SIMPLE_MOVEMENT_STATE_ACTION_LABEL,
  SIMPLE_MOVEMENT_STATE_LABEL,
  type SimpleMovementState,
} from "@/lib/bank-movements/simple-movement-association";
import { keyedPageAt, resolveKeyedPage, type KeyedPageState } from "@/lib/ui/keyed-pagination";

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

export function SimpleReconciliationList({
  movements,
  movementLevels,
  movementDuplicates,
  movementClients,
  canWriteBank,
  onOpenAssociation,
  onRestore,
  pageSize = 25,
  onPageSizeChange,
  returnToSearch,
}: {
  movements: BankMovement[];
  movementLevels: Record<string, MovementReconciliationLevel>;
  movementDuplicates: Record<string, { canonicalMovementId: string }>;
  movementClients: Record<string, { clientCompanyId: string; clientName: string | null }>;
  canWriteBank: boolean;
  onOpenAssociation: (movementId: string) => void;
  onRestore: (movement: BankMovement) => void;
  pageSize?: 25 | 50 | 100;
  onPageSizeChange?: (pageSize: number) => void;
  returnToSearch?: string;
}) {
  const [sort, setSort] = useState<SortKey>("date_desc");
  const sortKey = sort;
  const [pageState, setPageState] = useState<KeyedPageState>(() => keyedPageAt(sortKey, 1));
  const page = resolveKeyedPage(pageState, sortKey);
  const setPage = (next: number) => setPageState(keyedPageAt(sortKey, next));

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

  const sorted = useMemo(() => {
    const copy = [...rows];
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
  }, [rows, sort]);

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
    if (state === "duplicado") {
      const canonicalId = movementDuplicates[movement.id]?.canonicalMovementId;
      return (
        <button
          type="button"
          onClick={() => onOpenAssociation(canonicalId ?? movement.id)}
          className={copilotButtonClassName({ variant: "ghost", size: "sm" })}
          aria-label="Ver movimiento canónico (evidencia de duplicado)"
        >
          Ver evidencia
        </button>
      );
    }
    if (state === "ingreso_no_comercial") {
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
    <div className="space-y-3" data-testid="bank-conciliation-list">
      <div className="flex flex-wrap items-end gap-3">
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
          description="Probá limpiar filtros o revisar otro período."
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
                    <td className={`py-2 pr-3 ${BANK_MOVEMENT_DESCRIPTION_CLASS}`}>
                      {getBankMovementDisplayDescription(movement)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {movement.currency} {resolveImportedBankMovementAmount(movement).toLocaleString("es-UY")}
                    </td>
                    <td className="py-2 pr-3">
                      {client?.clientCompanyId && client.clientName ? (
                        <BankClientNameLink
                          clientCompanyId={client.clientCompanyId}
                          clientName={client.clientName}
                          returnTo={buildBankReturnToQuery({
                            tab: "conciliacion",
                            movementId: movement.id,
                            baseQuery: returnToSearch,
                          })}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
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
                <p className={`mt-1 text-sm text-[var(--copilot-text)] ${BANK_MOVEMENT_DESCRIPTION_CLASS}`}>
                  {getBankMovementDisplayDescription(movement)}
                </p>
                <p className={`${copilotCaptionClass} mt-1`}>
                  Cliente:{" "}
                  {client?.clientCompanyId && client.clientName ? (
                    <BankClientNameLink
                      clientCompanyId={client.clientCompanyId}
                      clientName={client.clientName}
                      returnTo={buildBankReturnToQuery({
                        tab: "conciliacion",
                        movementId: movement.id,
                        baseQuery: returnToSearch,
                      })}
                    />
                  ) : (
                    "—"
                  )}
                </p>
                <p className={copilotCaptionClass}>{SIMPLE_MOVEMENT_STATE_LABEL[state]}</p>
                <div className="mt-2">{actionFor(state, movement)}</div>
              </li>
            ))}
          </ul>

          <TablePagination
            className="pt-2"
            page={currentPage}
            totalPages={totalPages}
            from={sorted.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
            to={Math.min(currentPage * pageSize, sorted.length)}
            total={sorted.length}
            itemLabel="movimientos"
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={onPageSizeChange}
          />
        </>
      )}
    </div>
  );
}
