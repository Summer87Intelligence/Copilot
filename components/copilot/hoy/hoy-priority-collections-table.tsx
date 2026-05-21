"use client";

import { fmtCurrencyAmount } from "@/lib/copilot-today-business-pulse";
import type { DebtorCollectionRow } from "@/lib/copilot-today-business-pulse";
import type { HoyClientCounts } from "@/lib/copilot-today-business-pulse";

import { MoneyValue } from "./hoy-money-value";

export function buildCollectionsSummaryLine(
  visibleCount: number,
  counts: HoyClientCounts,
  allRows: DebtorCollectionRow[]
): string {
  let pendingUyu = 0;
  let pendingUsd = 0;
  for (const r of allRows) {
    if (r.currency === "UYU") pendingUyu += r.deuda.amount;
    else pendingUsd += r.deuda.amount;
  }
  const parts: string[] = [
    `Mostrando ${visibleCount} de ${counts.debtorClients} deudores`,
  ];
  if (pendingUyu > 0) parts.push(`${fmtCurrencyAmount(pendingUyu, "UYU")} por cobrar`);
  if (pendingUsd > 0) parts.push(`${fmtCurrencyAmount(pendingUsd, "USD")} por cobrar`);
  return parts.join(" · ");
}

export function DebtorsReviewTable({
  rows,
  allRows,
  counts,
  onViewAll,
  onRowClick,
}: {
  rows: DebtorCollectionRow[];
  allRows: DebtorCollectionRow[];
  counts: HoyClientCounts;
  onViewAll: () => void;
  onRowClick: (row: DebtorCollectionRow) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--copilot-ink-muted)]">
        No hay clientes con saldo pendiente — todo al día.
      </p>
    );
  }

  const summary = buildCollectionsSummaryLine(rows.length, counts, allRows);
  const debtorLabel =
    counts.debtorClients === 1
      ? "Ver el deudor activo"
      : `Ver todos los deudores (${counts.debtorClients})`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--copilot-ink-muted)]">{summary}</p>
        <button
          type="button"
          onClick={onViewAll}
          className="shrink-0 rounded-lg border border-[var(--copilot-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--copilot-accent)] shadow-sm hover:bg-[rgba(44,40,37,0.03)]"
          title="Lista completa de clientes con saldo pendiente, por moneda"
        >
          {debtorLabel} →
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-[var(--copilot-border)]">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-[rgba(44,40,37,0.03)] text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              <th className="px-4 py-2.5">Cliente</th>
              <th className="px-4 py-2.5">Moneda</th>
              <th className="px-4 py-2.5">Por cobrar</th>
              <th className="px-4 py-2.5">Vencido</th>
              <th className="px-4 py-2.5">Antigüedad</th>
              <th className="px-4 py-2.5">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--copilot-border)]">
            {rows.map((row) => (
              <tr
                key={row.row_id}
                className="cursor-pointer transition hover:bg-[rgba(44,40,37,0.03)]"
                onClick={() => onRowClick(row)}
              >
                <td className="px-4 py-3 font-medium text-[var(--copilot-ink)]">{row.name}</td>
                <td className="px-4 py-3 text-xs font-semibold text-[var(--copilot-ink-muted)]">
                  {row.currency}
                </td>
                <td className="px-4 py-3">
                  <MoneyValue amount={row.deuda} tone="warning" />
                </td>
                <td className="px-4 py-3">
                  {row.vencido ? (
                    <MoneyValue amount={row.vencido} tone="danger" />
                  ) : (
                    <span className="text-sm font-medium text-emerald-700">Al día</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--copilot-ink-muted)]">{row.antiguedad}</td>
                <td className="max-w-[200px] px-4 py-3 text-xs leading-snug text-[var(--copilot-ink-muted)]">
                  {row.accion}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
