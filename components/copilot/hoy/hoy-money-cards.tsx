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
import { formatCopilotDate } from "@/lib/copilot-format";
import type { ManualCashMovement } from "@/lib/treasury/treasury-types";
import type { TreasuryScheduledPayment } from "@/lib/treasury/treasury-scheduled-payments";
import { HoyCashDetailCompact } from "@/components/copilot/hoy/hoy-cash-detail-compact";
import {
  copilotCurrencyClass,
  metricValueClass,
  neutralFinancialCardClass,
} from "@/components/copilot/ui/copilot-visual-system";

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

function HoyPaymentsDetailInline({
  payments,
  today,
}: {
  payments: readonly TreasuryScheduledPayment[];
  today: string;
}) {
  const upcoming = useMemo(() => filterUpcomingPayments(payments, today), [payments, today]);

  if (upcoming.length === 0) {
    return (
      <p className="text-center text-[10px] text-[var(--copilot-ink-muted)]">
        No hay pagos programados en los próximos 30 días.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="max-h-40 space-y-1 overflow-y-auto">
        {upcoming.slice(0, 8).map((p) => (
          <li
            key={p.id}
            className="flex items-start justify-between gap-2 border-b border-[var(--copilot-border)]/50 pb-1 text-[10px] last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <p className={`font-semibold ${copilotCurrencyClass(p.currency)}`}>{p.currency}</p>
              <p className="truncate text-[var(--copilot-ink)]">{p.name}</p>
              <p className="text-[var(--copilot-ink-muted)]">
                {formatCopilotDate(p.dueDate, "compact")}
              </p>
            </div>
            <p className="shrink-0 tabular-nums font-semibold text-[var(--copilot-danger-text-strong)]">
              {fmtCurrencyAmount(p.amount, p.currency)}
            </p>
          </li>
        ))}
      </ul>
      {upcoming.length > 8 ? (
        <p className="text-[10px] text-[var(--copilot-ink-muted)]">
          +{upcoming.length - 8} pagos más en el período.
        </p>
      ) : null}
      <Link
        href="/copilot/tesoreria?section=obligations"
        className="inline-flex text-[10px] font-semibold text-[var(--copilot-accent)] hover:underline"
      >
        Ver Tesorería →
      </Link>
    </div>
  );
}

function fmtAmountShort(amount: number, currency: "UYU" | "USD"): string {
  const full = fmtCurrencyAmount(amount, currency);
  if (currency === "USD") return full.replace(/^USD /, "");
  if (currency === "UYU") return full.replace(/^UYU /, "");
  return full;
}

// ─── Executive Projection Drawer ─────────────────────────────────────────────

export type ClientProjectionRow = {
  clientId: string;
  clientName: string;
  currency: "UYU" | "USD";
  expectedAmount: number;
  confidence: string;
};

function DrawerSectionLabel({ text }: { text: string }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--copilot-ink-muted)]">
      {text}
    </p>
  );
}

function DrawerAmountRow({
  block,
  value,
  sign,
}: {
  block: HoyProjection30dBlock;
  value: number;
  sign?: "positive" | "negative";
}) {
  const isNegative = value < 0;
  const signPrefix = sign === "positive" ? "+" : sign === "negative" ? "−" : "";
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={`text-[10px] font-bold uppercase ${copilotCurrencyClass(block.currency)}`}>
        {block.currency}
      </span>
      <span
        className={`text-[11px] tabular-nums font-semibold ${metricValueClass} ${
          isNegative ? "text-[var(--copilot-danger-text-strong)]" : "text-[var(--copilot-ink)]"
        }`}
      >
        {signPrefix}
        {isNegative && !signPrefix ? "−" : ""}
        {fmtAmountShort(Math.abs(value), block.currency)}
      </span>
    </div>
  );
}

function DrawerBlock({
  title,
  description,
  highlight = false,
  children,
}: {
  title: string;
  description?: string;
  highlight?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`space-y-1.5 rounded-lg px-2.5 py-2 ${
        highlight ? "border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)]" : ""
      }`}
    >
      <DrawerSectionLabel text={title} />
      <div className="space-y-0.5">{children}</div>
      {description ? (
        <p className="text-[9px] leading-snug text-[var(--copilot-ink-muted)]">{description}</p>
      ) : null}
    </div>
  );
}

function ConservativeBlock({ blocks }: { blocks: readonly HoyProjection30dBlock[] }) {
  const configured = blocks.filter((b) => b.hasConfiguredPayments);
  if (configured.length === 0) return null;
  return (
    <DrawerBlock title="Solo con caja actual">
      {configured.map((block) => (
        <div key={block.currency} className="space-y-0.5">
          <span className={`text-[9px] font-bold uppercase ${copilotCurrencyClass(block.currency)}`}>
            {block.currency}
          </span>
          <div className="flex items-baseline gap-1 pl-2 text-[10px] tabular-nums flex-wrap">
            <span className="text-[var(--copilot-ink)]">
              {fmtAmountShort(block.currentCash, block.currency)}
            </span>
            <span className="text-[var(--copilot-ink-muted)]">−</span>
            <span className="text-[var(--copilot-ink)]">
              {fmtAmountShort(block.scheduledPayments, block.currency)}
            </span>
            <span className="text-[var(--copilot-ink-muted)]">=</span>
            <span
              className={`font-semibold ${metricValueClass} ${
                block.safeCash30d < 0
                  ? "text-[var(--copilot-danger-text-strong)]"
                  : "text-[var(--copilot-ink)]"
              }`}
            >
              {block.safeCash30d < 0 ? "−" : ""}
              {fmtAmountShort(Math.abs(block.safeCash30d), block.currency)}
            </span>
          </div>
        </div>
      ))}
    </DrawerBlock>
  );
}

function ExecutiveMessageBlock({ blocks }: { blocks: readonly HoyProjection30dBlock[] }) {
  const configured = blocks.filter((b) => b.hasConfiguredPayments);
  if (configured.length === 0) return null;

  const allSafeCovered = configured.every((b) => b.safeCash30d >= 0);
  const deficitBlocks = configured.filter((b) => b.safeCash30d < 0);

  const resultLines = blocks.map((b) => {
    const val = b.hasConfiguredPayments ? b.expectedCash30d : b.currentCash;
    const isNeg = val < 0;
    return (
      <span
        key={b.currency}
        className={`block tabular-nums font-semibold ${metricValueClass} ${
          isNeg ? "text-[var(--copilot-danger-text-strong)]" : "text-[var(--copilot-ink)]"
        }`}
      >
        {isNeg ? "−" : ""}
        {fmtAmountShort(Math.abs(val), b.currency)} {b.currency}
      </span>
    );
  });

  if (allSafeCovered) {
    return (
      <div className="space-y-1 rounded-lg border border-[var(--copilot-tone-positive-bg)] bg-[var(--copilot-tone-positive-bg)]/60 px-2.5 py-2 text-[10px] leading-relaxed">
        <p className="text-[var(--copilot-success-text-strong)]">
          Con la caja actual podés cubrir todos los pagos de los próximos 30 días.
        </p>
        <p className="text-[var(--copilot-ink-muted)]">
          Si además cobrás lo previsto, terminarías el período con:
        </p>
        <div className="pl-1">{resultLines}</div>
      </div>
    );
  }

  return (
    <div className="space-y-1 rounded-lg border border-[var(--copilot-tone-warning-bg)] bg-[var(--copilot-tone-warning-bg)]/60 px-2.5 py-2 text-[10px] leading-relaxed">
      <p className="text-[var(--copilot-ink)]">Con la caja actual no alcanzás a cubrir todos los pagos.</p>
      {deficitBlocks.length > 0 ? (
        <div className="space-y-0.5">
          <p className="text-[var(--copilot-ink-muted)]">Faltarían:</p>
          {deficitBlocks.map((b) => (
            <span
              key={b.currency}
              className={`block tabular-nums font-semibold ${metricValueClass} text-[var(--copilot-danger-text-strong)]`}
            >
              {fmtAmountShort(Math.abs(b.safeCash30d), b.currency)} {b.currency}
            </span>
          ))}
        </div>
      ) : null}
      <p className="text-[var(--copilot-ink-muted)]">Si cobrás lo previsto, terminarías el período con:</p>
      <div className="pl-1">{resultLines}</div>
    </div>
  );
}

function PaymentsTableBlock({
  payments,
  today,
}: {
  payments: readonly TreasuryScheduledPayment[];
  today: string;
}) {
  const upcoming = filterUpcomingPayments(payments, today);
  if (upcoming.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <DrawerSectionLabel text="Pagos considerados" />
      <div className="max-h-36 overflow-y-auto">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 border-b border-[var(--copilot-border)] pb-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--copilot-ink-muted)]">
          <span>Concepto</span>
          <span>Fecha</span>
          <span className="text-right">Importe</span>
        </div>
        {upcoming.slice(0, 8).map((p) => (
          <div
            key={p.id}
            className="grid grid-cols-[1fr_auto_auto] gap-x-2 border-b border-[var(--copilot-border)]/40 py-0.5 text-[10px] last:border-b-0"
          >
            <span className="truncate text-[var(--copilot-ink)]">{p.name}</span>
            <span className="shrink-0 text-[var(--copilot-ink-muted)]">
              {formatCopilotDate(p.dueDate, "compact")}
            </span>
            <span className={`shrink-0 text-right tabular-nums font-semibold ${copilotCurrencyClass(p.currency)}`}>
              {fmtAmountShort(p.amount, p.currency)}
            </span>
          </div>
        ))}
      </div>
      {upcoming.length > 8 ? (
        <p className="text-[9px] text-[var(--copilot-ink-muted)]">+{upcoming.length - 8} pagos más</p>
      ) : null}
    </div>
  );
}

function ClientsTableBlock({ rows }: { rows: readonly ClientProjectionRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <DrawerSectionLabel text="Clientes incluidos en la proyección" />
      <div className="max-h-36 overflow-y-auto">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 border-b border-[var(--copilot-border)] pb-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--copilot-ink-muted)]">
          <span>Cliente</span>
          <span>Moneda</span>
          <span>Importe</span>
          <span>Confianza</span>
        </div>
        {rows.slice(0, 8).map((row) => (
          <div
            key={`${row.clientId}-${row.currency}`}
            className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 border-b border-[var(--copilot-border)]/40 py-0.5 text-[10px] last:border-b-0"
          >
            <span className="truncate text-[var(--copilot-ink)]">{row.clientName}</span>
            <span className={`shrink-0 text-[9px] font-bold uppercase ${copilotCurrencyClass(row.currency)}`}>
              {row.currency}
            </span>
            <span className="shrink-0 tabular-nums font-semibold text-[var(--copilot-ink)]">
              {fmtAmountShort(row.expectedAmount, row.currency)}
            </span>
            <span className="shrink-0 text-[var(--copilot-ink-muted)]">{row.confidence}</span>
          </div>
        ))}
      </div>
      {rows.length > 8 ? (
        <p className="text-[9px] text-[var(--copilot-ink-muted)]">+{rows.length - 8} clientes más</p>
      ) : null}
    </div>
  );
}

function ExecutiveProjectionDrawer({
  blocks,
  treasuryScheduledPayments,
  today,
  clientProjectionRows,
}: {
  blocks: readonly HoyProjection30dBlock[];
  treasuryScheduledPayments?: readonly TreasuryScheduledPayment[];
  today?: string;
  clientProjectionRows?: readonly ClientProjectionRow[];
}) {
  if (blocks.length === 0) {
    return (
      <p className="text-center text-[10px] text-[var(--copilot-ink-muted)]">
        Sin proyección disponible.
      </p>
    );
  }

  const configured = blocks.filter((b) => b.hasConfiguredPayments);

  return (
    <div className="space-y-2">
      {/* 1. Caja actual */}
      <DrawerBlock title="Caja actual" description="Dinero disponible hoy.">
        {blocks.map((block) => (
          <DrawerAmountRow key={block.currency} block={block} value={block.currentCash} />
        ))}
      </DrawerBlock>

      {/* 2. Cobros probables */}
      <DrawerBlock
        title="Cobros probables (30 días)"
        description="Estimación basada en saldo pendiente de clientes."
      >
        {blocks.map((block) => (
          <DrawerAmountRow key={block.currency} block={block} value={block.pendingReceivables} sign="positive" />
        ))}
      </DrawerBlock>

      {/* 3. Pagos próximos */}
      {configured.length > 0 ? (
        <DrawerBlock title="Pagos próximos (30 días)" description="Pagos programados y vencidos pendientes.">
          {configured.map((block) => (
            <DrawerAmountRow key={block.currency} block={block} value={block.scheduledPayments} sign="negative" />
          ))}
        </DrawerBlock>
      ) : null}

      {/* 4. Resultado proyectado */}
      <DrawerBlock title="Resultado proyectado" highlight>
        {blocks.map((block) => {
          const val = block.hasConfiguredPayments ? block.expectedCash30d : block.currentCash;
          return <DrawerAmountRow key={block.currency} block={block} value={val} />;
        })}
      </DrawerBlock>

      {/* 5. Solo con caja actual */}
      {configured.length > 0 ? <ConservativeBlock blocks={blocks} /> : null}

      {/* 6. Mensaje ejecutivo */}
      <ExecutiveMessageBlock blocks={blocks} />

      {/* 7. Clientes incluidos */}
      {clientProjectionRows && clientProjectionRows.length > 0 ? (
        <ClientsTableBlock rows={clientProjectionRows} />
      ) : null}

      {/* 8. Pagos considerados */}
      {treasuryScheduledPayments && today ? (
        <PaymentsTableBlock payments={treasuryScheduledPayments} today={today} />
      ) : null}

      <Link
        href="/copilot/tesoreria"
        className="inline-flex text-[10px] font-semibold text-[var(--copilot-accent)] hover:underline"
      >
        Ver Tesorería →
      </Link>
    </div>
  );
}

function MoneyCard({
  cardId,
  variant,
  title,
  subtitle,
  block,
  cashPositionBlocks,
  manualCashMovements,
  projection30dBlocks,
  treasuryScheduledPayments,
  today,
  clientProjectionRows,
  onCardClick,
  isActive,
}: {
  cardId: HoyCockpitCardId;
  variant: CardVariant;
  title: string;
  subtitle?: string;
  block: CockpitMoneyBlock;
  cashPositionBlocks?: HoyCashPositionBlock[];
  manualCashMovements?: readonly ManualCashMovement[];
  projection30dBlocks?: readonly HoyProjection30dBlock[];
  treasuryScheduledPayments?: readonly TreasuryScheduledPayment[];
  today?: string;
  clientProjectionRows?: readonly ClientProjectionRow[];
  onCardClick?: (id: HoyCockpitCardId) => void;
  isActive?: boolean;
}) {
  const theme = resolveTheme(variant, block);
  const interactive = Boolean(onCardClick);
  const isEmptyPayments = variant === "payments" && block.amounts.length === 0;
  const [detailOpen, setDetailOpen] = useState(false);
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
        <HoyPaymentsDetailInline payments={treasuryScheduledPayments} today={today} />
      );
    } else if (showProjectionDetail && projection30dBlocks) {
      expandedDetail = (
        <ExecutiveProjectionDrawer
          blocks={projection30dBlocks}
          treasuryScheduledPayments={treasuryScheduledPayments}
          today={today}
          clientProjectionRows={clientProjectionRows}
        />
      );
    }
  }

  return (
    <article
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? () => onCardClick?.(cardId) : undefined}
      onKeyDown={interactive ? (e) => cardActivateKey(e, () => onCardClick?.(cardId)) : undefined}
      className={`flex h-full min-h-0 w-full min-w-0 flex-col rounded-xl border p-2.5 shadow-sm transition-shadow sm:p-3 ${interactive ? "cursor-pointer hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)]" : ""} ${isActive ? "ring-2 ring-[var(--copilot-accent)]/40" : ""} ${theme.shell}`}
    >
      <header className="shrink-0">
        <CardHeader theme={theme} title={title} subtitle={subtitle} />
      </header>

      {isEmptyPayments ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-sm text-[var(--copilot-ink-muted)]">No hay pagos próximos cargados.</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center py-1">
          <CurrencyStack
            amounts={block.amounts}
            amountPrimaryClass={theme.amountPrimary}
            amountSecondaryClass={theme.amountSecondary}
            layout="kpi"
          />
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
                setDetailOpen((v) => !v);
              }}
            />
            {expandedDetail ? (
              <div
                className="rounded-lg border border-[var(--copilot-border)]/80 bg-[var(--copilot-soft-bg)]/50 p-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                {expandedDetail}
              </div>
            ) : null}
          </>
        )}
        {!isEmptyPayments ? (
          <CardFooter theme={theme} tone={block.footnote.tone} text={block.footnote.text} />
        ) : null}
      </footer>
    </article>
  );
}

function ReceivablesSection({
  label,
  amounts,
  labelClass,
  amountPrimaryClass,
  amountSecondaryClass,
  size,
}: {
  label: string;
  amounts: CockpitCurrencyAmount[];
  labelClass: string;
  amountPrimaryClass: string;
  amountSecondaryClass: string;
  size: AmountSize;
}) {
  return (
    <div className="space-y-0.5">
      {label ? (
        <p className={`text-[10px] font-bold uppercase tracking-[0.12em] ${labelClass}`}>{label}</p>
      ) : null}
      {amounts.length === 0 ? (
        <p className="text-xs text-[var(--copilot-ink-muted)]">—</p>
      ) : (
        <CurrencyStack
          amounts={amounts}
          amountPrimaryClass={amountPrimaryClass}
          amountSecondaryClass={amountSecondaryClass}
          size={size}
        />
      )}
    </div>
  );
}

function ReceivablesCard({
  card,
  subtitle,
  onCardClick,
  isActive,
}: {
  card: CockpitReceivablesCard;
  subtitle?: string;
  onCardClick?: (id: HoyCockpitCardId) => void;
  isActive?: boolean;
}) {
  const shell = CARD_THEME.receivables;
  const interactive = Boolean(onCardClick);
  const [detailOpen, setDetailOpen] = useState(false);
  const hasOverdueDetail =
    card.overdueTotal.some((a) => a.amount > 0) || card.overdue30.some((a) => a.amount > 0);

  return (
    <article
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? () => onCardClick?.("receivables") : undefined}
      onKeyDown={
        interactive ? (e) => cardActivateKey(e, () => onCardClick?.("receivables")) : undefined
      }
      className={`flex h-full min-h-0 w-full min-w-0 flex-col rounded-xl border p-2.5 shadow-sm transition-shadow sm:p-3 ${interactive ? "cursor-pointer hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)]" : ""} ${isActive ? "ring-2 ring-[var(--copilot-accent)]/40" : ""} ${shell.shell}`}
    >
      <header className="shrink-0">
        <CardHeader theme={shell} title={HOY_COCKPIT.receivables} subtitle={subtitle} />
        <p className="mt-1 text-[10px] leading-snug text-[var(--copilot-ink-muted)]">
          {HOY_COCKPIT.receivablesIncludedNote}
        </p>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center py-1 text-center">
        {card.totalPending.length === 0 ? (
          <p className="text-sm text-[var(--copilot-ink-muted)]">—</p>
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
            setDetailOpen((v) => !v);
          }}
        />
        {detailOpen && hasOverdueDetail ? (
          <div
            className="space-y-2 rounded-lg border border-[var(--copilot-border)]/80 bg-[var(--copilot-soft-bg)]/50 p-2"
            role="group"
            aria-label="Detalle de atrasos"
            onClick={(e) => e.stopPropagation()}
          >
            <ReceivablesSection
              label={HOY_COCKPIT.receivablesOverdueTotal}
              amounts={card.overdueTotal}
              labelClass="text-[var(--copilot-ink-muted)]"
              amountPrimaryClass="text-[var(--copilot-danger-text-strong)]"
              amountSecondaryClass="text-[var(--copilot-danger-text-strong)]"
              size="compact"
            />
            {card.overdueClientCount != null ? (
              <p className="text-[10px] text-[var(--copilot-ink-muted)]">
                {card.overdueClientCount}{" "}
                {card.overdueClientCount === 1 ? "cliente atrasado" : "clientes atrasados"}
              </p>
            ) : null}
            {card.overdue30.some((a) => a.amount > 0) ? (
              <>
                <ReceivablesSection
                  label={HOY_COCKPIT.receivablesOverdue30}
                  amounts={card.overdue30}
                  labelClass="text-[var(--copilot-ink-muted)]"
                  amountPrimaryClass="text-[var(--copilot-danger-text-strong)]"
                  amountSecondaryClass="text-[var(--copilot-ink-muted)]"
                  size="nested"
                />
                {card.overdue30ClientCount != null ? (
                  <p className="text-[10px] text-[var(--copilot-ink-muted)]">
                    {card.overdue30ClientCount}{" "}
                    {card.overdue30ClientCount === 1
                      ? "cliente con atraso +30 días"
                      : "clientes con atraso +30 días"}
                  </p>
                ) : null}
              </>
            ) : null}
            <Link
              href="/copilot/cartera"
              className="inline-flex text-[10px] font-semibold text-[var(--copilot-accent)] hover:underline"
            >
              Ver Cartera →
            </Link>
          </div>
        ) : detailOpen ? (
          <p className="rounded-lg border border-[var(--copilot-border)]/80 bg-[var(--copilot-soft-bg)]/50 p-2 text-center text-[10px] text-[var(--copilot-ink-muted)]">
            Sin atrasos registrados.
          </p>
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
  clientProjectionRows,
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
  clientProjectionRows?: readonly ClientProjectionRow[];
  onCardClick?: (id: HoyCockpitCardId) => void;
  activeCard?: HoyCockpitCardId | null;
}) {
  return (
    <div className="grid w-full min-w-0 grid-cols-1 gap-2.5 sm:gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:items-stretch">
      <MoneyCard
        cardId="cash"
        variant="cash"
        title={HOY_COCKPIT.moneyAvailable}
        block={moneyAvailable}
        cashPositionBlocks={cashPositionBlocks}
        manualCashMovements={manualCashMovements}
        onCardClick={onCardClick}
        isActive={activeCard === "cash"}
      />
      <ReceivablesCard
        card={receivables}
        onCardClick={onCardClick}
        isActive={activeCard === "receivables"}
      />
      <MoneyCard
        cardId="payments"
        variant="payments"
        title={HOY_COCKPIT.payments}
        subtitle={payments.amounts.length > 0 ? "Pagos cargados para los próximos 30 días." : undefined}
        block={payments}
        treasuryScheduledPayments={treasuryScheduledPayments}
        today={today}
        onCardClick={onCardClick}
        isActive={activeCard === "payments"}
      />
      <MoneyCard
        cardId="afterPayments"
        variant="afterPayments"
        title={HOY_COCKPIT.afterPayments}
        subtitle="Caja actual + cobros probables − pagos próximos"
        block={afterPayments}
        projection30dBlocks={projection30dBlocks}
        treasuryScheduledPayments={treasuryScheduledPayments}
        today={today}
        clientProjectionRows={clientProjectionRows}
        onCardClick={onCardClick}
        isActive={activeCard === "afterPayments"}
      />
    </div>
  );
}
