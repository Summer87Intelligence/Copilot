"use client";

import { useMemo } from "react";
import type { RefObject } from "react";

import { fmtCurrencyAmount } from "@/lib/copilot-today-business-pulse";
import type { DebtorCollectionRow } from "@/lib/copilot-today-business-pulse";
import type { HoyClientCounts } from "@/lib/copilot-today-business-pulse";
import { HOY_UI } from "@/lib/copilot-hoy-ui-contract";

import { MoneyValue } from "./hoy-money-value";

export function buildDebtorsSummaryLine(
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
    `${counts.debtorClients} ${counts.debtorClients === 1 ? "cliente" : "clientes"} con deuda activa`,
  ];
  if (pendingUyu > 0) parts.push(`${fmtCurrencyAmount(pendingUyu, "UYU")} por cobrar`);
  if (pendingUsd > 0) parts.push(`${fmtCurrencyAmount(pendingUsd, "USD")} por cobrar`);
  return parts.join(" · ");
}

function DebtorTable({
  rows,
  onRowClick,
}: {
  rows: DebtorCollectionRow[];
  onRowClick: (row: DebtorCollectionRow) => void;
}) {
  return (
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
  );
}

export function ClientsWithDebtSection({
  allRows,
  counts,
  expanded,
  onExpandedChange,
  onRowClick,
  sectionRef,
}: {
  allRows: DebtorCollectionRow[];
  counts: HoyClientCounts;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onRowClick: (row: DebtorCollectionRow) => void;
  sectionRef?: RefObject<HTMLElement | null>;
}) {
  const initialCount = HOY_UI.initialDebtorTableRows;
  const visibleRows = useMemo(
    () => (expanded ? allRows : allRows.slice(0, initialCount)),
    [allRows, expanded]
  );

  const summary = buildDebtorsSummaryLine(counts, allRows);
  const canExpand = allRows.length > initialCount;

  const expandLabel =
    counts.debtorClients === 1
      ? "Mostrar el deudor activo"
      : `Mostrar todos los deudores (${counts.debtorClients})`;

  return (
    <section ref={sectionRef} className="scroll-mt-4">
      <p className="text-xs text-[var(--copilot-ink-muted)]">{summary}</p>
      <div className="mt-4">
        <DebtorTable rows={visibleRows} onRowClick={onRowClick} />
      </div>
      {canExpand ? (
        <button
          type="button"
          onClick={() => onExpandedChange(!expanded)}
          className="mt-3 w-full rounded-lg border border-[var(--copilot-border)] bg-white py-2 text-xs font-semibold text-[var(--copilot-accent)] hover:bg-[rgba(44,40,37,0.02)]"
        >
          {expanded ? "Mostrar menos" : expandLabel}
        </button>
      ) : null}
    </section>
  );
}
