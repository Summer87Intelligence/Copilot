"use client";

import { Fragment, useMemo, useState } from "react";
import type { RefObject } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, Mail, MessageCircle } from "lucide-react";

import { fmtCurrencyAmount } from "@/lib/copilot-today-business-pulse";
import type { DebtorCollectionRow, MoneyAmount } from "@/lib/copilot-today-business-pulse";
import type { HoyClientCounts } from "@/lib/copilot-today-business-pulse";
import { HOY_COPY, HOY_UI } from "@/lib/copilot-hoy-ui-contract";

import { moneyToneClass } from "./hoy-money-value";

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

/** Importe sin repetir código de moneda (la columna Moneda ya lo indica). */
export function formatMoneySymbolOnly(amount: MoneyAmount): string {
  const n = amount.amount.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  return amount.currency === "USD" ? `U$S ${n}` : `$ ${n}`;
}

function debtorContactFields(row: DebtorCollectionRow): {
  phone: string | null;
  email: string | null;
} {
  return {
    phone: row.phone ?? row.contact_phone ?? null,
    email: row.email ?? row.contact_email ?? null,
  };
}

/** Solo para enlace wa.me; el teléfono en pantalla se muestra tal cual viene de la fuente. */
function normalizeWhatsAppDigits(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function DebtorAmount({
  amount,
  tone,
  empty = "—",
}: {
  amount: MoneyAmount | null;
  tone: "warning" | "danger";
  empty?: string;
}) {
  if (!amount) {
    return <span className="text-sm text-[var(--copilot-ink-muted)]">{empty}</span>;
  }
  return (
    <span className={`text-sm ${moneyToneClass(tone)}`}>{formatMoneySymbolOnly(amount)}</span>
  );
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

function DebtorRowActions({ row }: { row: DebtorCollectionRow }) {
  const { phone, email } = debtorContactFields(row);
  const waDigits = phone ? normalizeWhatsAppDigits(phone) : null;
  const hasOverdue = (row.vencido?.amount ?? 0) > 0;

  return (
    <div className="flex flex-col items-start gap-1" onClick={(e) => e.stopPropagation()}>
      {hasOverdue ? (
        <span className="text-xs font-medium leading-snug text-[var(--copilot-ink-muted)]">
          {row.accion}
        </span>
      ) : null}
      <div className="flex items-center gap-1.5">
        {waDigits ? (
          <a
            href={`https://wa.me/${waDigits}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-emerald-200/80 bg-emerald-50/80 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50"
          >
            <MessageCircle className="h-3 w-3" aria-hidden />
            {HOY_COPY.debtorWhatsApp}
          </a>
        ) : null}
        {email ? (
          <a
            href={`mailto:${encodeURIComponent(email)}`}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--copilot-border)] bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-[var(--copilot-accent)] hover:bg-white"
          >
            <Mail className="h-3 w-3" aria-hidden />
            {HOY_COPY.debtorSendEmail}
          </a>
        ) : null}
        <Link
          href={row.deepLink}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--copilot-border)] bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-[var(--copilot-ink)] hover:bg-white"
        >
          <ExternalLink className="h-3 w-3" aria-hidden />
          {HOY_COPY.debtorViewProfile}
        </Link>
      </div>
    </div>
  );
}

function DebtorRowExpandPanel({ row }: { row: DebtorCollectionRow }) {
  const { phone, email } = debtorContactFields(row);
  const waDigits = phone ? normalizeWhatsAppDigits(phone) : null;
  const hasOverdue = (row.vencido?.amount ?? 0) > 0;

  return (
    <div className="border-t border-[var(--copilot-border)]/60 bg-slate-50/70 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--copilot-ink-muted)]">
        {HOY_COPY.debtorContactSectionTitle}
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1 text-xs">
          <p className="text-[var(--copilot-ink-muted)]">Teléfono</p>
          <p className="font-medium text-[var(--copilot-ink)]">
            {phone ?? (
              <span className="font-normal text-[var(--copilot-ink-muted)]">
                {HOY_COPY.debtorNoPhone}
              </span>
            )}
          </p>
        </div>
        <div className="space-y-1 text-xs">
          <p className="text-[var(--copilot-ink-muted)]">Email</p>
          <p className="font-medium text-[var(--copilot-ink)]">
            {email ? (
              <a
                href={`mailto:${encodeURIComponent(email)}`}
                className="text-[var(--copilot-accent)] hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {email}
              </a>
            ) : (
              <span className="font-normal text-[var(--copilot-ink-muted)]">
                {HOY_COPY.debtorNoEmail}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-1">
          {waDigits ? (
            <a
              href={`https://wa.me/${waDigits}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100/80"
            >
              <MessageCircle className="h-3.5 w-3.5" aria-hidden />
              {HOY_COPY.debtorWhatsApp}
            </a>
          ) : null}
          {email ? (
            <a
              href={`mailto:${encodeURIComponent(email)}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--copilot-border)] bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--copilot-accent)] hover:bg-white"
            >
              <Mail className="h-3.5 w-3.5" aria-hidden />
              {HOY_COPY.debtorSendEmail}
            </a>
          ) : null}
          <Link
            href={row.deepLink}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--copilot-border)] bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--copilot-ink)] hover:bg-white"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            {HOY_COPY.debtorViewProfile}
          </Link>
        </div>
      </div>
      {hasOverdue ? (
        <p className="mt-2.5 text-[11px] text-[var(--copilot-ink-muted)]">
          <span className="font-semibold text-rose-800">{row.accion}</span>
        </p>
      ) : null}
    </div>
  );
}

function DebtorTable({
  rows,
  highlightRisk = false,
}: {
  rows: DebtorCollectionRow[];
  highlightRisk?: boolean;
}) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  function toggleRow(rowId: string) {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }

  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-[var(--copilot-border)]">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="bg-[rgba(44,40,37,0.04)] text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            <th className="px-3 py-1.5">Cliente</th>
            <th className="px-3 py-1.5">Moneda</th>
            <th className="px-3 py-1.5">Deuda total</th>
            <th className="px-3 py-1.5">Deuda vencida</th>
            <th className="px-3 py-1.5">Días de atraso</th>
            <th className="px-3 py-1.5">Acción</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--copilot-border)]/80">
          {rows.map((row) => {
            const chips = highlightRisk ? riskChips(row) : [];
            const isExpanded = expandedRows.has(row.row_id);
            return (
              <Fragment key={row.row_id}>
                <tr
                  className={`cursor-pointer transition-colors duration-150 hover:bg-slate-50 ${rowSeverityClass(row, highlightRisk)} ${isExpanded ? "bg-slate-50/90" : ""}`}
                  onClick={() => toggleRow(row.row_id)}
                  aria-expanded={isExpanded}
                >
                  <td className="px-3 py-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ChevronDown
                        className={`h-3.5 w-3.5 shrink-0 text-[var(--copilot-ink-muted)] transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        aria-hidden
                      />
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
                  <td className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {row.currency}
                  </td>
                  <td className="px-3 py-1.5">
                    <DebtorAmount amount={row.deuda} tone="warning" />
                  </td>
                  <td className="px-3 py-1.5">
                    {row.vencido ? (
                      <DebtorAmount amount={row.vencido} tone="danger" />
                    ) : (
                      <span className="text-sm font-medium text-[var(--copilot-ink-muted)]">Sin deuda vencida</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-[var(--copilot-ink-muted)]">
                    {row.antiguedad}
                  </td>
                  <td className="px-3 py-1.5">
                    <DebtorRowActions row={row} />
                  </td>
                </tr>
                {isExpanded ? (
                  <tr key={`${row.row_id}-detail`} className="bg-slate-50/50">
                    <td colSpan={6} className="p-0">
                      <DebtorRowExpandPanel row={row} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Deduplica por (company_id, currency) conservando la fila de mayor riesgo. */
function dedupeDebtorRows(rows: DebtorCollectionRow[]): DebtorCollectionRow[] {
  const map = new Map<string, DebtorCollectionRow>();
  for (const row of rows) {
    const key = `${row.company_id}|${row.currency}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
    } else {
      const scoreA = (existing.vencido?.amount ?? 0) * 1000 + existing.deuda.amount;
      const scoreB = (row.vencido?.amount ?? 0) * 1000 + row.deuda.amount;
      if (scoreB > scoreA) map.set(key, row);
    }
  }
  return [...map.values()].sort((a, b) => {
    const vA = a.vencido?.amount ?? 0;
    const vB = b.vencido?.amount ?? 0;
    if (vB !== vA) return vB - vA;
    if (b.deuda.amount !== a.deuda.amount) return b.deuda.amount - a.deuda.amount;
    return a.name.localeCompare(b.name, "es");
  });
}

export function ClientsWithDebtSection({
  allRows,
  counts,
  expanded,
  onExpandedChange,
  sectionRef,
  highlightRisk = false,
}: {
  allRows: DebtorCollectionRow[];
  counts: HoyClientCounts;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  sectionRef?: RefObject<HTMLElement | null>;
  highlightRisk?: boolean;
}) {
  const initialCount = HOY_UI.initialDebtorTableRows;
  const dedupedRows = useMemo(() => dedupeDebtorRows(allRows), [allRows]);
  const visibleRows = useMemo(
    () => (expanded ? dedupedRows : dedupedRows.slice(0, initialCount)),
    [dedupedRows, expanded, initialCount]
  );

  const summary = buildDebtorsSummaryLine(counts, allRows);
  const canExpand = dedupedRows.length > initialCount;

  const expandLabel =
    dedupedRows.length === 1
      ? "Mostrar el deudor activo"
      : `Mostrar todos los deudores (${dedupedRows.length})`;

  return (
    <section ref={sectionRef} id="clientes-criticos" className="scroll-mt-4">
      <p className="text-xs text-[var(--copilot-ink-muted)]">{summary}</p>
      <div className="mt-2">
        <DebtorTable rows={visibleRows} highlightRisk={highlightRisk} />
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
