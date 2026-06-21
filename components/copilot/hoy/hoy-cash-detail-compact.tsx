"use client";

export {
  formatLastExpenseOrigin,
  formatLastIncomeOrigin,
} from "@/components/copilot/hoy/hoy-cash-detail-compact.helpers";

import Link from "next/link";

import { useDisplayCurrency } from "@/components/copilot/display-currency-provider";
import { formatUsdEquivalent } from "@/lib/currency-display-mode";
import { fmtCurrencyAmount } from "@/lib/copilot-today-business-pulse";
import type { HoyCashPositionBlock } from "@/lib/copilot-hoy-treasury";
import type { ManualCashMovement } from "@/lib/treasury/treasury-types";
import {
  formatLastExpenseOrigin,
  formatLastIncomeOrigin,
} from "@/components/copilot/hoy/hoy-cash-detail-compact.helpers";

const KPI_DETAIL_BODY_CLASS =
  "flex flex-1 flex-col justify-between text-[10px] leading-snug";

function formatCashEventDate(ymd: string): string {
  const [, m, d] = ymd.split("-");
  if (!m || !d) return ymd;
  return `${d}/${m}`;
}

function lookupMovementAmount(
  movements: readonly ManualCashMovement[] | undefined,
  currency: HoyCashPositionBlock["currency"],
  date: string,
  concept: string,
  movementType: "income" | "expense"
): number | null {
  if (!movements?.length) return null;
  const match = movements.find(
    (m) =>
      m.currencyCode === currency &&
      m.movementDate === date &&
      m.concept === concept &&
      m.movementType === movementType &&
      m.status === "active"
  );
  return match && Number.isFinite(match.amount) ? match.amount : null;
}

type LatestEvent = {
  kind: "income" | "expense";
  date: string;
  label: string;
  currency: HoyCashPositionBlock["currency"];
};

function latestCashEvent(
  blocks: readonly HoyCashPositionBlock[],
  manualMovements?: readonly ManualCashMovement[]
): LatestEvent | null {
  let latest: LatestEvent | null = null;

  for (const block of blocks) {
    const candidates: Array<{ kind: "income" | "expense"; event: NonNullable<HoyCashPositionBlock["lastIncome"]> }> = [];
    if (block.lastIncome) candidates.push({ kind: "income", event: block.lastIncome });
    if (block.lastExpense) candidates.push({ kind: "expense", event: block.lastExpense });

    for (const { kind, event } of candidates) {
      if (latest && event.date <= latest.date) continue;
      const fallback =
        kind === "income"
          ? lookupMovementAmount(manualMovements, block.currency, event.date, event.concept, "income")
          : lookupMovementAmount(manualMovements, block.currency, event.date, event.concept, "expense");
      const hasAmount =
        (event.amount != null && Number.isFinite(event.amount)) || (fallback != null && fallback > 0);
      if (!hasAmount && !event.concept) continue;

      const label =
        kind === "income"
          ? formatLastIncomeOrigin(event.concept).replace(/^Ingreso manual: /, "Ingreso · ").replace(/^Recibo Zeta: /, "Recibo · ")
          : formatLastExpenseOrigin(event.concept).replace(/^Egreso manual: /, "Egreso · ");

      latest = { kind, date: event.date, label, currency: block.currency };
    }
  }

  return latest;
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[1.125rem] items-baseline justify-between gap-2">
      <span className="text-[var(--copilot-ink-muted)]">{label}</span>
      <span className="max-w-[58%] shrink-0 truncate text-right font-semibold tabular-nums text-[var(--copilot-ink)]">
        {value}
      </span>
    </div>
  );
}

export function HoyCashDetailCompact({
  blocks,
  manualMovements,
}: {
  blocks: HoyCashPositionBlock[];
  manualMovements?: readonly ManualCashMovement[];
}) {
  const { mode, fxRate } = useDisplayCurrency();
  if (blocks.length === 0) return null;

  const uyu = blocks.find((b) => b.currency === "UYU")?.availableCash ?? 0;
  const usd = blocks.find((b) => b.currency === "USD")?.availableCash ?? 0;
  const rate = fxRate > 0 ? fxRate : 40;
  const totalUsd = Math.round((usd + uyu / rate) * 100) / 100;
  const uyuAsUsd = Math.round((uyu / rate) * 100) / 100;
  const latest = latestCashEvent(blocks, manualMovements);
  const lastMovement = latest
    ? `${latest.label} · ${formatCashEventDate(latest.date)}`
    : "Sin movimientos";

  const nativeTotal =
    uyu === 0 && usd === 0
      ? "—"
      : [uyu !== 0 ? fmtCurrencyAmount(uyu, "UYU") : null, usd !== 0 ? fmtCurrencyAmount(usd, "USD") : null]
          .filter(Boolean)
          .join(" · ");

  const lines: [string, string][] =
    mode === "usd_equivalent"
      ? [
          ["Total estimado", formatUsdEquivalent(totalUsd)],
          ["UYU convertido", formatUsdEquivalent(uyuAsUsd)],
          ["USD disponible", fmtCurrencyAmount(usd, "USD").replace(/^USD /, "")],
          ["Último movimiento", lastMovement],
        ]
      : [
          ["Total estimado", nativeTotal],
          ["UYU disponible", uyu !== 0 ? fmtCurrencyAmount(uyu, "UYU").replace(/^UYU /, "") : "—"],
          ["USD disponible", usd !== 0 ? fmtCurrencyAmount(usd, "USD").replace(/^USD /, "") : "—"],
          ["Último movimiento", lastMovement],
        ];

  return (
    <div className={KPI_DETAIL_BODY_CLASS}>
      <div className="space-y-1">
        {lines.map(([label, value]) => (
          <DetailLine key={label} label={label} value={value} />
        ))}
      </div>
      <Link
        href="/copilot/tesoreria"
        className="inline-flex min-h-[1.125rem] items-center pt-0.5 text-[10px] font-semibold text-[var(--copilot-accent)] hover:underline"
      >
        Ver Tesorería →
      </Link>
    </div>
  );
}
