"use client";

import type { ReactNode } from "react";

export type ReportTableColumn<T> = {
  header: string;
  headerClassName?: string;
  cellClassName?: string;
  render: (row: T, index: number) => ReactNode;
};

type Props<T> = {
  columns: ReportTableColumn<T>[];
  rows: T[];
  keyExtractor: (row: T, index: number) => string;
  emptyMessage?: string;
};

export function ReportTable<T>({
  columns,
  rows,
  keyExtractor,
  emptyMessage = "No hay movimientos para el período seleccionado.",
}: Props<T>) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/60 py-10 text-sm text-[var(--copilot-ink-muted)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--copilot-border)]">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b border-[var(--copilot-border)] bg-slate-50/80">
            {columns.map((col, i) => (
              <th
                key={i}
                className={`whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)] ${col.headerClassName ?? ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={keyExtractor(row, i)}
              className="border-b border-[var(--copilot-border)]/60 last:border-0 hover:bg-[var(--copilot-soft-bg)]/60"
            >
              {columns.map((col, j) => (
                <td
                  key={j}
                  className={`px-3 py-2 text-[var(--copilot-ink)] ${col.cellClassName ?? ""}`}
                >
                  {col.render(row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
