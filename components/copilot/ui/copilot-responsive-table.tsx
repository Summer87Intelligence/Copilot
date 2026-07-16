"use client";

import { type ReactNode } from "react";
import { ArrowDownUp, ChevronDown, ChevronUp } from "lucide-react";

import type { SortDirection, SortState } from "@/lib/ui/table-sort-model";

export type CopilotResponsiveTableColumn<T> = {
  key: string;
  header: ReactNode;
  className?: string;
  cellClassName?: string;
  render: (row: T) => ReactNode;
  /** Si se define (y hay `sort` en la tabla), el header se vuelve ordenable. */
  sortKey?: string;
};

export type CopilotResponsiveTableSort = {
  state: SortState;
  onSort: (key: string) => void;
};

export type CopilotResponsiveTableProps<T> = {
  rows: T[];
  columns: CopilotResponsiveTableColumn<T>[];
  getRowKey: (row: T) => string;
  /** Ancho mínimo del table en sm+. Por defecto "720px". */
  minWidth?: string;
  /** Nodo a mostrar cuando rows.length === 0. */
  emptyState?: ReactNode;
  /** Click handler de fila (desktop) y de card (mobile, si hay mobileCard). */
  onRowClick?: (row: T) => void;
  /**
   * Si se provee, en mobile (<sm = 640px) se renderiza una lista de cards
   * en lugar de la tabla con scroll horizontal.
   */
  mobileCard?: (row: T) => ReactNode;
  /** className extra aplicada al <tr> y al <li> de mobile. */
  rowClassName?: (row: T) => string;
  /** Etiqueta de accesibilidad para la tabla y la lista mobile. */
  ariaLabel?: string;
  /** Si true, el <thead> queda sticky en el contenedor scrolleable. */
  stickyHeader?: boolean;
  /** Ordenamiento opcional (controlado). Sólo afecta columnas con `sortKey`. */
  sort?: CopilotResponsiveTableSort;
};

function ariaSortValue(
  columnSortKey: string | undefined,
  sort: CopilotResponsiveTableSort | undefined
): "ascending" | "descending" | "none" | undefined {
  if (!columnSortKey || !sort) return undefined;
  if (sort.state.key !== columnSortKey) return "none";
  return sort.state.direction === "asc" ? "ascending" : "descending";
}

function SortIndicator({ direction }: { direction: SortDirection | null }) {
  if (direction === "asc") return <ChevronUp className="h-3.5 w-3.5" aria-hidden />;
  if (direction === "desc") return <ChevronDown className="h-3.5 w-3.5" aria-hidden />;
  return <ArrowDownUp className="h-3.5 w-3.5 opacity-50" aria-hidden />;
}

const TABLE_WRAPPER_CLASS =
  "overflow-hidden rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]";

const TABLE_SCROLL_CLASS = "overflow-x-auto";

const TH_BASE_CLASS =
  "border-b border-[var(--copilot-border)] bg-[var(--copilot-table-header-bg)] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]";

const TH_STICKY_CLASS = "sticky top-0 z-10 backdrop-blur";

const TD_BASE_CLASS =
  "border-b border-[var(--copilot-border)] px-3 py-2 align-middle text-sm text-[var(--copilot-ink)]";

const ROW_BASE_CLASS =
  "transition-colors duration-150 hover:bg-[var(--copilot-table-row-hover-bg)]";

const SCROLL_HINT_CLASS =
  "border-b border-dashed border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--copilot-ink-muted)] sm:hidden";

const MOBILE_CARD_BASE =
  "rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-3 shadow-sm";

const MOBILE_CARD_INTERACTIVE =
  "cursor-pointer transition hover:border-[var(--copilot-accent)]/40 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)]";

/**
 * Tabla responsive desacoplada del módulo Datos.
 *
 * - Desktop / tablet (≥640px): tabla con scroll horizontal si la suma de
 *   columnas excede `minWidth`.
 * - Mobile (<640px) con `mobileCard`: lista de cards en lugar de tabla.
 * - Mobile (<640px) sin `mobileCard`: scroll horizontal con hint visible.
 *
 * No incluye sorting ni paginado — esa responsabilidad queda en el consumer.
 * Sólo presenta filas ya ordenadas/paginadas.
 */
export function CopilotResponsiveTable<T>({
  rows,
  columns,
  getRowKey,
  minWidth = "720px",
  emptyState,
  onRowClick,
  mobileCard,
  rowClassName,
  ariaLabel,
  stickyHeader = false,
  sort,
}: CopilotResponsiveTableProps<T>) {
  const isEmpty = rows.length === 0;
  const interactive = Boolean(onRowClick);
  const thClass = stickyHeader ? `${TH_BASE_CLASS} ${TH_STICKY_CLASS}` : TH_BASE_CLASS;

  const table = (
    <table
      className="w-full border-collapse text-left"
      style={{ minWidth }}
      aria-label={ariaLabel}
    >
      <thead>
        <tr>
          {columns.map((col) => {
            const sortable = Boolean(col.sortKey && sort);
            const active = sortable && sort!.state.key === col.sortKey;
            return (
              <th
                key={col.key}
                className={`${thClass} ${col.className ?? ""}`.trim()}
                aria-sort={ariaSortValue(col.sortKey, sort)}
              >
                {sortable ? (
                  <button
                    type="button"
                    onClick={() => sort!.onSort(col.sortKey!)}
                    className="inline-flex items-center gap-1.5 hover:text-[var(--copilot-ink)]"
                  >
                    {col.header}
                    <SortIndicator direction={active ? sort!.state.direction : null} />
                  </button>
                ) : (
                  col.header
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {isEmpty ? (
          <tr>
            <td
              colSpan={Math.max(1, columns.length)}
              className="px-3 py-8 text-center text-sm text-[var(--copilot-ink-muted)]"
            >
              {emptyState ?? "Sin datos para mostrar."}
            </td>
          </tr>
        ) : (
          rows.map((row) => {
            const key = getRowKey(row);
            const extra = rowClassName?.(row) ?? "";
            return (
              <tr
                key={key}
                className={`${ROW_BASE_CLASS} ${interactive ? "cursor-pointer" : ""} ${extra}`.trim()}
                onClick={interactive ? () => onRowClick?.(row) : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`${TD_BASE_CLASS} ${col.cellClassName ?? ""}`.trim()}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );

  if (mobileCard) {
    return (
      <>
        {/* Mobile: cards */}
        <ul
          className="space-y-2 sm:hidden"
          aria-label={ariaLabel}
        >
          {isEmpty ? (
            <li className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-4 py-6 text-center text-sm text-[var(--copilot-ink-muted)]">
              {emptyState ?? "Sin datos para mostrar."}
            </li>
          ) : (
            rows.map((row) => {
              const key = getRowKey(row);
              const extra = rowClassName?.(row) ?? "";
              const className = `${MOBILE_CARD_BASE} ${interactive ? MOBILE_CARD_INTERACTIVE : ""} ${extra}`.trim();
              return (
                <li
                  key={key}
                  role={interactive ? "button" : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  onClick={interactive ? () => onRowClick?.(row) : undefined}
                  onKeyDown={
                    interactive
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick?.(row);
                          }
                        }
                      : undefined
                  }
                  className={className}
                >
                  {mobileCard(row)}
                </li>
              );
            })
          )}
        </ul>

        {/* Tablet/desktop: tabla normal */}
        <div className={`hidden sm:block ${TABLE_WRAPPER_CLASS}`}>
          <div className={TABLE_SCROLL_CLASS}>{table}</div>
        </div>
      </>
    );
  }

  // Sin mobileCard: scroll horizontal con hint en mobile.
  return (
    <div className={TABLE_WRAPPER_CLASS}>
      <p className={SCROLL_HINT_CLASS} aria-hidden>
        Deslizá para ver más →
      </p>
      <div className={TABLE_SCROLL_CLASS}>{table}</div>
    </div>
  );
}
