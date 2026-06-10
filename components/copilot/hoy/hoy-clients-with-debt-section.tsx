"use client";

import { Fragment, useMemo, useState } from "react";
import type { RefObject } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, ExternalLink, FileText, Mail, MessageCircle } from "lucide-react";

import { CopilotButtonLink, copilotButtonClassName } from "@/components/copilot/ui/copilot-button";
import { fmtCurrencyAmount } from "@/lib/copilot-today-business-pulse";
import type { DebtorCollectionRow, MoneyAmount } from "@/lib/copilot-today-business-pulse";
import type { HoyClientCounts } from "@/lib/copilot-today-business-pulse";
import type { ClientCompanyDetail, ClientPortfolioInvoice } from "@/lib/copilot-clients-portfolio";
import type { CarteraCurrencyTotals } from "@/lib/copilot-cartera-aging-totals";
import { HOY_COPY, HOY_UI } from "@/lib/copilot-hoy-ui-contract";
import {
  buildDebtorExpandData,
  fmtDebtSymbol,
} from "@/lib/hoy-debtor-expand-helpers";
import { sortDebtorRowsByAging } from "@/lib/hoy-debtor-sort";
import {
  buildDebtBreakdown,
  fmtDateShort,
  localTodayYmd,
  type InvoiceStatusLabel,
} from "@/lib/hoy-debt-breakdown";

import { moneyToneClass } from "./hoy-money-value";

export { buildDebtorExpandData } from "@/lib/hoy-debtor-expand-helpers";

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
  if (chips.length === 0 && row.deuda.amount > 0) {
    chips.push({ label: "Deuda al día", className: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/60" });
  }
  return chips;
}

function rowSeverityClass(row: DebtorCollectionRow, highlightRisk: boolean): string {
  if (!highlightRisk) return "";
  if ((row.vencido?.amount ?? 0) > 0) return "bg-rose-50/50";
  if (row.flags.critical30Share || row.riesgo === "Alto") return "bg-amber-50/40";
  return "";
}

const ACTION_BTN = `${copilotButtonClassName({ variant: "secondary", size: "sm" })} !h-7 !w-[88px] !px-2 !text-[11px]`;

function DebtorRowActions({ row }: { row: DebtorCollectionRow }) {
  const { phone, email } = debtorContactFields(row);
  const waDigits = phone ? normalizeWhatsAppDigits(phone) : null;

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {waDigits ? (
        <a
          href={`https://wa.me/${waDigits}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`${ACTION_BTN} border-emerald-200/80 bg-emerald-50/80 text-emerald-800 hover:bg-emerald-50`}
        >
          <MessageCircle className="h-3 w-3 shrink-0" aria-hidden />
          {HOY_COPY.debtorWhatsApp}
        </a>
      ) : (
        <span
          title="Sin WhatsApp cargado"
          className={`${ACTION_BTN} cursor-not-allowed border-[var(--copilot-border)]/40 bg-[var(--copilot-hover-bg)] text-[var(--copilot-ink-muted)]/50`}
        >
          <MessageCircle className="h-3 w-3 shrink-0" aria-hidden />
          WhatsApp
        </span>
      )}
      {email ? (
        <a
          href={`mailto:${encodeURIComponent(email)}`}
          className={`${ACTION_BTN} border-[var(--copilot-border)] bg-[var(--copilot-dropdown-bg)] text-[var(--copilot-accent)] hover:bg-[var(--copilot-hover-bg)]`}
        >
          <Mail className="h-3 w-3 shrink-0" aria-hidden />
          {HOY_COPY.debtorSendEmail}
        </a>
      ) : (
        <span
          title="Sin email cargado"
          className={`${ACTION_BTN} cursor-not-allowed border-[var(--copilot-border)]/40 bg-[var(--copilot-hover-bg)] text-[var(--copilot-ink-muted)]/50`}
        >
          <Mail className="h-3 w-3 shrink-0" aria-hidden />
          Email
        </span>
      )}
      <Link
        href={row.deepLink}
        className={`${ACTION_BTN} border-[var(--copilot-border)] bg-[var(--copilot-dropdown-bg)] text-[var(--copilot-ink)] hover:bg-[var(--copilot-hover-bg)]`}
      >
        <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
        {HOY_COPY.debtorViewProfile}
      </Link>
    </div>
  );
}

const STATUS_BADGE_CONFIG: Record<InvoiceStatusLabel, { label: string; className: string }> = {
  Vencida: { label: "Vencida", className: "bg-rose-100/90 text-rose-900" },
  "Al día": { label: "Al día", className: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/60" },
  Parcial: { label: "Parcial", className: "bg-amber-100/90 text-amber-900" },
  "Sin vencimiento": {
    label: "Sin vto.",
    className: "bg-[var(--copilot-surface-muted)] text-[var(--copilot-ink-muted)]",
  },
};

function InvoiceStatusBadge({ status }: { status: InvoiceStatusLabel }) {
  const { label, className } = STATUS_BADGE_CONFIG[status];
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${className}`}>
      {label}
    </span>
  );
}

function DebtBreakdownSection({
  row,
  invoices,
  today,
}: {
  row: DebtorCollectionRow;
  invoices: ClientPortfolioInvoice[];
  today: string;
}) {
  const breakdown = useMemo(
    () =>
      buildDebtBreakdown(
        invoices,
        row.currency,
        today,
        row.deuda.amount,
        row.vencido?.amount ?? null
      ),
    [invoices, row.currency, today, row.deuda.amount, row.vencido]
  );

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--copilot-ink-muted)]">
        Facturas que explican la deuda
      </p>

      {breakdown.items.length === 0 ? (
        <p className="text-xs italic text-[var(--copilot-ink-muted)]">
          No hay facturas activas registradas para {row.currency}.
        </p>
      ) : (
        <>
          {/* Summary chips */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>
              Total pendiente{" "}
              <span className="font-semibold text-amber-700">
                {fmtDebtSymbol(breakdown.summary.totalPending, row.currency)}
              </span>
            </span>
            {breakdown.summary.totalOverdue > 0 && (
              <span>
                Vencido{" "}
                <span className="font-semibold text-rose-700">
                  {fmtDebtSymbol(breakdown.summary.totalOverdue, row.currency)}
                </span>
              </span>
            )}
            {breakdown.summary.totalCurrent > 0 && (
              <span>
                Al día{" "}
                <span className="font-semibold text-[var(--copilot-ink)]">
                  {fmtDebtSymbol(breakdown.summary.totalCurrent, row.currency)}
                </span>
              </span>
            )}
            <span className="text-[var(--copilot-ink-muted)]">
              {breakdown.summary.invoiceCount}{" "}
              {breakdown.summary.invoiceCount === 1 ? "factura" : "facturas"}
              {breakdown.summary.overdueCount > 0
                ? ` · ${breakdown.summary.overdueCount} vencida${breakdown.summary.overdueCount !== 1 ? "s" : ""}`
                : ""}
            </span>
          </div>

          {/* Invoice table — horizontal scroll on mobile */}
          <div className="overflow-x-auto rounded-lg ring-1 ring-[var(--copilot-border)]">
            <table className="w-full min-w-[580px] border-collapse text-left text-xs">
              <thead>
                <tr className="bg-[rgba(44,40,37,0.04)] text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  <th className="px-2.5 py-1.5">Emisión</th>
                  <th className="px-2.5 py-1.5">Vencimiento</th>
                  <th className="px-2.5 py-1.5">Comprobante</th>
                  <th className="px-2.5 py-1.5">Moneda</th>
                  <th className="px-2.5 py-1.5 text-right">Original</th>
                  <th className="px-2.5 py-1.5 text-right">Saldo</th>
                  <th className="px-2.5 py-1.5">Estado</th>
                  <th className="px-2.5 py-1.5 text-right">Días</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--copilot-border)]/60">
                {breakdown.items.map((item) => (
                  <tr key={item.invoiceId} className="bg-[var(--copilot-card)]">
                    <td className="px-2.5 py-1.5 tabular-nums text-[var(--copilot-ink-muted)]">
                      {fmtDateShort(item.issueDate)}
                    </td>
                    <td
                      className={`px-2.5 py-1.5 tabular-nums ${
                        item.status === "Vencida"
                          ? "font-medium text-rose-700"
                          : "text-[var(--copilot-ink-muted)]"
                      }`}
                    >
                      {fmtDateShort(item.dueDate)}
                    </td>
                    <td className="px-2.5 py-1.5 font-mono text-[var(--copilot-ink)]">
                      {item.documentNumber}
                    </td>
                    <td className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      {item.currency}
                    </td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums text-[var(--copilot-ink-muted)]">
                      {fmtDebtSymbol(item.originalAmount, item.currency)}
                    </td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold text-[var(--copilot-ink)]">
                      {fmtDebtSymbol(item.pendingAmount, item.currency)}
                    </td>
                    <td className="px-2.5 py-1.5">
                      <InvoiceStatusBadge status={item.status} />
                    </td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums text-rose-700">
                      {item.daysOverdue != null ? `${item.daysOverdue}d` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Reconciliation warning */}
          {breakdown.hasReconciliationGap && (
            <div className="flex items-start gap-1.5 rounded-lg bg-amber-50/90 px-2.5 py-1.5 text-[11px] text-amber-800">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
              <span>
                Diferencia de conciliación de{" "}
                {fmtDebtSymbol(breakdown.reconciliationGap, row.currency)}.
                Revisar estado de cuenta.
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DebtorRowExpandPanel({
  row,
  invoices,
  today,
}: {
  row: DebtorCollectionRow;
  invoices: ClientPortfolioInvoice[] | undefined;
  today: string;
}) {
  const { phone, email } = debtorContactFields(row);
  const expand = buildDebtorExpandData(row);

  return (
    <div className="space-y-3 border-t border-[var(--copilot-border)]/60 bg-[var(--copilot-card)] px-4 py-3">

      {/* ── Financial summary ─────────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--copilot-ink-muted)]">
          Resumen de deuda
        </p>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">

          {/* Deuda actual */}
          <div>
            <p
              className="text-[10px] text-[var(--copilot-ink-muted)]"
              title={HOY_COPY.debtTotalTip}
            >
              Deuda actual
            </p>
            <p className="mt-0.5 text-sm font-semibold text-amber-700">
              {fmtDebtSymbol(expand.deudaTotalAmt, expand.currency)}
            </p>
            <p className="mt-0.5 text-[10px] leading-tight text-[var(--copilot-ink-muted)]">
              Deuda actual del cliente.
            </p>
          </div>

          {/* Deuda vencida */}
          <div>
            <p
              className="text-[10px] text-[var(--copilot-ink-muted)]"
              title={HOY_COPY.debtOverdueTip}
            >
              Deuda vencida
            </p>
            {expand.deudaVencidaAmt != null ? (
              <>
                <p className="mt-0.5 text-sm font-semibold text-rose-700">
                  {fmtDebtSymbol(expand.deudaVencidaAmt, expand.currency)}
                </p>
                <p className="mt-0.5 text-[10px] leading-tight text-[var(--copilot-ink-muted)]">
                  Parte del saldo cuya fecha ya pasó.
                </p>
              </>
            ) : (
              <>
                <p className="mt-0.5 text-sm font-semibold text-emerald-700">—</p>
                <p className="mt-0.5 text-[10px] leading-tight text-emerald-700">
                  Sin vencimiento activo.
                </p>
              </>
            )}
          </div>

          {/* Deuda al día */}
          <div>
            <p
              className="text-[10px] text-[var(--copilot-ink-muted)]"
              title={HOY_COPY.debtAtDayTip}
            >
              Al día
            </p>
            {expand.deudaAlDia > 0 ? (
              <>
                <p className="mt-0.5 text-sm font-semibold text-[var(--copilot-ink)]">
                  {fmtDebtSymbol(expand.deudaAlDia, expand.currency)}
                </p>
                <p className="mt-0.5 text-[10px] leading-tight text-[var(--copilot-ink-muted)]">
                  Saldo todavía dentro del plazo.
                </p>
              </>
            ) : (
              <>
                <p className="mt-0.5 text-sm font-semibold text-[var(--copilot-ink-muted)]">—</p>
                <p className="mt-0.5 text-[10px] leading-tight text-[var(--copilot-ink-muted)]">
                  Toda la deuda está vencida.
                </p>
              </>
            )}
          </div>

          {/* Días de atraso */}
          <div>
            <p
              className="text-[10px] text-[var(--copilot-ink-muted)]"
              title={HOY_COPY.debtOverdueDaysTip}
            >
              Días de atraso
            </p>
            {expand.overdueDays != null ? (
              <>
                <p className="mt-0.5 text-sm font-semibold text-rose-700">
                  {expand.overdueDays} días
                </p>
                <p className="mt-0.5 text-[10px] leading-tight text-[var(--copilot-ink-muted)]">
                  Desde la factura vencida más antigua.
                </p>
              </>
            ) : (
              <>
                <p className="mt-0.5 text-sm font-semibold text-[var(--copilot-ink-muted)]">—</p>
                <p className="mt-0.5 text-[10px] leading-tight text-[var(--copilot-ink-muted)]">
                  Sin vencimiento registrado.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Invoice breakdown ─────────────────────────────────────────────── */}
      {invoices !== undefined && (
        <DebtBreakdownSection row={row} invoices={invoices} today={today} />
      )}

      {/* ── CTA row ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5" onClick={(e) => e.stopPropagation()}>
        <CopilotButtonLink href={row.deepLink} variant="secondary" size="sm">
          <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Ver estado de cuenta
        </CopilotButtonLink>
        <CopilotButtonLink href={row.deepLink} variant="ghost" size="sm">
          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Ver ficha
        </CopilotButtonLink>
      </div>

      {/* ── Status message ────────────────────────────────────────────────── */}
      <div
        className={`rounded-lg px-3 py-2 text-xs ${
          expand.hasOverdue
            ? "bg-rose-50/80 text-rose-800"
            : "bg-emerald-50/80 text-emerald-800"
        }`}
      >
        <span className="font-semibold">
          {expand.hasOverdue ? "Requiere seguimiento." : "Deuda al día."}
        </span>{" "}
        {expand.expandMessage}
      </div>

      {/* ── Contact (compact — actions are already in the row) ────────────── */}
      {(phone ?? email) ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--copilot-ink-muted)]">
            {HOY_COPY.debtorContactSectionTitle}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-xs">
            {phone ? (
              <span className="text-[var(--copilot-ink)]">{phone}</span>
            ) : null}
            {email ? (
              <a
                href={`mailto:${encodeURIComponent(email)}`}
                className="text-[var(--copilot-accent)] hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {email}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── Data source ───────────────────────────────────────────────────── */}
      <div className="space-y-0.5 text-[10px] text-[var(--copilot-ink-muted)]">
        <p>
          <span className="font-semibold">Fuente:</span> facturas y saldos pendientes
          sincronizados desde Zeta.
        </p>
        <p>
          <span className="font-semibold">Moneda:</span> {row.currency}.
        </p>
      </div>
    </div>
  );
}

function DebtorTable({
  rows,
  highlightRisk = false,
  portfolioDetails,
}: {
  rows: DebtorCollectionRow[];
  highlightRisk?: boolean;
  portfolioDetails?: Record<string, ClientCompanyDetail>;
}) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const today = useMemo(() => localTodayYmd(), []);

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
            <th
              className="cursor-help px-3 py-1.5"
              title={HOY_COPY.debtTotalTip}
            >
              Deuda actual
            </th>
            <th
              className="cursor-help px-3 py-1.5"
              title={HOY_COPY.debtOverdueTip}
            >
              Deuda vencida
            </th>
            <th
              className="cursor-help px-3 py-1.5"
              title={HOY_COPY.debtOverdueDaysTip}
            >
              Días de atraso
            </th>
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
                  className={`cursor-pointer transition-colors duration-150 hover:bg-[var(--copilot-hover-bg)]${rowSeverityClass(row, highlightRisk)} ${isExpanded ? "bg-[var(--copilot-card)]" : ""}`}
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
                    {(row.vencido?.amount ?? 0) > 0 ? (
                      <DebtorAmount amount={row.vencido} tone="danger" />
                    ) : (
                      <span className="text-xs text-[var(--copilot-ink-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-[var(--copilot-ink-muted)]">
                    {row.flags.hasOverdue && (row.overdueDays ?? 0) > 0
                      ? `${row.overdueDays} días`
                      : row.flags.hasOverdue
                        ? row.antiguedad
                        : "—"}
                  </td>
                  <td className="px-3 py-1.5">
                    <DebtorRowActions row={row} />
                  </td>
                </tr>
                {isExpanded ? (
                  <tr key={`${row.row_id}-detail`} className="bg-[var(--copilot-card)]">
                    <td colSpan={6} className="p-0">
                      <DebtorRowExpandPanel
                        row={row}
                        invoices={portfolioDetails?.[row.company_id]?.invoices}
                        today={today}
                      />
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
  return sortDebtorRowsByAging([...map.values()]);
}

export function ClientsWithDebtSection({
  allRows,
  sectionRef,
  highlightRisk = false,
  portfolioDetails,
  canonicalTotals,
}: {
  allRows: DebtorCollectionRow[];
  sectionRef?: RefObject<HTMLElement | null>;
  highlightRisk?: boolean;
  portfolioDetails?: Record<string, ClientCompanyDetail>;
  /** Rollup canónico (pendingAtCutoff / aging) — no sumar solo filas visibles. */
  canonicalTotals?: { active: CarteraCurrencyTotals; overdue: CarteraCurrencyTotals };
}) {
  const pageSizeOptions = HOY_UI.debtorPageSizeOptions;
  const defaultPageSize = HOY_UI.defaultDebtorPageSize;
  const sortedRows = useMemo(() => dedupeDebtorRows(allRows), [allRows]);

  const [pageSize, setPageSize] = useState<number>(defaultPageSize);
  const [pageIndex, setPageIndex] = useState(0);

  const paginationResetKey = `${sortedRows.length}|${pageSize}`;
  const [appliedPaginationResetKey, setAppliedPaginationResetKey] = useState(paginationResetKey);

  if (appliedPaginationResetKey !== paginationResetKey) {
    setAppliedPaginationResetKey(paginationResetKey);
    setPageIndex(0);
  }

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePageIndex = Math.min(pageIndex, totalPages - 1);
  const pageStart = safePageIndex * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, sortedRows.length);
  const visibleRows = useMemo(
    () => sortedRows.slice(pageStart, pageEnd),
    [sortedRows, pageStart, pageEnd]
  );

  const { uyuDebt, usdDebt, uyuOverdue, usdOverdue } = useMemo(() => {
    if (canonicalTotals) {
      return {
        uyuDebt: canonicalTotals.active.UYU,
        usdDebt: canonicalTotals.active.USD,
        uyuOverdue: canonicalTotals.overdue.UYU,
        usdOverdue: canonicalTotals.overdue.USD,
      };
    }
    let uyuDebt = 0, usdDebt = 0, uyuOverdue = 0, usdOverdue = 0;
    for (const r of sortedRows) {
      if (r.currency === "UYU") {
        uyuDebt += r.deuda.amount;
        uyuOverdue += r.vencido?.amount ?? 0;
      } else {
        usdDebt += r.deuda.amount;
        usdOverdue += r.vencido?.amount ?? 0;
      }
    }
    return { uyuDebt, usdDebt, uyuOverdue, usdOverdue };
  }, [canonicalTotals, sortedRows]);

  function handlePageSizeChange(nextSize: number) {
    setPageSize(nextSize);
    setPageIndex(0);
  }

  return (
    <section ref={sectionRef} id="clientes-criticos" className="scroll-mt-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-[var(--copilot-ink-muted)]">
        {uyuDebt > 0 && (
          <span>
            Deuda actual UYU{" "}
            <span className="font-semibold text-amber-700">{fmtCurrencyAmount(uyuDebt, "UYU")}</span>
          </span>
        )}
        {usdDebt > 0 && (
          <span>
            Deuda actual USD{" "}
            <span className="font-semibold text-amber-700">{fmtCurrencyAmount(usdDebt, "USD")}</span>
          </span>
        )}
        {uyuOverdue > 0 && (
          <span>
            Deuda vencida UYU{" "}
            <span className="font-semibold text-rose-700">{fmtCurrencyAmount(uyuOverdue, "UYU")}</span>
          </span>
        )}
        {usdOverdue > 0 && (
          <span>
            Deuda vencida USD{" "}
            <span className="font-semibold text-rose-700">{fmtCurrencyAmount(usdOverdue, "USD")}</span>
          </span>
        )}
      </div>
      <div className="mt-2">
        <DebtorTable rows={visibleRows} highlightRisk={highlightRisk} portfolioDetails={portfolioDetails} />
      </div>
      {sortedRows.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-[var(--copilot-ink-muted)]">
            {sortedRows.length === 0
              ? "Sin clientes con deuda actual"
              : `Mostrando ${pageStart + 1}–${pageEnd} de ${sortedRows.length} clientes`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-[var(--copilot-ink-muted)]">
              <span>Por página</span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="rounded-md border border-[var(--copilot-border)] bg-[var(--copilot-dropdown-bg)] px-2 py-1 text-[11px] font-semibold text-[var(--copilot-ink)]"
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={safePageIndex === 0}
                onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                className="rounded-md border border-[var(--copilot-border)] bg-[var(--copilot-dropdown-bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--copilot-ink)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="px-1 text-[11px] tabular-nums text-[var(--copilot-ink-muted)]">
                {safePageIndex + 1} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePageIndex >= totalPages - 1}
                onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
                className="rounded-md border border-[var(--copilot-border)] bg-[var(--copilot-dropdown-bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--copilot-ink)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
