"use client";

import type { KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { HoyCockpitCardId } from "@/components/copilot/hoy/hoy-cockpit-card-drawer";
import type {
  CockpitAfterPaymentsAccent,
  CockpitCurrencyAmount,
  CockpitMoneyBlock,
  CockpitReceivablesCard,
} from "@/lib/copilot-hoy-cockpit-view";
import { HOY_COCKPIT } from "@/lib/copilot-hoy-ui-contract";
import {
  dangerFinancialCardClass,
  metricValueClass,
  neutralFinancialCardClass,
  positiveFinancialCardClass,
  warningFinancialCardClass,
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
    shell: positiveFinancialCardClass,
    badge: "bg-emerald-100/70 text-emerald-800",
    dot: "bg-emerald-500",
    amountPrimary: "text-emerald-900",
    amountSecondary: "text-emerald-800/70",
    footer: {
      ok: "text-emerald-800",
      warn: "text-emerald-800",
      danger: "text-emerald-800",
    },
  },
  receivables: {
    shell: warningFinancialCardClass,
    badge: "bg-amber-100/70 text-amber-900",
    dot: "bg-amber-500",
    amountPrimary: "text-amber-900",
    amountSecondary: "text-amber-800/70",
    footer: {
      ok: "text-amber-800",
      warn: "text-amber-900",
      danger: "text-amber-900",
    },
  },
  payments: {
    shell: dangerFinancialCardClass,
    badge: "bg-rose-100/70 text-rose-800",
    dot: "bg-rose-500",
    amountPrimary: "text-rose-900",
    amountSecondary: "text-rose-800/70",
    footer: {
      ok: "text-emerald-800",
      warn: "text-rose-800",
      danger: "text-rose-800",
    },
  },
};

const EMPTY_PAYMENTS_THEME: CardTheme = {
  shell: neutralFinancialCardClass,
  badge: "bg-slate-100/70 text-slate-600",
  dot: "bg-slate-400",
  amountPrimary: "text-slate-700",
  amountSecondary: "text-slate-600/70",
  footer: {
    ok: "text-slate-700",
    warn: "text-slate-600",
    danger: "text-slate-700",
  },
};

const AFTER_PAYMENTS_THEME: Record<CockpitAfterPaymentsAccent, CardTheme> = {
  comfortable: {
    shell: positiveFinancialCardClass,
    badge: "bg-teal-100 text-teal-800",
    dot: "bg-teal-500",
    amountPrimary: "text-teal-900",
    amountSecondary: "text-teal-700/80",
    footer: {
      ok: "text-teal-800",
      warn: "text-teal-800",
      danger: "text-teal-800",
    },
  },
  adjusted: {
    shell: warningFinancialCardClass,
    badge: "bg-amber-100/70 text-amber-900",
    dot: "bg-amber-500",
    amountPrimary: "text-amber-900",
    amountSecondary: "text-amber-800/70",
    footer: {
      ok: "text-amber-800",
      warn: "text-amber-900",
      danger: "text-amber-900",
    },
  },
  critical: {
    shell: dangerFinancialCardClass,
    badge: "bg-rose-100/70 text-rose-800",
    dot: "bg-rose-500",
    amountPrimary: "text-rose-900",
    amountSecondary: "text-rose-800/70",
    footer: {
      ok: "text-rose-800",
      warn: "text-rose-800",
      danger: "text-rose-900",
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
    uyu: "text-[2rem] xl:text-[2.2rem]",
    usd: "text-[1.55rem] xl:text-[1.75rem]",
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
    labelSecondary: "text-[9px] opacity-75",
  },
  alert: {
    uyu: "text-[1.2rem] xl:text-[1.35rem]",
    usd: "text-[1rem] xl:text-[1.1rem]",
    rowPrimary: "py-0.5",
    rowSecondary: "py-0.5",
    labelPrimary: "text-[9px]",
    labelSecondary: "text-[9px] opacity-70",
  },
  nested: {
    uyu: "text-[1.05rem] xl:text-[1.15rem]",
    usd: "text-[0.92rem] xl:text-[1rem]",
    rowPrimary: "py-0.5",
    rowSecondary: "py-0.5",
    labelPrimary: "text-[9px]",
    labelSecondary: "text-[8px] opacity-70",
  },
};

function CurrencyStack({
  amounts,
  amountPrimaryClass,
  amountSecondaryClass,
  size = "primary",
}: {
  amounts: CockpitMoneyBlock["amounts"];
  amountPrimaryClass: string;
  amountSecondaryClass: string;
  size?: AmountSize;
}) {
  const s = AMOUNT_SIZE[size];
  if (amounts.length === 0) {
    return <p className="text-sm text-[var(--copilot-ink-muted)]">—</p>;
  }

  const sorted = sortAmounts(amounts);

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
  const prefix = tone === "ok" ? "✓ " : tone === "warn" ? "⚠ " : "· ";
  const toneClass = theme.footer[tone];

  return (
    <p
      className={`mt-2.5 rounded-lg bg-white/50 px-2.5 py-1.5 text-xs font-medium leading-snug ${toneClass}`}
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

function MoneyCard({
  cardId,
  variant,
  title,
  subtitle,
  block,
  onCardClick,
  isActive,
}: {
  cardId: HoyCockpitCardId;
  variant: CardVariant;
  title: string;
  subtitle?: string;
  block: CockpitMoneyBlock;
  onCardClick?: (id: HoyCockpitCardId) => void;
  isActive?: boolean;
}) {
  const theme = resolveTheme(variant, block);
  const interactive = Boolean(onCardClick);
  const isEmptyPayments = variant === "payments" && block.amounts.length === 0;

  return (
    <article
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? () => onCardClick?.(cardId) : undefined}
      onKeyDown={interactive ? (e) => cardActivateKey(e, () => onCardClick?.(cardId)) : undefined}
      className={`flex min-h-[190px] flex-col rounded-3xl border p-5 shadow-sm transition-shadow ${interactive ? "cursor-pointer hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)]" : ""} ${isActive ? "ring-2 ring-[var(--copilot-accent)]/40" : ""} ${theme.shell}`}
    >
      <header>
        <CardHeader theme={theme} title={title} subtitle={subtitle} />
      </header>

      {isEmptyPayments ? (
        <div className="mt-3 flex flex-1 flex-col justify-center">
          <p className="text-sm text-[var(--copilot-ink-muted)]">No hay pagos próximos cargados.</p>
          <Link
            href="/copilot/tesoreria?section=obligations"
            onClick={(e) => e.stopPropagation()}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
          >
            Agregar pago programado
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      ) : (
        <div className="mt-2 flex flex-1 flex-col justify-center">
          <CurrencyStack
            amounts={block.amounts}
            amountPrimaryClass={theme.amountPrimary}
            amountSecondaryClass={theme.amountSecondary}
          />
        </div>
      )}

      {!isEmptyPayments && (
        <CardFooter theme={theme} tone={block.footnote.tone} text={block.footnote.text} />
      )}
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
      <p className={`text-[10px] font-bold uppercase tracking-[0.12em] ${labelClass}`}>{label}</p>
      {amounts.length === 0 ? (
        <p className="text-xs text-slate-500">—</p>
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

  return (
    <article
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? () => onCardClick?.("receivables") : undefined}
      onKeyDown={
        interactive ? (e) => cardActivateKey(e, () => onCardClick?.("receivables")) : undefined
      }
      className={`flex min-h-[190px] flex-col rounded-3xl border p-5 shadow-sm transition-shadow ${interactive ? "cursor-pointer hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)]" : ""} ${isActive ? "ring-2 ring-[var(--copilot-accent)]/40" : ""} ${shell.shell}`}
    >
      <header>
        <CardHeader theme={shell} title={HOY_COCKPIT.receivables} subtitle={subtitle} />
      </header>

      <div className="mt-3 flex flex-1 flex-col justify-center">
        <ReceivablesSection
          label={HOY_COCKPIT.receivablesTotalPending}
          amounts={card.totalPending}
          labelClass="text-amber-800"
          amountPrimaryClass="text-amber-900"
          amountSecondaryClass="text-amber-800/80"
          size="primary"
        />
        <div
          className="mt-2.5 border-t border-amber-200/45 pt-2.5"
          role="group"
          aria-label={`${HOY_COCKPIT.receivablesIncludedInTotal}: ${HOY_COCKPIT.receivablesOverdue30}`}
        >
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-rose-700/75">
            {HOY_COCKPIT.receivablesIncludedInTotal}
          </p>
          <div className="mt-1">
            <ReceivablesSection
              label={HOY_COCKPIT.receivablesOverdue30}
              amounts={card.overdue30}
              labelClass="text-rose-700/90"
              amountPrimaryClass="text-rose-800"
              amountSecondaryClass="text-rose-700/70"
              size="nested"
            />
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-rose-700/65">
            {HOY_COCKPIT.receivablesOverdue30Hint}
          </p>
        </div>
      </div>
    </article>
  );
}

export function HoyMoneyCards({
  moneyAvailable,
  payments,
  afterPayments,
  receivables,
  onCardClick,
  activeCard,
}: {
  moneyAvailable: CockpitMoneyBlock;
  payments: CockpitMoneyBlock;
  afterPayments: CockpitMoneyBlock;
  receivables: CockpitReceivablesCard;
  onCardClick?: (id: HoyCockpitCardId) => void;
  activeCard?: HoyCockpitCardId | null;
}) {
  return (
    <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MoneyCard
        cardId="cash"
        variant="cash"
        title={HOY_COCKPIT.moneyAvailable}
        subtitle="Dinero disponible en Tesorería."
        block={moneyAvailable}
        onCardClick={onCardClick}
        isActive={activeCard === "cash"}
      />
      <ReceivablesCard
        card={receivables}
        subtitle="Facturas abiertas de clientes."
        onCardClick={onCardClick}
        isActive={activeCard === "receivables"}
      />
      <MoneyCard
        cardId="payments"
        variant="payments"
        title={HOY_COCKPIT.payments}
        subtitle={payments.amounts.length > 0 ? "Pagos cargados para los próximos 30 días." : undefined}
        block={payments}
        onCardClick={onCardClick}
        isActive={activeCard === "payments"}
      />
      <MoneyCard
        cardId="afterPayments"
        variant="afterPayments"
        title={HOY_COCKPIT.afterPayments}
        subtitle="Caja actual menos pagos próximos."
        block={afterPayments}
        onCardClick={onCardClick}
        isActive={activeCard === "afterPayments"}
      />
    </div>
  );
}
