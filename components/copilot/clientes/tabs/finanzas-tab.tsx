"use client";

import { CopilotCard } from "@/components/copilot/copilot-ui";
import { ClientPaymentBehaviorCard } from "@/components/copilot/payment-behavior/client-payment-behavior-card";
import type { Client360Payload } from "@/lib/copilot-client-360";
import {
  sumAgingBuckets,
  sumLateBuckets,
  type Client360AgingBuckets,
} from "@/lib/copilot/client-360-aging";
import {
  OPERATING_DELAY_BUCKETS,
  OPERATING_DELAY_BUCKET_ORDER,
} from "@/lib/copilot/operating-aging";
import {
  neutralFinancialCardClass,
  warningFinancialCardClass,
} from "@/components/copilot/ui/copilot-visual-system";

import { formatDateShort } from "../client-360-format";

function money(sym: string, n: number): string {
  return `${sym} ${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

function SaldoCard({
  title,
  sym,
  pending,
  overdue,
}: {
  title: string;
  sym: string;
  pending: number;
  overdue: number;
}) {
  return (
    <CopilotCard className={warningFinancialCardClass}>
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {title}
      </p>
      <p
        className={`mt-1.5 text-2xl font-bold tabular-nums ${
          pending > 0 ? "text-[var(--copilot-warning-text)]" : "text-[var(--copilot-ink)]"
        }`}
      >
        {money(sym, pending)}
      </p>
      {overdue > 0 ? (
        <p className="mt-1 text-xs font-medium text-[var(--copilot-danger-text)]">
          {money(sym, overdue)} atrasados
          {pending > 0 ? ` (${Math.round((overdue / pending) * 100)}%)` : ""}
        </p>
      ) : (
        <p className="mt-1 text-xs text-[var(--copilot-ink-muted)]">Al día</p>
      )}
    </CopilotCard>
  );
}

function AgingBars({
  sym,
  buckets,
}: {
  sym: string;
  buckets: Client360AgingBuckets;
}) {
  const total = sumAgingBuckets(buckets);
  if (total <= 0) {
    return (
      <p className="text-sm text-[var(--copilot-ink-muted)]">Sin saldo pendiente.</p>
    );
  }
  return (
    <ul className="space-y-2">
      {OPERATING_DELAY_BUCKET_ORDER.map((b) => {
        const amount = buckets[b];
        const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
        const isLate = b !== "on_time";
        return (
          <li key={b} className="text-xs">
            <div className="mb-0.5 flex items-center justify-between gap-2">
              <span className={isLate ? "font-medium text-[var(--copilot-ink)]" : "text-[var(--copilot-ink-muted)]"}>
                {OPERATING_DELAY_BUCKETS[b].label}
              </span>
              <span className="tabular-nums text-[var(--copilot-ink-muted)]">
                {money(sym, amount)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--copilot-soft-bg)]">
              <div
                className={`h-full rounded-full ${
                  isLate ? "bg-[var(--copilot-danger-text)]" : "bg-[var(--copilot-accent)]"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function FinanzasTab({ data }: { data: Client360Payload }) {
  const uyuPending = sumAgingBuckets(data.aging.UYU);
  const usdPending = sumAgingBuckets(data.aging.USD);
  const uyuLate = sumLateBuckets(data.aging.UYU);
  const usdLate = sumLateBuckets(data.aging.USD);

  return (
    <div className="space-y-4 px-5 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <SaldoCard title="Saldo pendiente en pesos (UYU)" sym="$" pending={data.debt_uyu} overdue={data.overdue_uyu} />
        <SaldoCard title="Saldo pendiente en dólares (USD)" sym="U$S" pending={data.debt_usd} overdue={data.overdue_usd} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <CopilotCard className={neutralFinancialCardClass}>
          <p className="mb-1 text-sm font-semibold text-[var(--copilot-ink)]">
            Atraso en pesos (UYU)
          </p>
          <p className="mb-3 text-xs text-[var(--copilot-ink-muted)]">
            Distribución del saldo por días de atraso desde la fecha de vencimiento.
          </p>
          <AgingBars sym="$" buckets={data.aging.UYU} />
        </CopilotCard>
        <CopilotCard className={neutralFinancialCardClass}>
          <p className="mb-1 text-sm font-semibold text-[var(--copilot-ink)]">
            Atraso en dólares (USD)
          </p>
          <p className="mb-3 text-xs text-[var(--copilot-ink-muted)]">
            Distribución del saldo por días de atraso desde la fecha de vencimiento.
          </p>
          <AgingBars sym="U$S" buckets={data.aging.USD} />
        </CopilotCard>
      </div>

      <CopilotCard className={neutralFinancialCardClass}>
        <div className="grid gap-3 sm:grid-cols-3 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Facturas con atraso
            </p>
            <p className="mt-1 text-lg font-bold tabular-nums text-[var(--copilot-ink)]">
              {data.overdue_invoice_count}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Saldo atrasado
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-[var(--copilot-ink)]">
              {uyuLate > 0 ? money("$", uyuLate) : null}
              {uyuLate > 0 && usdLate > 0 ? " · " : null}
              {usdLate > 0 ? money("U$S", usdLate) : null}
              {uyuLate <= 0 && usdLate <= 0 ? "Al día" : null}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Último cobro
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--copilot-ink)]">
              {data.last_receipt_date ? formatDateShort(data.last_receipt_date) : "Sin cobros registrados"}
            </p>
          </div>
        </div>
        {uyuPending <= 0 && usdPending <= 0 ? (
          <p className="mt-3 text-xs text-[var(--copilot-ink-muted)]">
            Este cliente no tiene saldo pendiente.
          </p>
        ) : null}
      </CopilotCard>

      <ClientPaymentBehaviorCard companyId={data.summary.company_id} />
    </div>
  );
}
