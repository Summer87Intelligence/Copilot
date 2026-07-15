"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * TablePagination (DS-Core) — controles de paginación consistentes.
 *
 * Presentacional: recibe estado ya calculado (`paginate()` del modelo puro) y
 * emite cambios de página. No decide el recorte.
 */

const BTN_CLASS =
  "inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--copilot-border)] px-2.5 text-xs font-semibold text-[var(--copilot-ink)] transition enabled:hover:bg-[var(--copilot-hover-bg)] disabled:cursor-not-allowed disabled:opacity-40";

export function TablePagination({
  page,
  totalPages,
  from,
  to,
  total,
  itemLabel = "resultados",
  onPageChange,
  className = "",
}: {
  page: number;
  totalPages: number;
  from: number;
  to: number;
  total: number;
  itemLabel?: string;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  if (total === 0) return null;
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <nav
      className={`flex flex-wrap items-center justify-between gap-2 ${className}`}
      aria-label="Paginación"
    >
      <p className="text-xs text-[var(--copilot-ink-muted)]" aria-live="polite">
        Mostrando <span className="font-semibold text-[var(--copilot-ink)] tabular-nums">{from}</span>–
        <span className="font-semibold text-[var(--copilot-ink)] tabular-nums">{to}</span> de{" "}
        <span className="font-semibold text-[var(--copilot-ink)] tabular-nums">{total}</span> {itemLabel}
      </p>
      {totalPages > 1 ? (
        <div className="flex items-center gap-1.5">
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
            {page} / {totalPages}
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
      ) : null}
    </nav>
  );
}
