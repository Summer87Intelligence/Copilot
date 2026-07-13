"use client";

import { useMemo, useState } from "react";

import { CopilotBadge, CopilotCard } from "@/components/copilot/copilot-ui";
import type { Client360InvoiceRow } from "@/lib/copilot-client-360";
import { getDaysLate } from "@/lib/copilot/operating-aging";
import { todayYmdMontevideo } from "@/lib/date/summer87-today";

import { cleanInvoiceType, cleanSerieNumero, formatDateShort } from "../client-360-format";

type StatusFilter = "todas" | "pendientes" | "atraso" | "pagas";
type CurrencyFilter = "todas" | "UYU" | "USD";

/** Estado operativo derivado (no usa "vencida"). */
function deriveInvoiceState(
  inv: Client360InvoiceRow,
  today: string
): { label: string; tone: "success" | "warning" | "danger" | "neutral"; isLate: boolean; isPaid: boolean } {
  const isPaid = inv.saldo_amount <= 0.005;
  if (isPaid) return { label: "Pagada", tone: "success", isLate: false, isPaid: true };
  const isLate = inv.due_date != null && getDaysLate(inv.due_date, today) > 0;
  if (isLate) return { label: "Con atraso", tone: "danger", isLate: true, isPaid: false };
  return { label: "Pendiente", tone: "warning", isLate: false, isPaid: false };
}

function moneySym(currency: Client360InvoiceRow["currency_code"]): string {
  return currency === "USD" ? "U$S" : "$";
}

export function FacturasTab({ invoices }: { invoices: Client360InvoiceRow[] }) {
  const today = todayYmdMontevideo();
  const [status, setStatus] = useState<StatusFilter>("todas");
  const [currency, setCurrency] = useState<CurrencyFilter>("todas");

  const rows = useMemo(() => {
    return invoices
      .map((inv) => ({ inv, state: deriveInvoiceState(inv, today) }))
      .filter(({ inv, state }) => {
        if (currency !== "todas" && (inv.currency_code ?? "UYU") !== currency) return false;
        if (status === "pendientes") return !state.isPaid;
        if (status === "atraso") return state.isLate;
        if (status === "pagas") return state.isPaid;
        return true;
      });
  }, [invoices, status, currency, today]);

  const statusChips: { id: StatusFilter; label: string }[] = [
    { id: "todas", label: "Todas" },
    { id: "pendientes", label: "Pendientes" },
    { id: "atraso", label: "Con atraso" },
    { id: "pagas", label: "Pagas" },
  ];
  const currencyChips: { id: CurrencyFilter; label: string }[] = [
    { id: "todas", label: "Ambas" },
    { id: "UYU", label: "UYU" },
    { id: "USD", label: "USD" },
  ];

  return (
    <div className="px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[var(--copilot-ink)]">
          Facturas
          {invoices.length > 0 ? (
            <span className="ml-2 text-xs font-normal text-[var(--copilot-ink-muted)]">
              ({rows.length}/{invoices.length})
            </span>
          ) : null}
        </p>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {statusChips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setStatus(c.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              status === c.id
                ? "border-[var(--copilot-accent)] bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)]"
                : "border-[var(--copilot-border)] text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-soft-bg)]"
            }`}
          >
            {c.label}
          </button>
        ))}
        <span className="mx-1 self-center text-[var(--copilot-border)]" aria-hidden>|</span>
        {currencyChips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCurrency(c.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              currency === c.id
                ? "border-[var(--copilot-accent)] bg-[var(--copilot-accent-soft)] text-[var(--copilot-accent)]"
                : "border-[var(--copilot-border)] text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-soft-bg)]"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <CopilotCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-[var(--copilot-table-header-bg)] text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                <th className="px-4 py-2.5">Fecha</th>
                <th className="px-4 py-2.5">Comprobante</th>
                <th className="px-4 py-2.5">Tipo</th>
                <th className="px-4 py-2.5">Vencimiento</th>
                <th className="px-4 py-2.5">Importe</th>
                <th className="px-4 py-2.5">Saldo</th>
                <th className="px-4 py-2.5">Atraso</th>
                <th className="px-4 py-2.5">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-[var(--copilot-ink-muted)]">
                    {invoices.length === 0
                      ? "Sin facturas abiertas. Si debería haber saldo, revisá el sync en Contactos."
                      : "Sin facturas para este filtro."}
                  </td>
                </tr>
              ) : (
                rows.map(({ inv, state }, i) => {
                  const daysLate = inv.due_date != null ? getDaysLate(inv.due_date, today) : Number.NaN;
                  const sym = moneySym(inv.currency_code);
                  return (
                    <tr
                      key={inv.id}
                      className={i % 2 === 0 ? "bg-[var(--copilot-card)]" : "bg-[var(--copilot-soft-bg)]"}
                    >
                      <td className="px-4 py-2.5">{formatDateShort(inv.issue_date)}</td>
                      <td className="px-4 py-2.5 font-medium">{cleanSerieNumero(inv.serie_numero)}</td>
                      <td className="px-4 py-2.5 text-[var(--copilot-ink-muted)]">{cleanInvoiceType(inv.tipo)}</td>
                      <td className="px-4 py-2.5 text-[var(--copilot-ink-muted)]">
                        {inv.due_date ? formatDateShort(inv.due_date) : "—"}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">
                        {`${sym} ${inv.importe.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-[var(--copilot-ink-muted)]">
                        {`${sym} ${inv.saldo}`}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-[var(--copilot-ink-muted)]">
                        {state.isLate && Number.isFinite(daysLate)
                          ? `${daysLate} día${daysLate === 1 ? "" : "s"}`
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <CopilotBadge tone={state.tone}>{state.label}</CopilotBadge>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CopilotCard>
    </div>
  );
}
