"use client";

import { useMemo, useState } from "react";
import { ArrowDownUp, ChevronDown, ChevronUp } from "lucide-react";

import { CopilotInteractiveText } from "@/components/copilot/copilot-interactive-text";
import {
  formatCopilotDataCell,
  sharedObligationPaymentStatusPillClass,
} from "@/lib/copilot-format";
import type { DataEntity, DataRow } from "@/lib/copilot-data";

function statusPillEntities(entity: DataEntity): boolean {
  return entity === "payments" || entity === "receipts" || entity === "tax_obligations";
}

export type DataColumn = {
  key: string;
  label: string;
};

type SortDirection = "asc" | "desc";

export function CopilotDataTable({
  data,
  columns,
  entity,
  selectedRowId,
  onRowClick,
  interactiveColumnKeys = [],
  inactiveBadge = false,
}: {
  data: DataRow[];
  columns: DataColumn[];
  entity: DataEntity;
  selectedRowId?: string | null;
  onRowClick: (row: DataRow) => void;
  /** Columnas cuyo valor se muestra como texto interactivo (abre detalle; no propaga al `tr`). */
  interactiveColumnKeys?: string[];
  /** Muestra badge “Inactivo” cuando `is_active === false` (vista con archivados). */
  inactiveBadge?: boolean;
}) {
  const [sortKey, setSortKey] = useState<string>(columns[0]?.key ?? "");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    const list = [...data];
    list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const left = av == null ? "" : String(av).toLowerCase().trim();
      const right = bv == null ? "" : String(bv).toLowerCase().trim();
      if (left < right) return sortDirection === "asc" ? -1 : 1;
      if (left > right) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [data, sortDirection, sortKey]);

  const handleSort = (key: string) => {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--copilot-border)] bg-white/80">
      <div className="max-h-[60vh] overflow-auto">
        <table className="min-w-full border-collapse">
          <thead className="sticky top-0 z-10 bg-[var(--copilot-card)]">
            <tr>
              {inactiveBadge ? (
                <th className="w-24 border-b border-[var(--copilot-border)] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  Activo
                </th>
              ) : null}
              {columns.map((col) => {
                const active = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    className="border-b border-[var(--copilot-border)] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]"
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(col.key)}
                      className="inline-flex items-center gap-1.5 hover:text-[var(--copilot-ink)]"
                    >
                      {col.label}
                      {active ? (
                        sortDirection === "asc" ? (
                          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                        )
                      ) : (
                        <ArrowDownUp className="h-3.5 w-3.5 opacity-60" aria-hidden />
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-10 text-center text-sm text-[var(--copilot-ink-muted)]"
                  colSpan={(inactiveBadge ? 1 : 0) + (columns.length || 1)}
                >
                  No hay registros para esta vista.
                </td>
              </tr>
            ) : null}
            {sortedData.map((row, i) => {
              const rowId = String(row.id ?? i);
              const selected = selectedRowId != null && rowId === selectedRowId;
              const isInactive = row.is_active === false;
              return (
                <tr
                  key={rowId}
                  onClick={() => onRowClick(row)}
                  className={`cursor-pointer border-b border-[var(--copilot-border)] transition last:border-b-0 hover:bg-[var(--copilot-accent-soft)]/60 ${
                    selected ? "bg-[var(--copilot-accent-soft)] ring-1 ring-inset ring-[rgba(31,107,74,0.22)]" : ""
                  }`}
                >
                  {inactiveBadge ? (
                    <td className="px-3 py-3 align-middle">
                      {isInactive ? (
                        <span className="inline-flex rounded-full bg-[rgba(44,40,37,0.12)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                          Inactivo
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--copilot-ink-muted)]">—</span>
                      )}
                    </td>
                  ) : null}
                  {columns.map((col) => {
                    const value = row[col.key];
                    const raw = formatCopilotDataCell(entity, col.key, value);
                    const interactive = interactiveColumnKeys.includes(col.key);
                    const statusPill =
                      col.key === "status" &&
                      statusPillEntities(entity) &&
                      typeof value === "string" &&
                      value.trim() !== "";
                    const cellInner = statusPill ? (
                      <span
                        className={sharedObligationPaymentStatusPillClass(value)}
                        title={raw}
                      >
                        {raw}
                      </span>
                    ) : interactive ? (
                      <CopilotInteractiveText
                        layout="block"
                        icon="panel"
                        className="text-sm font-medium"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRowClick(row);
                        }}
                      >
                        {raw}
                      </CopilotInteractiveText>
                    ) : (
                      raw
                    );
                    return (
                      <td
                        key={`${rowId}-${col.key}`}
                        className="max-w-[280px] truncate px-4 py-3 text-sm text-[var(--copilot-ink)]"
                        title={raw}
                      >
                        {cellInner}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
