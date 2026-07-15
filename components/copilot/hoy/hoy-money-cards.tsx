"use client";

import { type KeyboardEvent } from "react";
import { ArrowRight } from "lucide-react";

import { CopilotButtonLink } from "@/components/copilot/ui/copilot-button";

import type { HoyCockpitCardId } from "@/components/copilot/hoy/hoy-cockpit-card-drawer";
import type {
  CockpitAfterPaymentsAccent,
  CockpitCurrencyAmount,
  CockpitMoneyBlock,
  CockpitReceivablesCard,
} from "@/lib/copilot-hoy-cockpit-view";
import { HOY_COCKPIT } from "@/lib/copilot-hoy-ui-contract";
import {
  metricValueClass,
  neutralFinancialCardClass,
} from "@/components/copilot/ui/copilot-visual-system";
import { useDisplayCurrency } from "@/components/copilot/display-currency-provider";
import { formatUsdEquivalent } from "@/lib/currency-display-mode";

/**
 * Cockpit KPI cards de Hoy.
 *
 * Patrón master-detail: cada card es un *tile* de altura fija y uniforme con un
 * único CTA "Ver detalle" que abre el `HoyCockpitCardDrawer` (drawer lateral con
 * el desglose completo). El detalle NO se expande dentro de la celda: eso forzaba
 * a las 4 cards a igualar altura reservando espacio vacío en las no activas
 * (huecos enormes + `items-stretch`). Con el drawer, la fila queda siempre
 * compacta, alineada y con una sola card activa a la vez.
 */

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

function amountsToUsdEquivalent(amounts: CockpitCurrencyAmount[], fxRate: number): number {
  const uyu = amounts.find((a) => a.currency === "UYU")?.amount ?? 0;
  const usd = amounts.find((a) => a.currency === "USD")?.amount ?? 0;
  const rate = fxRate > 0 ? fxRate : 40;
  return Math.round((usd + uyu / rate) * 100) / 100;
}

function UsdEquivalentAmountDisplay({ total, fxRate }: { total: number; fxRate: number }) {
  return (
    <div className="flex flex-col items-center justify-center gap-0.5 text-center">
      <p className={`whitespace-nowrap tracking-tight ${metricValueClass} text-[1.4rem] xl:text-[1.6rem] text-[var(--copilot-ink)]`}>
        {formatUsdEquivalent(total)}
      </p>
      <p className="text-[10px] text-[var(--copilot-ink-muted)]">equiv. USD · TC {fxRate}</p>
    </div>
  );
}

/** UYU y USD apilados y separados — nunca combinados en una sola línea. */
function CurrencyStack({
  amounts,
  amountPrimaryClass,
  amountSecondaryClass,
}: {
  amounts: CockpitMoneyBlock["amounts"];
  amountPrimaryClass: string;
  amountSecondaryClass: string;
}) {
  if (amounts.length === 0) {
    return <p className="text-sm text-[var(--copilot-ink-muted)]">—</p>;
  }

  const sorted = sortAmounts(amounts);

  return (
    <div className="flex w-full flex-col items-center justify-center gap-3 text-center">
      {sorted.map((a, index) => {
        const isPrimary = a.currency === "UYU";
        return (
          <div key={a.currency} className="w-full">
            {index > 0 ? <div className="mb-3 border-t border-black/[0.06]" aria-hidden /> : null}
            <p
              className={`font-semibold uppercase tracking-[0.16em] text-[var(--copilot-ink-muted)] ${isPrimary ? "text-[11px]" : "text-[10px] opacity-75"}`}
            >
              {a.currency}
            </p>
            <p
              className={`mt-1 whitespace-nowrap tracking-tight ${metricValueClass} ${isPrimary ? `text-[1.65rem] xl:text-[1.85rem] ${amountPrimaryClass}` : `text-[1.25rem] xl:text-[1.4rem] ${amountSecondaryClass}`}`}
            >
              {amountDisplayLine(a)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function CardHeader({
  theme,
  title,
}: {
  theme: CardTheme;
  title: string;
}) {
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
  const prefix = tone === "warn" ? "⚠ " : "";
  const toneClass = theme.footer[tone];

  return (
    <p
      className={`rounded-lg bg-[var(--copilot-card-bg)]/50 px-2.5 py-1.5 text-xs font-medium leading-snug ${toneClass}`}
    >
      {prefix}
      {text}
    </p>
  );
}

const VER_DETALLE_CLASS =
  "flex h-9 w-full min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-[var(--copilot-button-secondary-border)] bg-[var(--copilot-button-secondary-bg)] px-2 text-[11px] font-semibold text-[var(--copilot-accent)] transition hover:bg-[var(--copilot-accent-soft)] sm:h-8 sm:text-[10px]";

/** CTA único de cada card: abre el drawer de detalle. */
function VerDetalleButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={VER_DETALLE_CLASS}
    >
      Ver detalle
      <ArrowRight className="h-3 w-3 shrink-0" aria-hidden />
    </button>
  );
}

function cardActivateKey(e: KeyboardEvent, onActivate: () => void) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    onActivate();
  }
}

const CARD_SHELL_CLASS =
  "flex h-full min-h-0 w-full min-w-0 flex-col justify-between rounded-xl border p-2.5 shadow-sm transition-shadow sm:p-3";

function MoneyCard({
  cardId,
  variant,
  title,
  tooltip,
  block,
  onCardClick,
  isActive,
}: {
  cardId: HoyCockpitCardId;
  variant: CardVariant;
  title: string;
  tooltip?: string;
  block: CockpitMoneyBlock;
  onCardClick?: (id: HoyCockpitCardId) => void;
  isActive?: boolean;
}) {
  const { mode, fxRate } = useDisplayCurrency();
  const theme = resolveTheme(variant, block);
  const interactive = Boolean(onCardClick);
  const isEmptyPayments = variant === "payments" && block.amounts.length === 0;

  return (
    <article
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      title={tooltip}
      onClick={interactive ? () => onCardClick?.(cardId) : undefined}
      onKeyDown={interactive ? (e) => cardActivateKey(e, () => onCardClick?.(cardId)) : undefined}
      className={`${CARD_SHELL_CLASS} ${interactive ? "cursor-pointer hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)]" : ""} ${isActive ? "ring-2 ring-[var(--copilot-accent)]/40" : ""} ${theme.shell}`}
    >
      <header className="shrink-0">
        <CardHeader theme={theme} title={title} />
      </header>

      {isEmptyPayments ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-sm text-[var(--copilot-ink-muted)]">
            No hay pagos próximos de la agencia cargados.
          </p>
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
            className={VER_DETALLE_CLASS}
          >
            Agregar pago programado
            <ArrowRight className="h-3 w-3 shrink-0" aria-hidden />
          </CopilotButtonLink>
        ) : (
          <>
            <CardFooter theme={theme} tone={block.footnote.tone} text={block.footnote.text} />
            {interactive ? <VerDetalleButton onOpen={() => onCardClick?.(cardId)} /> : null}
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
  onCardClick,
  isActive,
}: {
  card: CockpitReceivablesCard;
  debtorClientsCount?: number;
  tooltip?: string;
  onCardClick?: (id: HoyCockpitCardId) => void;
  isActive?: boolean;
}) {
  const { mode, fxRate } = useDisplayCurrency();
  const shell = CARD_THEME.receivables;
  const interactive = Boolean(onCardClick);
  const hasOverdue = card.overdueTotal.some((a) => a.amount > 0);
  const footnoteTone: CockpitMoneyBlock["footnote"]["tone"] = hasOverdue ? "danger" : "ok";
  const footnoteText = hasOverdue
    ? `${debtorClientsCount ?? 0} cliente${(debtorClientsCount ?? 0) !== 1 ? "s" : ""} con saldo atrasado`
    : "Sin saldos atrasados";

  return (
    <article
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      title={tooltip}
      onClick={interactive ? () => onCardClick?.("receivables") : undefined}
      onKeyDown={
        interactive ? (e) => cardActivateKey(e, () => onCardClick?.("receivables")) : undefined
      }
      className={`${CARD_SHELL_CLASS} ${interactive ? "cursor-pointer hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--copilot-accent)]" : ""} ${isActive ? "ring-2 ring-[var(--copilot-accent)]/40" : ""} ${shell.shell}`}
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
          />
        )}
      </div>

      <footer className="mt-auto shrink-0 space-y-1.5">
        <CardFooter theme={shell} tone={footnoteTone} text={footnoteText} />
        {interactive ? <VerDetalleButton onOpen={() => onCardClick?.("receivables")} /> : null}
      </footer>
    </article>
  );
}

export function HoyMoneyCards({
  moneyAvailable,
  payments,
  afterPayments,
  receivables,
  debtorClientsCount,
  onCardClick,
  activeCard,
}: {
  moneyAvailable: CockpitMoneyBlock;
  payments: CockpitMoneyBlock;
  afterPayments: CockpitMoneyBlock;
  receivables: CockpitReceivablesCard;
  debtorClientsCount?: number;
  onCardClick?: (id: HoyCockpitCardId) => void;
  activeCard?: HoyCockpitCardId | null;
}) {
  return (
    <div className="grid w-full min-w-0 grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4 xl:items-stretch">
      <MoneyCard
        cardId="cash"
        variant="cash"
        title={HOY_COCKPIT.moneyAvailable}
        tooltip="Dinero disponible actualmente considerando saldos de tesorería."
        block={moneyAvailable}
        onCardClick={onCardClick}
        isActive={activeCard === "cash"}
      />
      <ReceivablesCard
        card={receivables}
        debtorClientsCount={debtorClientsCount}
        tooltip="Facturas pendientes de cobro informadas por Zeta."
        onCardClick={onCardClick}
        isActive={activeCard === "receivables"}
      />
      <MoneyCard
        cardId="payments"
        variant="payments"
        title={HOY_COCKPIT.payments}
        tooltip="Pagos programados hasta fin del mes actual."
        block={payments}
        onCardClick={onCardClick}
        isActive={activeCard === "payments"}
      />
      <MoneyCard
        cardId="afterPayments"
        variant="afterPayments"
        title={HOY_COCKPIT.afterPayments}
        tooltip="Caja actual + cobros esperados − pagos programados."
        block={afterPayments}
        onCardClick={onCardClick}
        isActive={activeCard === "afterPayments"}
      />
    </div>
  );
}
