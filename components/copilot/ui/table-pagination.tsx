"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { buildNumericPageTokens } from "@/lib/ui/numeric-pagination";

/**
 * TablePagination (DS-Core) — controles de paginación consistentes.
 *
 * FASE BANK-2026-CLEANUP: números de página + ellipsis + pageSize opcional.
 */

const BTN_CLASS =
  "inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-lg border border-[var(--copilot-border)] px-2.5 text-xs font-semibold text-[var(--copilot-ink)] transition enabled:hover:bg-[var(--copilot-hover-bg)] disabled:cursor-not-allowed disabled:opacity-40";

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export function TablePagination({
  page,
  totalPages,
  from,
  to,
  total,
  itemLabel = "resultados",
  onPageChange,
  pageSize,
  onPageSizeChange,
  className = "",
}: {
  page: number;
  totalPages: number;
  from: number;
  to: number;
  total: number;
  itemLabel?: string;
  onPageChange: (page: number) => void;
  pageSize?: number;
  onPageSizeChange?: (pageSize: number) => void;
  className?: string;
}) {
  if (total === 0) return null;
  const canPrev = page > 1;
  const canNext = page < totalPages;
  const tokens = buildNumericPageTokens(page, totalPages);

  return (
    <nav
      className={`flex flex-wrap items-center justify-between gap-2 ${className}`}
      aria-label="Paginación"
    >
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-[var(--copilot-ink-muted)]" aria-live="polite">
          Mostrando <span className="font-semibold text-[var(--copilot-ink)] tabular-nums">{from}</span>–
          <span className="font-semibold text-[var(--copilot-ink)] tabular-nums">{to}</span> de{" "}
          <span className="font-semibold text-[var(--copilot-ink)] tabular-nums">{total}</span> {itemLabel}
        </p>
        {onPageSizeChange && pageSize != null ? (
          <label className="flex items-center gap-1.5 text-xs text-[var(--copilot-ink-muted)]">
            <span className="sr-only sm:not-sr-only">Por página</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-8 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)] px-2 text-xs font-semibold text-[var(--copilot-ink)]"
              aria-label="Filas por página"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {totalPages > 1 ? (
        <>
          {/* Mobile: Anterior · Página X de Y · Siguiente */}
          <div className="flex items-center gap-1.5 sm:hidden">
            <button
              type="button"
              className={BTN_CLASS}
              disabled={!canPrev}
              onClick={() => canPrev && onPageChange(page - 1)}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              Anterior
            </button>
            <span className="px-1 text-xs text-[var(--copilot-ink-muted)] tabular-nums">
              Página {page} de {totalPages}
            </span>
            <button
              type="button"
              className={BTN_CLASS}
              disabled={!canNext}
              onClick={() => canNext && onPageChange(page + 1)}
              aria-label="Página siguiente"
            >
              Siguiente
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>

          {/* Desktop: numérica */}
          <div className="hidden items-center gap-1 sm:flex" data-testid="table-pagination-numeric">
            <button
              type="button"
              className={BTN_CLASS}
              disabled={!canPrev}
              onClick={() => canPrev && onPageChange(page - 1)}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              Anterior
            </button>
            {tokens.map((token, idx) =>
              token === "ellipsis" ? (
                <span
                  key={`e-${idx}`}
                  className="px-1 text-xs text-[var(--copilot-ink-muted)]"
                  aria-hidden
                >
                  …
                </span>
              ) : (
                <button
                  key={token}
                  type="button"
                  className={`${BTN_CLASS} ${
                    token === page
                      ? "border-[var(--copilot-accent)] bg-[var(--copilot-accent)] text-white"
                      : ""
                  }`}
                  aria-current={token === page ? "page" : undefined}
                  aria-label={`Ir a página ${token}`}
                  onClick={() => onPageChange(token)}
                >
                  {token}
                </button>
              )
            )}
            <button
              type="button"
              className={BTN_CLASS}
              disabled={!canNext}
              onClick={() => canNext && onPageChange(page + 1)}
              aria-label="Página siguiente"
            >
              Siguiente
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </>
      ) : null}
    </nav>
  );
}
