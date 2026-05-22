"use client";

import type {
  CockpitAfterPaymentsAccent,
  CockpitCurrencyAmount,
  CockpitMoneyBlock,
  CockpitReceivablesCard,
} from "@/lib/copilot-hoy-cockpit-view";
import { HOY_COCKPIT } from "@/lib/copilot-hoy-ui-contract";

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
    shell: "bg-emerald-50/35 ring-1 ring-emerald-100/70",
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
    shell: "bg-amber-50/35 ring-1 ring-amber-100/70",
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
    shell: "bg-rose-50/35 ring-1 ring-rose-100/70",
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

const AFTER_PAYMENTS_THEME: Record<CockpitAfterPaymentsAccent, CardTheme> = {
  comfortable: {
    shell: "bg-teal-50/45 ring-1 ring-teal-200/70",
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
    shell: "bg-amber-50/35 ring-1 ring-amber-100/70",
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
    shell: "bg-rose-50/35 ring-1 ring-rose-100/70",
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
              className={`whitespace-nowrap text-right font-semibold tabular-nums tracking-tight ${isPrimary ? `${s.uyu} ${amountPrimaryClass}` : `${s.usd} ${amountSecondaryClass}`}`}
            >
              {amountDisplayLine(a)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CardHeader({ theme, title }: { theme: CardTheme; title: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${theme.badge}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${theme.dot}`} aria-hidden />
      {title}
    </span>
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

function MoneyCard({
  variant,
  title,
  block,
}: {
  variant: CardVariant;
  title: string;
  block: CockpitMoneyBlock;
}) {
  const theme = resolveTheme(variant, block);

  return (
    <article
      className={`flex min-h-[190px] flex-col rounded-3xl border border-black/[0.04] p-5 shadow-sm transition-shadow hover:shadow-md ${theme.shell}`}
    >
      <header>
        <CardHeader theme={theme} title={title} />
      </header>

      <div className="mt-2 flex flex-1 flex-col justify-center">
        <CurrencyStack
          amounts={block.amounts}
          amountPrimaryClass={theme.amountPrimary}
          amountSecondaryClass={theme.amountSecondary}
        />
      </div>

      <CardFooter theme={theme} tone={block.footnote.tone} text={block.footnote.text} />
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

function ReceivablesCard({ card }: { card: CockpitReceivablesCard }) {
  const shell = CARD_THEME.receivables;

  return (
    <article
      className={`flex min-h-[190px] flex-col rounded-3xl border border-black/[0.04] p-5 shadow-sm transition-shadow hover:shadow-md ${shell.shell}`}
    >
      <header>
        <CardHeader theme={shell} title={HOY_COCKPIT.receivables} />
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
}: {
  moneyAvailable: CockpitMoneyBlock;
  payments: CockpitMoneyBlock;
  afterPayments: CockpitMoneyBlock;
  receivables: CockpitReceivablesCard;
}) {
  return (
    <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MoneyCard variant="cash" title={HOY_COCKPIT.moneyAvailable} block={moneyAvailable} />
      <MoneyCard variant="payments" title={HOY_COCKPIT.payments} block={payments} />
      <MoneyCard variant="afterPayments" title={HOY_COCKPIT.afterPayments} block={afterPayments} />
      <ReceivablesCard card={receivables} />
    </div>
  );
}
