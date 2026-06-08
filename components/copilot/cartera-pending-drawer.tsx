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
  "0_30": "0–30 d",
  "31_60": "31–60 d",
  "61_90": "61–90 d",
  "90_plus": "+90 d",
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
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Deuda total ${currency}`}
        className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-none flex-col border-l border-[var(--copilot-border)] bg-[var(--copilot-card)] shadow-2xl md:w-[min(520px,100vw)] md:min-w-[420px]"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--copilot-border)] px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--copilot-ink-muted)]">
              Deuda total {currency}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-rose-600">
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
      <p className="shrink-0 border-b border-[var(--copilot-border)] bg-amber-50/50 px-5 py-2 text-[11px] leading-snug text-amber-900/90">
        {/* TODO: cablear detalle por factura cuando el reporte exponga líneas pendientes por cliente. */}
        Detalle por comprobante no disponible en este reporte. Se muestra cliente, saldo
        y cantidad de facturas (misma fuente que Explorador de deuda).
      </p>

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
    </div>
  );
}
