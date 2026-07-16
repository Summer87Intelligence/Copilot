"use client";

import { useCallback, type ReactNode } from "react";
import { X } from "lucide-react";

import { useFocusTrap } from "@/lib/ui/use-focus-trap";

/** Drawer analítico del módulo Ventas (focus trap + Escape + retorno de foco). */
export function VentasAnalyticsDrawer({
  title,
  titleId = "ventas-drawer-title",
  children,
  onClose,
  wide = true,
}: {
  title: string;
  titleId?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const onEscape = useCallback(() => onClose(), [onClose]);
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onEscape);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`flex h-full w-full flex-col overflow-hidden border-l border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)] shadow-xl ${
          wide ? "max-w-3xl sm:max-w-3xl" : "max-w-md"
        }`}
      >
        <div className="flex items-start justify-between gap-2 border-b border-[var(--copilot-border)] px-4 py-3 sm:px-5">
          <h2 id={titleId} className="text-base font-semibold text-[var(--copilot-ink)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-hover-bg)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
      </div>
    </div>
  );
}

export function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">{title}</h3>
      {children}
    </section>
  );
}

export function DrawerStatGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((it) => (
        <div key={it.label} className="rounded-lg border border-[var(--copilot-border)] px-3 py-2">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">{it.label}</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-[var(--copilot-ink)]">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DrawerTable({
  headers,
  rows,
  ariaLabel,
}: {
  headers: { key: string; label: string; align?: "left" | "right" | "center" }[];
  rows: Record<string, ReactNode>[];
  ariaLabel: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--copilot-border)]">
      <table className="w-full min-w-[520px] border-collapse text-left text-sm" aria-label={ariaLabel}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h.key}
                className={`border-b border-[var(--copilot-border)] bg-[var(--copilot-table-header-bg)] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] ${
                  h.align === "right" ? "text-right" : h.align === "center" ? "text-center" : "text-left"
                }`}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-3 py-6 text-center text-sm text-[var(--copilot-ink-muted)]">
                Sin datos.
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => (
              <tr key={idx} className="border-b border-[var(--copilot-border)] last:border-0">
                {headers.map((h) => (
                  <td
                    key={h.key}
                    className={`px-3 py-2 align-middle text-[var(--copilot-ink)] ${
                      h.align === "right" ? "text-right tabular-nums" : h.align === "center" ? "text-center tabular-nums" : "text-left"
                    }`}
                  >
                    {row[h.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
