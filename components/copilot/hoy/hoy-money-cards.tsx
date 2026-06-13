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
  const prefix = tone === "ok" ? "✓ " : tone === "warn" ? "⚠ " : "· ";
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
  "flex h-8 w-full items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-[var(--copilot-button-secondary-border)] bg-[var(--copilot-button-secondary-bg)] px-2 text-[10px] font-semibold text-[var(--copilot-accent)] transition hover:bg-[var(--copilot-accent-soft)]";

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

function ProjectionCurrencyBlock({ block }: { block: HoyProjection30dBlock }) {
  const rows = [
    { label: "Caja actual", value: block.currentCash },
    { label: "Cobros esperados", value: block.pendingReceivables },
    {
      label: "Pagos próximos",
      value: block.hasConfiguredPayments ? block.scheduledPayments : 0,
    },
    { label: "Caja proyectada", value: block.expectedCash30d },
  ];

  return (
    <div className="space-y-1">
      <p className={`text-[10px] font-bold uppercase tracking-wide ${copilotCurrencyClass(block.currency)}`}>
        {block.currency}
      </p>
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-2 text-[10px]"
        >
          <span className="text-[var(--copilot-ink-muted)]">{row.label}</span>
          <span className={`tabular-nums font-semibold ${metricValueClass}`}>
            {fmtCurrencyAmount(row.value, block.currency)}
          </span>
        </div>
      ))}
    </div>
  );
}

function HoyProjectionDetailInline({
  blocks,
}: {
  blocks: readonly HoyProjection30dBlock[];
}) {
  if (blocks.length === 0) {
    return (
      <p className="text-center text-[10px] text-[var(--copilot-ink-muted)]">
        Sin proyección disponible.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {blocks.map((block, index) => (
        <div key={block.currency}>
          {index > 0 ? (
            <div className="mb-3 border-t border-[var(--copilot-border)]/60" aria-hidden />
          ) : null}
          <ProjectionCurrencyBlock block={block} />
        </div>
      ))}
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
      expandedDetail = <HoyProjectionDetailInline blocks={projection30dBlocks} />;
    }
  }

  return (
    <article
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? () => onCardClick?.(cardId) : undefined}
      onKeyDown={interactive ? (e) => cardActivateKey(e, () => onCardClick?.(cardId)) : undefined}
      className={`flex h-full min-h-0 flex-col rounded-xl border p-3 shadow-sm transition-shadow ${interactive ? "cursor-pointer hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)]" : ""} ${isActive ? "ring-2 ring-[var(--copilot-accent)]/40" : ""} ${theme.shell}`}
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
      className={`flex h-full min-h-0 flex-col rounded-xl border p-3 shadow-sm transition-shadow ${interactive ? "cursor-pointer hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)]" : ""} ${isActive ? "ring-2 ring-[var(--copilot-accent)]/40" : ""} ${shell.shell}`}
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
  onCardClick?: (id: HoyCockpitCardId) => void;
  activeCard?: HoyCockpitCardId | null;
}) {
  return (
    <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:items-stretch">
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
        block={afterPayments}
        projection30dBlocks={projection30dBlocks}
        onCardClick={onCardClick}
        isActive={activeCard === "afterPayments"}
      />
    </div>
  );
}
