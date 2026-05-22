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

function riskChips(row: DebtorCollectionRow): { label: string; className: string }[] {
  const chips: { label: string; className: string }[] = [];
  if ((row.vencido?.amount ?? 0) > 0) {
    chips.push({ label: "Vencido", className: "bg-rose-100/90 text-rose-900" });
  }
  if (row.flags.critical30Share) {
    chips.push({ label: ">30d", className: "bg-rose-50 text-rose-800 ring-1 ring-rose-200/60" });
  }
  if (row.riesgo === "Alto") {
    chips.push({ label: "Alto", className: "bg-amber-100/90 text-amber-950" });
  }
  return chips;
}

function rowSeverityClass(row: DebtorCollectionRow, highlightRisk: boolean): string {
  if (!highlightRisk) return "";
  if ((row.vencido?.amount ?? 0) > 0) return "bg-rose-50/50";
  if (row.flags.critical30Share || row.riesgo === "Alto") return "bg-amber-50/40";
  return "";
}

function DebtorTable({
  rows,
  onRowClick,
  highlightRisk = false,
}: {
  rows: DebtorCollectionRow[];
  onRowClick: (row: DebtorCollectionRow) => void;
  highlightRisk?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-[var(--copilot-border)]">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="bg-[rgba(44,40,37,0.04)] text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            <th className="px-3 py-1">Cliente</th>
            <th className="px-3 py-1">Moneda</th>
            <th className="px-3 py-1">Por cobrar</th>
            <th className="px-3 py-1">Vencido</th>
            <th className="px-3 py-1">Antigüedad</th>
            <th className="px-3 py-1">Acción</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--copilot-border)]/80">
          {rows.map((row) => {
            const chips = highlightRisk ? riskChips(row) : [];
            return (
            <tr
              key={row.row_id}
              className={`cursor-pointer transition-colors duration-150 hover:bg-[rgba(44,40,37,0.05)] ${rowSeverityClass(row, highlightRisk)}`}
              onClick={() => onRowClick(row)}
            >
              <td className="px-3 py-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-[var(--copilot-ink)]">{row.name}</span>
                  {chips.map((c) => (
                    <span
                      key={c.label}
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${c.className}`}
                    >
                      {c.label}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-3 py-1.5 text-xs font-semibold text-[var(--copilot-ink-muted)]">
                {row.currency}
              </td>
              <td className="px-3 py-1.5">
                <MoneyValue amount={row.deuda} tone="warning" />
              </td>
              <td className="px-3 py-1.5">
                {row.vencido ? (
                  <MoneyValue amount={row.vencido} tone="danger" />
                ) : (
                  <span className="text-sm font-medium text-emerald-700">Al día</span>
                )}
              </td>
              <td className="px-3 py-1.5 text-xs text-[var(--copilot-ink-muted)]">{row.antiguedad}</td>
              <td className="max-w-[200px] px-3 py-1.5 text-xs leading-snug text-[var(--copilot-ink-muted)]">
                {row.accion}
              </td>
            </tr>
          );
          })}
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
  highlightRisk = false,
}: {
  allRows: DebtorCollectionRow[];
  counts: HoyClientCounts;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onRowClick: (row: DebtorCollectionRow) => void;
  sectionRef?: RefObject<HTMLElement | null>;
  highlightRisk?: boolean;
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
      <div className="mt-2">
        <DebtorTable rows={visibleRows} onRowClick={onRowClick} highlightRisk={highlightRisk} />
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
