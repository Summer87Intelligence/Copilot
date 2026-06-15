"use client";

/**
 * Drawer lateral: clientes con saldo pendiente por moneda (UYU / USD).
 * Datos desde buildCurrentDebtSnapshot → report.staleClients.
 */

import { useEffect } from "react";
import Link from "next/link";
import { X } from "lucide-react";

import {
  formatCarteraInteger,
  formatCarteraMoney,
} from "@/lib/copilot-cartera-format";
import type {
  CurrentDebtSnapshot,
  PendingDebtClientRow,
} from "@/lib/copilot-cartera-pending-debt-snapshot";
import type {
  AgingRange,
  ReconciliationCurrencyCode,
} from "@/lib/copilot-financial-reconciliation";

const AGING_LABELS: Record<AgingRange, string> = {
  "0_30": "0–30 días",
  "31_60": "31–60 días",
  "61_90": "61–90 días",
  "90_plus": "+90 días",
};

export type CarteraPendingDrawerProps = {
  snapshot: CurrentDebtSnapshot | null;
  open: boolean;
  onClose: () => void;
};

export function CarteraPendingDrawer({
  snapshot,
  open,
  onClose,
}: CarteraPendingDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !snapshot) return null;

  const { currency, totalPending, clientCount, clients } = snapshot;
  const fractionDigits = currency === "UYU" ? 0 : 2;

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar panel"
        onClick={onClose}
        className="fixed inset-0 z-[var(--copilot-z-overlay)] bg-[var(--copilot-overlay-backdrop)] backdrop-blur-sm"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Deuda actual ${currency}`}
        className="fixed inset-y-0 right-0 z-[var(--copilot-z-drawer)] flex h-full w-full max-w-none flex-col border-l border-[var(--copilot-border)] bg-[var(--copilot-card)] shadow-2xl md:w-[min(520px,100vw)] md:min-w-[420px]"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--copilot-border)] px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--copilot-ink-muted)]">
              Deuda actual {currency}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--copilot-danger-text)]">
              {formatCarteraMoney(currency, totalPending)}
            </p>
            <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
              {formatCarteraInteger(clientCount)} cliente
              {clientCount === 1 ? "" : "s"} con deuda activa
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 transition hover:bg-[var(--copilot-panel-bg)]"
          >
            <X className="h-4 w-4 text-[var(--copilot-ink-muted)]" aria-hidden />
          </button>
        </header>

        <PendingDrawerBody
          clients={clients}
          currency={currency}
          fractionDigits={fractionDigits}
        />
      </aside>
    </>
  );
}

function PendingDrawerBody({
  clients,
  currency,
  fractionDigits,
}: {
  clients: PendingDebtClientRow[];
  currency: ReconciliationCurrencyCode;
  fractionDigits: number;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ul className="flex-1 overflow-y-auto px-3 py-3">
        {clients.length === 0 ? (
          <li className="rounded-xl border border-dashed border-[var(--copilot-border)] px-4 py-8 text-center text-sm text-[var(--copilot-ink-muted)]">
            Sin clientes con deuda total en {currency}.
          </li>
        ) : (
          clients.map((client) => (
            <li key={client.companyId} className="mb-2 last:mb-0">
              <ClientPendingRow
                client={client}
                currency={currency}
                fractionDigits={fractionDigits}
              />
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function formatPendingInvoiceDate(value: string | null): string {
  if (!value) return "—";
  return value;
}

function ClientPendingRow({
  client,
  currency,
  fractionDigits,
}: {
  client: PendingDebtClientRow;
  currency: ReconciliationCurrencyCode;
  fractionDigits: number;
}) {
  const name = client.companyName?.trim() || client.companyId;
  const pendingInvoices = client.pendingInvoices.filter(
    (line) => line.currencyCode === currency && line.balance > 0
  );
  const visibleInvoices = pendingInvoices.slice(0, 5);
  const hiddenInvoiceCount = Math.max(0, pendingInvoices.length - visibleInvoices.length);

  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/60 px-4 py-3 transition hover:border-[var(--copilot-accent)]/30 hover:bg-[var(--copilot-panel-bg)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--copilot-ink)]">
            {name}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--copilot-ink-muted)]">
            {formatCarteraInteger(client.invoiceCount)} factura
            {client.invoiceCount === 1 ? "" : "s"}
            {client.dominantAgingRange ? (
              <> · {AGING_LABELS[client.dominantAgingRange]}</>
            ) : null}
          </p>
          <Link
            href={`/copilot/clientes/${encodeURIComponent(client.companyId)}`}
            className="mt-2 inline-block text-[11px] font-medium text-[var(--copilot-accent)] hover:underline"
          >
            Ver ficha 360
          </Link>
        </div>
        <p className="shrink-0 text-base font-bold tabular-nums text-[var(--copilot-ink)]">
          {formatCarteraMoney(currency, client.pendingAmount, { fractionDigits })}
        </p>
      </div>
      {visibleInvoices.length > 0 ? (
        <ul className="mt-3 space-y-1 rounded-lg border border-[var(--copilot-border)]/70 bg-[var(--copilot-soft-bg)]/60 px-3 py-2">
          {visibleInvoices.map((line) => (
            <li
              key={line.invoiceId}
              className="flex items-start justify-between gap-3 text-[11px] text-[var(--copilot-ink-muted)]"
            >
              <span className="min-w-0 flex-1 truncate text-[var(--copilot-ink)]">
                {line.invoiceNumber ?? "Factura sin número"}
                <span className="ml-1 text-[var(--copilot-ink-muted)]">
                  · {formatPendingInvoiceDate(line.issueDate)}
                </span>
                {line.agingRange ? (
                  <span className="ml-1 text-[var(--copilot-ink-muted)]">
                    · {AGING_LABELS[line.agingRange]}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 tabular-nums text-[var(--copilot-ink)]">
                {formatCarteraMoney(currency, line.balance, { fractionDigits })}
              </span>
            </li>
          ))}
          {hiddenInvoiceCount > 0 ? (
            <li className="text-[11px] italic text-[var(--copilot-ink-muted)]">
              + {formatCarteraInteger(hiddenInvoiceCount)} factura
              {hiddenInvoiceCount === 1 ? "" : "s"} más
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
