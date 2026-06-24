"use client";

import {
  type ClientCurrentDebtSummary,
  type CurrentDebtCurrencyCode,
  type CurrentDebtCurrencySummary,
} from "@/lib/copilot-client-current-debt-summary";
import { useDisplayCurrency } from "@/components/copilot/display-currency-provider";
import { convertToUsdEquivalent, formatUsdEquivalent } from "@/lib/currency-display-mode";

const CURRENCY_LABEL: Record<CurrentDebtCurrencyCode, string> = {
  UYU: "Pesos",
  USD: "Dólares",
};

const CURRENCY_SYMBOL: Record<CurrentDebtCurrencyCode, string> = {
  UYU: "$",
  USD: "U$S",
};

/**
 * Bloque "Deuda actual del cliente" — siempre visible arriba del Estado de cuenta.
 *
 * Se calcula en el caller con `buildClientCurrentDebtSummary` usando el dataset
 * ledger COMPLETO (sin filtros de período), de modo que este bloque NUNCA se
 * mueve al cambiar mes/año/rango/corte histórico. Es la respuesta directa a
 * "¿cuánto debe HOY el cliente?" según `proto_invoices.balance_amount`.
 *
 * Diseño: financial-grade, compacto, sin cards gigantes. Paleta sobria —
 * pendiente en amber/slate suave, cobrado en emerald muy soft. Nunca rojo.
 */
export function ClientCurrentDebtSummary({
  summary,
}: {
  summary: ClientCurrentDebtSummary;
}) {
  const { mode, fxRate } = useDisplayCurrency();
  const isUsd = mode === "usd_equivalent";
  const hasInvoices = summary.totalInvoiceCount > 0;

  const pendingUyu = summary.currencies.find((c) => c.currencyCode === "UYU")?.totalPending ?? 0;
  const pendingUsd = summary.currencies.find((c) => c.currencyCode === "USD")?.totalPending ?? 0;
  const consolidatedUsd = convertToUsdEquivalent({ uyu: pendingUyu, usd: pendingUsd }, fxRate);

  return (
    <section
      aria-label="Deuda actual del cliente"
      className="space-y-2 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-3"
    >
      <header className="space-y-0.5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink)]">
          Deuda actual del cliente
        </h4>
        <p className="text-[11px] text-[var(--copilot-ink-muted)]">
          Calculado con el saldo pendiente informado por Zeta en cada factura
          al corte. El atrasado ya está incluido. Independiente del período seleccionado.
        </p>
      </header>

      {!hasInvoices ? (
        <p
          role="status"
          className="rounded-md border border-dashed border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-2.5 py-2 text-[11px] text-[var(--copilot-ink-muted)]"
        >
          Aún no hay facturas sincronizadas para este cliente.
        </p>
      ) : (
        <>
          <DebtBanner hasPendingDebt={summary.hasPendingDebt} />
          {isUsd && summary.hasPendingDebt ? (
            <div className="rounded-md border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                Total consolidado
              </p>
              <p className="mt-0.5 text-base font-bold tabular-nums text-[var(--copilot-ink)]">
                {formatUsdEquivalent(consolidatedUsd)}
              </p>
              <p className="text-[10px] text-[var(--copilot-ink-muted)]">
                TC {fxRate} · Detalle por moneda abajo
              </p>
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {summary.currencies.map((c) => (
              <CurrencyDebtCard key={c.currencyCode} block={c} />
            ))}
          </div>
          {summary.voidedCount > 0 ? (
            <p className="text-[10px] italic text-[var(--copilot-ink-muted)]">
              {summary.voidedCount} comprobante(s) anulado(s)/cancelado(s) excluido(s)
              del cálculo.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * Banner contextual con tono según existe deuda real:
 *  - Pendiente > 0 → amber (atención sutil; no urgencia roja).
 *  - Sin pendiente → emerald soft (estado saludable, sin sobrecelebrar).
 */
function DebtBanner({ hasPendingDebt }: { hasPendingDebt: boolean }) {
  const cls = hasPendingDebt
    ? "border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)]"
    : "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]";
  const text = hasPendingDebt
    ? "El cliente registra saldo pendiente según Zeta."
    : "El cliente no registra saldo pendiente según Zeta.";
  return (
    <p role="status" className={`rounded-md border px-2.5 py-1.5 text-[11px] font-medium ${cls}`}>
      {text}
    </p>
  );
}

/**
 * Card por moneda. Layout compacto:
 *   ┌──────────────────────────────────────────────┐
 *   │ Pendiente USD                                │
 *   │  U$S 1.400      ←  monto grande, accent      │
 *   │ ─────────────────────────────────────        │
 *   │ Cobradas 1 · Parciales 1 · Pendientes 1      │
 *   │ Facturado U$S 3.000 · Cobrado U$S 1.600      │
 *   └──────────────────────────────────────────────┘
 */
function CurrencyDebtCard({ block }: { block: CurrentDebtCurrencySummary }) {
  const sym = CURRENCY_SYMBOL[block.currencyCode];
  const label = CURRENCY_LABEL[block.currencyCode];
  const pendingTone =
    block.totalPending > 0
      ? "text-[var(--copilot-ink)]"
      : "text-[var(--copilot-ink-muted)]";
  return (
    <article
      aria-label={`Deuda actual en ${label}`}
      className="space-y-2 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-2"
    >
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          Pendiente {label}
        </p>
        <p className={`mt-0.5 text-lg font-semibold tabular-nums leading-tight ${pendingTone}`}>
          {sym} {block.totalPending.toLocaleString("es-UY", { maximumFractionDigits: 2 })}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <CountPill tone="paid" label="Cobradas" value={block.paidCount} />
        <CountPill tone="partial" label="Parciales" value={block.partialCount} />
        <CountPill tone="pending" label="Pendientes" value={block.pendingCount} />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 border-t border-[var(--copilot-border)] pt-1.5 text-[10px] text-[var(--copilot-ink-muted)]">
        <span>
          Facturado{" "}
          <span className="tabular-nums text-[var(--copilot-ink)]">
            {sym} {block.totalInvoiced.toLocaleString("es-UY", { maximumFractionDigits: 2 })}
          </span>
        </span>
        <span>
          Cobrado{" "}
          <span className="tabular-nums text-[var(--copilot-ink)]">
            {sym} {block.totalPaidByZeta.toLocaleString("es-UY", { maximumFractionDigits: 2 })}
          </span>
        </span>
      </div>
    </article>
  );
}

function CountPill({
  tone,
  label,
  value,
}: {
  tone: "paid" | "partial" | "pending";
  label: string;
  value: number;
}) {
  const cls =
    tone === "paid"
      ? "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]"
      : tone === "partial"
        ? "border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)]"
        : "border-[var(--copilot-border)] bg-[var(--copilot-badge-neutral-bg)] text-[var(--copilot-ink-muted)]";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}
    >
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="opacity-80">{label}</span>
    </span>
  );
}
