"use client";

import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import Link from "next/link";

import { CopilotButtonLink } from "@/components/copilot/ui/copilot-button";

import type { HoyCockpitCardId } from "@/components/copilot/hoy/hoy-cockpit-card-drawer";
import type {
  CockpitAfterPaymentsAccent,
  CockpitCurrencyAmount,
  CockpitMoneyBlock,
  CockpitReceivablesCard,
} from "@/lib/copilot-hoy-cockpit-view";
import { HOY_COCKPIT } from "@/lib/copilot-hoy-ui-contract";
import type { HoyCashPositionBlock, HoyProjection30dBlock } from "@/lib/copilot-hoy-treasury";
import { fmtCurrencyAmount } from "@/lib/copilot-today-business-pulse";
import type { ManualCashMovement } from "@/lib/treasury/treasury-types";
import type { TreasuryScheduledPayment } from "@/lib/treasury/treasury-scheduled-payments";
import { HoyCashDetailCompact } from "@/components/copilot/hoy/hoy-cash-detail-compact";
import {
  metricValueClass,
  neutralFinancialCardClass,
} from "@/components/copilot/ui/copilot-visual-system";
import { useDisplayCurrency } from "@/components/copilot/display-currency-provider";
import { formatUsdEquivalent } from "@/lib/currency-display-mode";

type CardVariant = "cash" | "receivables" | "payments" | "afterPayments";

type CardTheme = {
  shell: string;
  badge: string;
  dot: string;
  amountPrimary: string;
  amountSecondary: string;
  footer: { ok: string; warn: string; danger: string };
};

const CARD_THEME: Record<Exclude<CardVariant, "afterPayments">, CardTheme> = {
  cash: {
    shell: neutralFinancialCardClass,
    badge: "bg-[var(--copilot-badge-success-bg)] text-[var(--copilot-badge-success-text)]",
    dot: "bg-[var(--copilot-status-ok-dot)]",
    amountPrimary: "text-[var(--copilot-ink)]",
    amountSecondary: "text-[var(--copilot-ink-muted)]",
    footer: {
      ok: "text-[var(--copilot-ink-muted)]",
      warn: "text-[var(--copilot-ink-muted)]",
      danger: "text-[var(--copilot-danger-text-strong)]",
    },
  },
  receivables: {
    shell: neutralFinancialCardClass,
    badge: "bg-[var(--copilot-badge-neutral-bg)] text-[var(--copilot-ink-muted)]",
    dot: "bg-[var(--copilot-subtle)]",
    amountPrimary: "text-[var(--copilot-danger-text-strong)]",
    amountSecondary: "text-[var(--copilot-danger-text-strong)]",
    footer: {
      ok: "text-[var(--copilot-ink-muted)]",
      warn: "text-[var(--copilot-ink-muted)]",
      danger: "text-[var(--copilot-danger-text-strong)]",
    },
  },
  payments: {
    shell: neutralFinancialCardClass,
    badge: "bg-[var(--copilot-badge-neutral-bg)] text-[var(--copilot-ink-muted)]",
    dot: "bg-[var(--copilot-subtle)]",
    amountPrimary: "text-[var(--copilot-danger-text-strong)]",
    amountSecondary: "text-[var(--copilot-danger-text-strong)]",
    footer: {
      ok: "text-[var(--copilot-ink-muted)]",
      warn: "text-[var(--copilot-warning-text-strong)]",
      danger: "text-[var(--copilot-danger-text-strong)]",
    },
  },
};

const EMPTY_PAYMENTS_THEME: CardTheme = {
  shell: neutralFinancialCardClass,
  badge: "bg-[var(--copilot-badge-neutral-bg)] text-[var(--copilot-ink-muted)]",
  dot: "bg-[var(--copilot-subtle)]",
  amountPrimary: "text-[var(--copilot-ink)]",
  amountSecondary: "text-[var(--copilot-ink-muted)]",
  footer: {
    ok: "text-[var(--copilot-ink-muted)]",
    warn: "text-[var(--copilot-ink-muted)]",
    danger: "text-[var(--copilot-ink-muted)]",
  },
};

const AFTER_PAYMENTS_THEME: Record<CockpitAfterPaymentsAccent, CardTheme> = {
  comfortable: {
    shell: neutralFinancialCardClass,
    badge: "bg-[var(--copilot-badge-neutral-bg)] text-[var(--copilot-ink-muted)]",
    dot: "bg-[var(--copilot-subtle)]",
    amountPrimary: "text-[var(--copilot-ink)]",
    amountSecondary: "text-[var(--copilot-ink-muted)]",
    footer: {
      ok: "text-[var(--copilot-ink-muted)]",
      warn: "text-[var(--copilot-ink-muted)]",
      danger: "text-[var(--copilot-danger-text-strong)]",
    },
  },
  adjusted: {
    shell: neutralFinancialCardClass,
    badge: "bg-[var(--copilot-badge-neutral-bg)] text-[var(--copilot-ink-muted)]",
    dot: "bg-[var(--copilot-subtle)]",
    amountPrimary: "text-[var(--copilot-ink)]",
    amountSecondary: "text-[var(--copilot-ink-muted)]",
    footer: {
      ok: "text-[var(--copilot-ink-muted)]",
      warn: "text-[var(--copilot-ink-muted)]",
      danger: "text-[var(--copilot-danger-text-strong)]",
    },
  },
  critical: {
    shell: neutralFinancialCardClass,
    badge: "bg-[var(--copilot-badge-danger-bg)] text-[var(--copilot-badge-danger-text)]",
    dot: "bg-[var(--copilot-status-critical-dot)]",
    amountPrimary: "text-[var(--copilot-ink)]",
    amountSecondary: "text-[var(--copilot-ink-muted)]",
    footer: {
      ok: "text-[var(--copilot-ink-muted)]",
      warn: "text-[var(--copilot-danger-text-strong)]",
      danger: "text-[var(--copilot-danger-text-strong)]",
    },
  },
};

function resolveTheme(variant: CardVariant, block: CockpitMoneyBlock): CardTheme {
  if (variant === "payments" && block.amounts.length === 0) {
    return EMPTY_PAYMENTS_THEME;
  }
  if (variant === "afterPayments") {
    return AFTER_PAYMENTS_THEME[block.afterPaymentsAccent ?? "comfortable"];
  }
  return CARD_THEME[variant];
}

function amountDisplayLine(a: CockpitCurrencyAmount): string {
  if (a.currency === "USD") {
    return a.formatted.replace(/^USD U\$S /, "U$S ");
  }
  return a.formatted.replace(/^UYU \$ /, "$ ");
}

function sortAmounts(amounts: CockpitMoneyBlock["amounts"]) {
  return [...amounts].sort((a, b) => (a.currency === "UYU" ? -1 : b.currency === "UYU" ? 1 : 0));
}

type AmountSize = "primary" | "compact" | "alert" | "nested";

const AMOUNT_SIZE: Record<
  AmountSize,
  { uyu: string; usd: string; rowPrimary: string; rowSecondary: string; labelPrimary: string; labelSecondary: string }
> = {
  primary: {
    uyu: "text-[1.65rem] xl:text-[1.85rem]",
    usd: "text-[1.25rem] xl:text-[1.4rem]",
    rowPrimary: "py-2",
    rowSecondary: "py-1.5",
    labelPrimary: "text-[11px]",
    labelSecondary: "text-[10px] opacity-75",
  },
  compact: {
    uyu: "text-[1.35rem] xl:text-[1.5rem]",
    usd: "text-[1.1rem] xl:text-[1.2rem]",
    rowPrimary: "py-1",
    rowSecondary: "py-0.5",
    labelPrimary: "text-[10px]",
    labelSecondary: "text-[10px] opacity-75",
  },
  alert: {
    uyu: "text-[1.2rem] xl:text-[1.35rem]",
    usd: "text-[1rem] xl:text-[1.1rem]",
    rowPrimary: "py-0.5",
    rowSecondary: "py-0.5",
    labelPrimary: "text-[10px]",
    labelSecondary: "text-[10px] opacity-70",
  },
  nested: {
    uyu: "text-[1.05rem] xl:text-[1.15rem]",
    usd: "text-[0.92rem] xl:text-[1rem]",
    rowPrimary: "py-0.5",
    rowSecondary: "py-0.5",
    labelPrimary: "text-[10px]",
    labelSecondary: "text-[10px] opacity-70",
  },
};

function amountsToUsdEquivalent(amounts: CockpitCurrencyAmount[], fxRate: number): number {
  const uyu = amounts.find((a) => a.currency === "UYU")?.amount ?? 0;
  const usd = amounts.find((a) => a.currency === "USD")?.amount ?? 0;
  const rate = fxRate > 0 ? fxRate : 40;
  return Math.round((usd + uyu / rate) * 100) / 100;
}

function UsdEquivalentAmountDisplay({
  total,
  fxRate,
}: {
  total: number;
  fxRate: number;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 text-center">
      <p className={`whitespace-nowrap tracking-tight ${metricValueClass} text-[1.4rem] xl:text-[1.6rem] text-[var(--copilot-ink)]`}>
        {formatUsdEquivalent(total)}
      </p>
      <p className="text-[10px] text-[var(--copilot-ink-muted)]">equiv. USD · TC {fxRate}</p>
    </div>
  );
}

function CurrencyStack({
  amounts,
  amountPrimaryClass,
  amountSecondaryClass,
  size = "primary",
  layout = "row",
}: {
  amounts: CockpitMoneyBlock["amounts"];
  amountPrimaryClass: string;
  amountSecondaryClass: string;
  size?: AmountSize;
  layout?: "row" | "kpi";
}) {
  const s = AMOUNT_SIZE[size];
  if (amounts.length === 0) {
    return <p className="text-sm text-[var(--copilot-ink-muted)]">—</p>;
  }

  const sorted = sortAmounts(amounts);

  if (layout === "kpi") {
    return (
      <div className="flex w-full flex-col items-center justify-center gap-3 text-center">
        {sorted.map((a, index) => {
          const isPrimary = a.currency === "UYU";
          return (
            <div key={a.currency} className="w-full">
              {index > 0 ? <div className="mb-3 border-t border-black/[0.06]" aria-hidden /> : null}
              <p
                className={`font-semibold uppercase tracking-[0.16em] text-[var(--copilot-ink-muted)] ${isPrimary ? s.labelPrimary : s.labelSecondary}`}
              >
                {a.currency}
              </p>
              <p
                className={`mt-1 whitespace-nowrap tracking-tight ${metricValueClass} ${isPrimary ? `${s.uyu} ${amountPrimaryClass}` : `${s.usd} ${amountSecondaryClass}`}`}
              >
                {amountDisplayLine(a)}
              </p>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      {sorted.map((a) => {
        const isPrimary = a.currency === "UYU";
        return (
          <div
            key={a.currency}
            className={`flex items-baseline justify-between gap-3 border-b border-black/[0.04] last:border-b-0 ${isPrimary ? s.rowPrimary : s.rowSecondary}`}
          >
            <span
              className={`shrink-0 font-semibold uppercase tracking-[0.16em] text-[var(--copilot-ink-muted)] ${isPrimary ? s.labelPrimary : s.labelSecondary}`}
            >
              {a.currency}
            </span>
            <span
              className={`whitespace-nowrap text-right tracking-tight ${metricValueClass} ${isPrimary ? `${s.uyu} ${amountPrimaryClass}` : `${s.usd} ${amountSecondaryClass}`}`}
            >
              {amountDisplayLine(a)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CardHeader({
  theme,
  title,
  subtitle,
}: {
  theme: CardTheme;
  title: string;
  subtitle?: string;
}) {
  return (
    <>
      <span
        className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${theme.badge}`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${theme.dot}`} aria-hidden />
        {title}
      </span>
      {subtitle ? (
        <p className="mt-1.5 text-[11px] leading-snug text-[var(--copilot-ink-muted)]">
          {subtitle}
        </p>
      ) : null}
    </>
  );
}

function CardFooter({
  theme,
  tone,
  text,
}: {
  theme: CardTheme;
  tone: CockpitMoneyBlock["footnote"]["tone"];
  text: string;
}) {
  const prefix = tone === "warn" ? "⚠ " : "";
  const toneClass = theme.footer[tone];

  return (
    <p
      className={`mt-2.5 rounded-lg bg-[var(--copilot-card-bg)]/50 px-2.5 py-1.5 text-xs font-medium leading-snug ${toneClass}`}
    >
      {prefix}
      {text}
    </p>
  );
}

function cardActivateKey(e: KeyboardEvent, onActivate: () => void) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    onActivate();
  }
}

const DETAIL_TOGGLE_CLASS =
  "flex h-9 w-full min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-[var(--copilot-button-secondary-border)] bg-[var(--copilot-button-secondary-bg)] px-2 text-[11px] font-semibold text-[var(--copilot-accent)] transition hover:bg-[var(--copilot-accent-soft)] sm:h-8 sm:text-[10px]";

function DetailToggleButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: (e: React.MouseEvent) => void;
}) {
  return (
    <button type="button" onClick={onToggle} className={DETAIL_TOGGLE_CLASS}>
      {open ? "Ocultar detalle" : "Ver detalle"}
      <ChevronDown className={`h-3 w-3 shrink-0 transition ${open ? "rotate-180" : ""}`} aria-hidden />
    </button>
  );
}

function addDaysIso(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function filterUpcomingPayments(
  payments: readonly TreasuryScheduledPayment[],
  today: string
): TreasuryScheduledPayment[] {
  const end = addDaysIso(today, 30);
  return payments
    .filter(
      (p) =>
        p.status !== "paid" &&
        p.status !== "cancelled" &&
        p.dueDate >= today &&
        p.dueDate <= end
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name));
}

const COMPACT_DETAIL_PANEL =
  "rounded-lg border border-[var(--copilot-border)]/80 bg-[var(--copilot-soft-bg)]/50 p-2";

/** 4 filas de datos + CTA — altura uniforme entre KPI cards. */
const KPI_DETAIL_BODY_CLASS =
  "flex flex-1 flex-col justify-between text-[10px] leading-snug";

const KPI_DETAIL_SLOT_CLASS = `${COMPACT_DETAIL_PANEL} h-[8.5rem] flex flex-col overflow-hidden`;

function CompactDetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[1.125rem] items-baseline justify-between gap-2 text-[10px] leading-snug">
      <span className="text-[var(--copilot-ink-muted)]">{label}</span>
      <span className="max-w-[58%] shrink-0 truncate text-right font-semibold tabular-nums text-[var(--copilot-ink)]">
        {value}
      </span>
    </div>
  );
}

function CompactDetailCta({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-[1.125rem] items-center pt-0.5 text-[10px] font-semibold text-[var(--copilot-accent)] hover:underline"
    >
      {label}
    </Link>
  );
}

function KpiDetailShell({
  lines,
  ctaHref,
  ctaLabel,
}: {
  lines: readonly [label: string, value: string][];
  ctaHref: string;
  ctaLabel: string;
}) {
  const normalized = [...lines.slice(0, 4)];
  while (normalized.length < 4) {
    normalized.push(["—", "—"]);
  }

  return (
    <div className={KPI_DETAIL_BODY_CLASS}>
      <div className="space-y-1">
        {normalized.map(([label, value], index) => (
          <CompactDetailLine key={`${label}-${index}`} label={label} value={value} />
        ))}
      </div>
      <CompactDetailCta href={ctaHref} label={ctaLabel} />
    </div>
  );
}

function KpiDetailSlot({
  open,
  rowExpanded,
  children,
}: {
  open: boolean;
  rowExpanded: boolean;
  children: ReactNode;
}) {
  if (!open && !rowExpanded) return null;

  return (
    <div
      className={`${KPI_DETAIL_SLOT_CLASS}${open ? "" : " border-transparent opacity-0 pointer-events-none"}`}
      aria-hidden={!open}
      onClick={(e) => e.stopPropagation()}
    >
      {open ? children : <div className={KPI_DETAIL_BODY_CLASS} aria-hidden />}
    </div>
  );
}

function formatCompactDate(ymd: string): string {
  const [, m, d] = ymd.split("-");
  if (!m || !d) return ymd;
  return `${d}/${m}`;
}

function paymentsToAmounts(payments: readonly TreasuryScheduledPayment[]): CockpitCurrencyAmount[] {
  const sums: Record<"UYU" | "USD", number> = { UYU: 0, USD: 0 };
  for (const p of payments) {
    sums[p.currency] += p.amount;
  }
  return (["UYU", "USD"] as const)
    .filter((c) => sums[c] > 0)
    .map((c) => ({
      currency: c,
      amount: sums[c],
      formatted: fmtCurrencyAmount(sums[c], c),
    }));
}

function projectionFieldUsd(
  blocks: readonly HoyProjection30dBlock[],
  fxRate: number,
  getter: (block: HoyProjection30dBlock) => number
): number {
  const rate = fxRate > 0 ? fxRate : 40;
  let total = 0;
  for (const block of blocks) {
    const value = getter(block);
    total += block.currency === "USD" ? value : value / rate;
  }
  return Math.round(total * 100) / 100;
}

function HoyPaymentsDetailCompact({
  payments,
  today,
}: {
  payments: readonly TreasuryScheduledPayment[];
  today: string;
}) {
  const { mode, fxRate } = useDisplayCurrency();
  const upcoming = useMemo(() => filterUpcomingPayments(payments, today), [payments, today]);

  if (upcoming.length === 0) {
    return (
      <KpiDetailShell
        lines={[
          ["Total pagos", "—"],
          ["Próximo pago", "—"],
          ["Cantidad pagos", "0"],
          ["Próxima fecha", "—"],
        ]}
        ctaHref="/copilot/tesoreria?section=obligations"
        ctaLabel="Ver Tesorería →"
      />
    );
  }

  const next = upcoming[0];
  const totalAmounts = paymentsToAmounts(upcoming);
  const totalLabel =
    mode === "usd_equivalent"
      ? formatUsdEquivalent(amountsToUsdEquivalent(totalAmounts, fxRate))
      : totalAmounts.map((a) => amountDisplayLine(a)).join(" · ");
  const nextAmount =
    mode === "usd_equivalent"
      ? formatUsdEquivalent(
          next.currency === "USD" ? next.amount : next.amount / (fxRate > 0 ? fxRate : 40)
        )
      : fmtAmountShort(next.amount, next.currency);

  return (
    <KpiDetailShell
      lines={[
        ["Total pagos", totalLabel],
        ["Próximo pago", `${next.name} · ${nextAmount}`],
        ["Cantidad pagos", String(upcoming.length)],
        ["Próxima fecha", formatCompactDate(next.dueDate)],
      ]}
      ctaHref="/copilot/tesoreria?section=obligations"
      ctaLabel="Ver Tesorería →"
    />
  );
}

function ReceivablesDetailCompact({
  card,
  debtorClientsCount,
}: {
  card: CockpitReceivablesCard;
  debtorClientsCount?: number;
}) {
  const { mode, fxRate } = useDisplayCurrency();
  const fmt = (amounts: CockpitCurrencyAmount[]) =>
    mode === "usd_equivalent"
      ? formatUsdEquivalent(amountsToUsdEquivalent(amounts, fxRate))
      : amounts.map((a) => amountDisplayLine(a)).join(" · ") || "—";

  return (
    <KpiDetailShell
      lines={[
        ["Deuda actual", fmt(card.totalPending)],
        ["Atrasado", fmt(card.overdueTotal)],
        ["+30 días", fmt(card.overdue30)],
        ["Clientes", String(debtorClientsCount ?? 0)],
      ]}
      ctaHref="/copilot/cartera"
      ctaLabel="Ver Cartera →"
    />
  );
}

function ExecutiveProjectionCompact({ blocks }: { blocks: readonly HoyProjection30dBlock[] }) {
  const { mode, fxRate } = useDisplayCurrency();

  if (blocks.length === 0) {
    return (
      <KpiDetailShell
        lines={[
          ["Caja actual", "—"],
          ["Cobros probables", "—"],
          ["Pagos próximos", "—"],
          ["Resultado", "—"],
        ]}
        ctaHref="/copilot/tesoreria"
        ctaLabel="Ver Tesorería →"
      />
    );
  }

  const fmtValue = (getter: (block: HoyProjection30dBlock) => number, prefix = "") => {
    if (mode === "usd_equivalent") {
      return `${prefix}${formatUsdEquivalent(projectionFieldUsd(blocks, fxRate, getter))}`;
    }
    return blocks
      .map((b) => `${prefix}${fmtAmountShort(Math.abs(getter(b)), b.currency)} ${b.currency}`)
      .join(" · ");
  };

  const resultGetter = (b: HoyProjection30dBlock) =>
    b.hasConfiguredPayments ? b.expectedCash30d : b.currentCash;

  return (
    <KpiDetailShell
      lines={[
        ["Caja actual", fmtValue((b) => b.currentCash)],
        ["Cobros probables", fmtValue((b) => b.pendingReceivables, "+")],
        ["Pagos próximos", fmtValue((b) => (b.hasConfiguredPayments ? b.scheduledPayments : 0), "−")],
        ["Resultado", fmtValue(resultGetter)],
      ]}
      ctaHref="/copilot/tesoreria"
      ctaLabel="Ver Tesorería →"
    />
  );
}

function fmtAmountShort(amount: number, currency: "UYU" | "USD"): string {
  const full = fmtCurrencyAmount(amount, currency);
  if (currency === "USD") return full.replace(/^USD /, "");
  if (currency === "UYU") return full.replace(/^UYU /, "");
  return full;
}


function MoneyCard({
  cardId,
  variant,
  title,
  subtitle,
  tooltip,
  block,
  cashPositionBlocks,
  manualCashMovements,
  projection30dBlocks,
  treasuryScheduledPayments,
  today,
  detailOpen,
  rowExpanded,
  onDetailToggle,
  onCardClick,
  isActive,
}: {
  cardId: HoyCockpitCardId;
  variant: CardVariant;
  title: string;
  subtitle?: string;
  tooltip?: string;
  block: CockpitMoneyBlock;
  cashPositionBlocks?: HoyCashPositionBlock[];
  manualCashMovements?: readonly ManualCashMovement[];
  projection30dBlocks?: readonly HoyProjection30dBlock[];
  treasuryScheduledPayments?: readonly TreasuryScheduledPayment[];
  today?: string;
  detailOpen: boolean;
  rowExpanded: boolean;
  onDetailToggle: () => void;
  onCardClick?: (id: HoyCockpitCardId) => void;
  isActive?: boolean;
}) {
  const { mode, fxRate } = useDisplayCurrency();
  const theme = resolveTheme(variant, block);
  const interactive = Boolean(onCardClick);
  const isEmptyPayments = variant === "payments" && block.amounts.length === 0;
  const showCashDetail = variant === "cash" && (cashPositionBlocks?.length ?? 0) > 0;
  const showPaymentsDetail = variant === "payments" && !isEmptyPayments;
  const showProjectionDetail = variant === "afterPayments";

  let expandedDetail: ReactNode = null;
  if (detailOpen) {
    if (showCashDetail) {
      expandedDetail = (
        <HoyCashDetailCompact
          blocks={cashPositionBlocks!}
          manualMovements={manualCashMovements}
        />
      );
    } else if (showPaymentsDetail && treasuryScheduledPayments && today) {
      expandedDetail = (
        <HoyPaymentsDetailCompact payments={treasuryScheduledPayments} today={today} />
      );
    } else if (showProjectionDetail && projection30dBlocks) {
      expandedDetail = <ExecutiveProjectionCompact blocks={projection30dBlocks} />;
    }
  }

  const cardLayoutClass = rowExpanded ? "h-full self-stretch justify-between" : "self-start";

  return (
    <article
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      title={tooltip}
      onClick={interactive ? () => onCardClick?.(cardId) : undefined}
      onKeyDown={interactive ? (e) => cardActivateKey(e, () => onCardClick?.(cardId)) : undefined}
      className={`flex min-h-0 w-full min-w-0 flex-col rounded-xl border p-2.5 shadow-sm transition-shadow sm:p-3 ${cardLayoutClass} ${interactive ? "cursor-pointer hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)]" : ""} ${isActive ? "ring-2 ring-[var(--copilot-accent)]/40" : ""} ${theme.shell}`}
    >
      <header className="shrink-0">
        <CardHeader theme={theme} title={title} subtitle={detailOpen ? subtitle : undefined} />
      </header>

      {isEmptyPayments ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-sm text-[var(--copilot-ink-muted)]">No hay pagos próximos cargados.</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center py-1">
          {mode === "usd_equivalent" && block.amounts.length > 0 ? (
            <UsdEquivalentAmountDisplay
              total={amountsToUsdEquivalent(block.amounts, fxRate)}
              fxRate={fxRate}
            />
          ) : (
            <CurrencyStack
              amounts={block.amounts}
              amountPrimaryClass={theme.amountPrimary}
              amountSecondaryClass={theme.amountSecondary}
              layout="kpi"
            />
          )}
        </div>
      )}

      <footer className="mt-auto shrink-0 space-y-1.5">
        {isEmptyPayments ? (
          <CopilotButtonLink
            href="/copilot/tesoreria?section=obligations"
            variant="ghost"
            size="sm"
            onClick={(e) => e.stopPropagation()}
            className={DETAIL_TOGGLE_CLASS}
          >
            Agregar pago programado
            <ArrowRight className="h-3 w-3 shrink-0" aria-hidden />
          </CopilotButtonLink>
        ) : (
          <>
            <DetailToggleButton
              open={detailOpen}
              onToggle={(e) => {
                e.stopPropagation();
                onDetailToggle();
              }}
            />
            <KpiDetailSlot open={detailOpen} rowExpanded={rowExpanded}>
              {expandedDetail}
            </KpiDetailSlot>
            {!detailOpen && !rowExpanded ? (
              <CardFooter theme={theme} tone={block.footnote.tone} text={block.footnote.text} />
            ) : null}
          </>
        )}
      </footer>
    </article>
  );
}

function ReceivablesCard({
  card,
  debtorClientsCount,
  tooltip,
  detailOpen,
  rowExpanded,
  onDetailToggle,
  onCardClick,
  isActive,
}: {
  card: CockpitReceivablesCard;
  debtorClientsCount?: number;
  tooltip?: string;
  detailOpen: boolean;
  rowExpanded: boolean;
  onDetailToggle: () => void;
  onCardClick?: (id: HoyCockpitCardId) => void;
  isActive?: boolean;
}) {
  const { mode, fxRate } = useDisplayCurrency();
  const shell = CARD_THEME.receivables;
  const interactive = Boolean(onCardClick);
  const cardLayoutClass = rowExpanded ? "h-full self-stretch justify-between" : "self-start";
  const hasOverdue = card.overdueTotal.some((a) => a.amount > 0);
  const footnoteTone: CockpitMoneyBlock["footnote"]["tone"] = hasOverdue ? "danger" : "ok";
  const footnoteText = hasOverdue
    ? `${debtorClientsCount ?? 0} cliente${(debtorClientsCount ?? 0) !== 1 ? "s" : ""} con saldo vencido`
    : "Sin saldos vencidos";

  return (
    <article
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      title={tooltip}
      onClick={interactive ? () => onCardClick?.("receivables") : undefined}
      onKeyDown={
        interactive ? (e) => cardActivateKey(e, () => onCardClick?.("receivables")) : undefined
      }
      className={`flex min-h-0 w-full min-w-0 flex-col rounded-xl border p-2.5 shadow-sm transition-shadow sm:p-3 ${cardLayoutClass} ${interactive ? "cursor-pointer hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)]" : ""} ${isActive ? "ring-2 ring-[var(--copilot-accent)]/40" : ""} ${shell.shell}`}
    >
      <header className="shrink-0">
        <CardHeader theme={shell} title={HOY_COCKPIT.receivables} />
      </header>

      <div className="flex flex-1 flex-col items-center justify-center py-1 text-center">
        {card.totalPending.length === 0 ? (
          <p className="text-sm text-[var(--copilot-ink-muted)]">—</p>
        ) : mode === "usd_equivalent" ? (
          <UsdEquivalentAmountDisplay
            total={amountsToUsdEquivalent(card.totalPending, fxRate)}
            fxRate={fxRate}
          />
        ) : (
          <CurrencyStack
            amounts={card.totalPending}
            amountPrimaryClass="text-[var(--copilot-danger-text-strong)]"
            amountSecondaryClass="text-[var(--copilot-danger-text-strong)]"
            layout="kpi"
          />
        )}
      </div>

      <footer className="mt-auto shrink-0 space-y-1.5">
        <DetailToggleButton
          open={detailOpen}
          onToggle={(e) => {
            e.stopPropagation();
            onDetailToggle();
          }}
        />
        <KpiDetailSlot open={detailOpen} rowExpanded={rowExpanded}>
          <ReceivablesDetailCompact card={card} debtorClientsCount={debtorClientsCount} />
        </KpiDetailSlot>
        {!detailOpen && !rowExpanded ? (
          <CardFooter theme={shell} tone={footnoteTone} text={footnoteText} />
        ) : null}
      </footer>
    </article>
  );
}

export function HoyMoneyCards({
  moneyAvailable,
  payments,
  afterPayments,
  receivables,
  cashPositionBlocks,
  manualCashMovements,
  projection30dBlocks,
  treasuryScheduledPayments,
  today,
  debtorClientsCount,
  onCardClick,
  activeCard,
}: {
  moneyAvailable: CockpitMoneyBlock;
  payments: CockpitMoneyBlock;
  afterPayments: CockpitMoneyBlock;
  receivables: CockpitReceivablesCard;
  cashPositionBlocks?: HoyCashPositionBlock[];
  manualCashMovements?: readonly ManualCashMovement[];
  projection30dBlocks?: readonly HoyProjection30dBlock[];
  treasuryScheduledPayments?: readonly TreasuryScheduledPayment[];
  today?: string;
  debtorClientsCount?: number;
  onCardClick?: (id: HoyCockpitCardId) => void;
  activeCard?: HoyCockpitCardId | null;
}) {
  const [openDetails, setOpenDetails] = useState<Set<HoyCockpitCardId>>(() => new Set());
  const rowExpanded = openDetails.size > 0;

  const toggleDetail = (id: HoyCockpitCardId) => {
    setOpenDetails((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const gridClass = rowExpanded
    ? "grid w-full min-w-0 grid-cols-1 gap-2.5 sm:gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:items-stretch"
    : "grid w-full min-w-0 grid-cols-1 gap-2.5 sm:gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:items-start";

  return (
    <div className={gridClass}>
      <MoneyCard
        cardId="cash"
        variant="cash"
        title={HOY_COCKPIT.moneyAvailable}
        tooltip="Dinero disponible actualmente considerando saldos de tesorería."
        block={moneyAvailable}
        cashPositionBlocks={cashPositionBlocks}
        manualCashMovements={manualCashMovements}
        detailOpen={openDetails.has("cash")}
        rowExpanded={rowExpanded}
        onDetailToggle={() => toggleDetail("cash")}
        onCardClick={onCardClick}
        isActive={activeCard === "cash"}
      />
      <ReceivablesCard
        card={receivables}
        debtorClientsCount={debtorClientsCount}
        tooltip="Facturas pendientes de cobro informadas por Zeta."
        detailOpen={openDetails.has("receivables")}
        rowExpanded={rowExpanded}
        onDetailToggle={() => toggleDetail("receivables")}
        onCardClick={onCardClick}
        isActive={activeCard === "receivables"}
      />
      <MoneyCard
        cardId="payments"
        variant="payments"
        title={HOY_COCKPIT.payments}
        tooltip="Pagos programados para los próximos 30 días."
        subtitle={payments.amounts.length > 0 ? "Pagos cargados para los próximos 30 días." : undefined}
        block={payments}
        treasuryScheduledPayments={treasuryScheduledPayments}
        today={today}
        detailOpen={openDetails.has("payments")}
        rowExpanded={rowExpanded}
        onDetailToggle={() => toggleDetail("payments")}
        onCardClick={onCardClick}
        isActive={activeCard === "payments"}
      />
      <MoneyCard
        cardId="afterPayments"
        variant="afterPayments"
        title={HOY_COCKPIT.afterPayments}
        tooltip="Caja actual + cobros esperados − pagos programados."
        subtitle="Caja actual + cobros probables − pagos próximos"
        block={afterPayments}
        projection30dBlocks={projection30dBlocks}
        detailOpen={openDetails.has("afterPayments")}
        rowExpanded={rowExpanded}
        onDetailToggle={() => toggleDetail("afterPayments")}
        onCardClick={onCardClick}
        isActive={activeCard === "afterPayments"}
      />
    </div>
  );
}
