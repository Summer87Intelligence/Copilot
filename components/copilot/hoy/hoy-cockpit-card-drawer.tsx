"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { HoyDrawer } from "@/components/copilot/hoy/hoy-drawer";
import { formatMoneySymbolOnly } from "@/components/copilot/hoy/hoy-clients-with-debt-section";
import {
  groupDebtorRowsByCurrency,
  type CockpitMoneyBlock,
  type CockpitReceivablesCard,
  type CockpitView,
} from "@/lib/copilot-hoy-cockpit-view";
import { HOY_COCKPIT, HOY_COPY } from "@/lib/copilot-hoy-ui-contract";
import type { DebtorCollectionRow } from "@/lib/copilot-today-business-pulse";
import { fmtCurrencyAmount } from "@/lib/copilot-today-business-pulse";
import type { HoyCashPositionBlock, HoyProjection30dBlock } from "@/lib/copilot-hoy-treasury";
import type { HoyCurrentStateBlock } from "@/lib/copilot-hoy-scopes";
import type { ManualCashMovement } from "@/lib/treasury/treasury-types";
import type { TreasuryOutflowSummary } from "@/lib/treasury/treasury-scheduled-payments";

export type HoyCockpitCardId = "cash" | "payments" | "afterPayments" | "receivables";

const CARD_TITLES: Record<HoyCockpitCardId, string> = {
  cash: HOY_COCKPIT.moneyAvailable,
  payments: HOY_COCKPIT.payments,
  afterPayments: HOY_COCKPIT.afterPayments,
  receivables: HOY_COCKPIT.receivables,
};

function AmountRows({
  amounts,
  primaryClass = "text-[var(--copilot-ink)]",
  secondaryClass = "text-[var(--copilot-ink-muted)]",
}: {
  amounts: { currency: "UYU" | "USD"; formatted: string }[];
  primaryClass?: string;
  secondaryClass?: string;
}) {
  if (amounts.length === 0) {
    return <p className="text-sm text-[var(--copilot-ink-muted)]">—</p>;
  }
  const sorted = [...amounts].sort((a, b) => (a.currency === "UYU" ? -1 : 1));
  return (
    <ul className="space-y-2">
      {sorted.map((a) => {
        const line =
          a.currency === "USD"
            ? a.formatted.replace(/^USD U\$S /, "U$S ")
            : a.formatted.replace(/^UYU \$ /, "$ ");
        return (
          <li key={a.currency} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {a.currency}
            </span>
            <span
              className={`tabular-nums font-semibold ${a.currency === "UYU" ? primaryClass : secondaryClass}`}
            >
              {line}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function FootnoteLine({ footnote }: { footnote: CockpitMoneyBlock["footnote"] }) {
  const toneClass =
    footnote.tone === "danger"
      ? "text-rose-800 bg-rose-50/80"
      : footnote.tone === "warn"
        ? "text-amber-900 bg-amber-50/80"
        : "text-emerald-800 bg-emerald-50/80";
  return (
    <p className={`rounded-lg px-2.5 py-1.5 text-xs font-medium leading-snug ${toneClass}`}>
      {footnote.text}
    </p>
  );
}

function TreasuryCta({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--copilot-accent)] px-4 py-2.5 text-sm font-semibold text-white"
    >
      {label}
      <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}

function CashPanel({
  block,
  cashBlocks,
  manualMovements,
}: {
  block: CockpitMoneyBlock;
  cashBlocks: HoyCashPositionBlock[];
  manualMovements: readonly ManualCashMovement[];
}) {
  const recentManual = manualMovements
    .filter((m) => m.status === "active")
    .slice(0, 6);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
          {HOY_COCKPIT.drawerCashSummary}
        </p>
        <div className="mt-3">
          <AmountRows amounts={block.amounts} primaryClass="text-emerald-900" />
        </div>
        <div className="mt-3">
          <FootnoteLine footnote={block.footnote} />
        </div>
      </div>

      {cashBlocks.length > 0 ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Composición
          </p>
          <div className="mt-2 space-y-3">
            {cashBlocks.map((b) => (
              <div
                key={b.currency}
                className="rounded-lg border border-[var(--copilot-border)]/80 bg-white/80 px-3 py-2 text-xs"
              >
                <p className="font-semibold text-[var(--copilot-ink)]">{b.currency}</p>
                <dl className="mt-1.5 space-y-1">
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--copilot-ink-muted)]">Cobrado acumulado</dt>
                    <dd className="tabular-nums font-medium">
                      {b.collectedFromClients > 0
                        ? fmtCurrencyAmount(b.collectedFromClients, b.currency)
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--copilot-ink-muted)]">Ingresos manuales</dt>
                    <dd className="tabular-nums font-medium text-emerald-800">
                      {fmtCurrencyAmount(b.manualIncome, b.currency)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--copilot-ink-muted)]">Egresos manuales</dt>
                    <dd className="tabular-nums font-medium text-rose-800">
                      {fmtCurrencyAmount(b.manualExpense, b.currency)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-dashed border-[var(--copilot-border)] pt-1">
                    <dt className="font-medium text-[var(--copilot-ink)]">Disponible</dt>
                    <dd className="tabular-nums font-semibold">
                      {fmtCurrencyAmount(b.availableCash, b.currency)}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {recentManual.length > 0 ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Registros manuales recientes
          </p>
          <ul className="mt-2 space-y-1.5">
            {recentManual.map((m) => (
              <li
                key={m.id}
                className="flex items-baseline justify-between gap-2 rounded-md bg-white/70 px-2 py-1 text-xs"
              >
                <span className="min-w-0 truncate text-[var(--copilot-ink)]">{m.concept}</span>
                <span className="shrink-0 tabular-nums font-medium">
                  {fmtCurrencyAmount(m.amount, m.currencyCode)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PaymentsPanel({
  block,
  summaries,
}: {
  block: CockpitMoneyBlock;
  summaries: TreasuryOutflowSummary[] | undefined;
}) {
  const withItems = (summaries ?? []).filter((s) => s.itemsCount > 0);

  return (
    <div className="space-y-5">
      <div>
        <AmountRows amounts={block.amounts} primaryClass="text-rose-900" />
        <div className="mt-3">
          <FootnoteLine footnote={block.footnote} />
        </div>
      </div>

      {withItems.length > 0 ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Por categoría (próx. 30 días)
          </p>
          <div className="mt-2 space-y-3">
            {withItems.map((s) => (
              <div
                key={s.currency}
                className="rounded-lg border border-[var(--copilot-border)]/80 bg-white/80 px-3 py-2 text-xs"
              >
                <p className="font-semibold text-[var(--copilot-ink)]">{s.currency}</p>
                <ul className="mt-1.5 space-y-1">
                  {s.byCategory
                    .filter((c) => c.amount > 0)
                    .map((c) => (
                      <li key={c.category} className="flex justify-between gap-2">
                        <span className="text-[var(--copilot-ink-muted)]">{c.category}</span>
                        <span className="tabular-nums font-medium">
                          {fmtCurrencyAmount(c.amount, s.currency)}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
          {HOY_COCKPIT.drawerPaymentsEmpty}
        </p>
      )}
    </div>
  );
}

function ProjectionLine({
  label,
  value,
  currency,
}: {
  label: string;
  value: number;
  currency: "UYU" | "USD";
}) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-[var(--copilot-ink-muted)]">{label}</span>
      <span className="tabular-nums font-medium">{fmtCurrencyAmount(value, currency)}</span>
    </div>
  );
}

function AfterPaymentsPanel({
  block,
  projectionBlocks,
  currentStateBlocks,
}: {
  block: CockpitMoneyBlock;
  projectionBlocks: HoyProjection30dBlock[];
  currentStateBlocks: HoyCurrentStateBlock[];
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
          {HOY_COCKPIT.drawerAfterPaymentsSummary}
        </p>
        <div className="mt-3">
          <AmountRows
            amounts={block.amounts}
            primaryClass="text-[var(--copilot-ink)]"
          />
        </div>
        <div className="mt-3">
          <FootnoteLine footnote={block.footnote} />
        </div>
      </div>

      {projectionBlocks.length > 0 ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Detalle por moneda
          </p>
          <div className="mt-2 space-y-3">
            {projectionBlocks.map((p) => {
              const cur = currentStateBlocks.find((b) => b.currency === p.currency);
              return (
                <div
                  key={p.currency}
                  className="rounded-lg border border-[var(--copilot-border)]/80 bg-white/80 px-3 py-2"
                >
                  <p className="text-xs font-semibold text-[var(--copilot-ink)]">{p.currency}</p>
                  <div className="mt-1.5 space-y-1">
                    <ProjectionLine
                      label="Caja disponible"
                      value={cur?.cashAvailable ?? p.currentCash}
                      currency={p.currency}
                    />
                    <ProjectionLine
                      label="Pagos programados"
                      value={p.scheduledPayments}
                      currency={p.currency}
                    />
                    <ProjectionLine
                      label="Después de pagos"
                      value={p.safeCash30d}
                      currency={p.currency}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReceivablesPanel({
  card,
  topClients,
}: {
  card: CockpitReceivablesCard;
  topClients: DebtorCollectionRow[];
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-800">
          {HOY_COCKPIT.receivablesTotalPending}
        </p>
        <div className="mt-1.5">
          <AmountRows amounts={card.totalPending} primaryClass="text-amber-900" />
        </div>
      </div>

      <div className="border-t border-amber-200/45 pt-3">
        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-rose-700/75">
          {HOY_COCKPIT.receivablesIncludedInTotal}
        </p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-rose-700/90">
          {HOY_COCKPIT.receivablesOverdue30}
        </p>
        <div className="mt-1.5">
          <AmountRows
            amounts={card.overdue30}
            primaryClass="text-rose-800"
            secondaryClass="text-rose-700/80"
          />
        </div>
        <p className="mt-2 text-[11px] leading-snug text-rose-700/70">
          {HOY_COCKPIT.receivablesOverdue30Hint}
        </p>
      </div>

      {topClients.length > 0 ? (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Principales en seguimiento
          </p>
          <div className="mt-3 space-y-4">
            {groupDebtorRowsByCurrency(topClients).map((group) => {
              const sectionTitle =
                group.currency === "UYU"
                  ? HOY_COCKPIT.drawerClientsUyu
                  : HOY_COCKPIT.drawerClientsUsd;
              const amountClass =
                group.currency === "UYU" ? "text-amber-900" : "text-amber-800/90";
              return (
                <div key={group.currency}>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-amber-900/80">
                    {sectionTitle}
                  </p>
                  <ul className="mt-1.5 space-y-1.5">
                    {group.rows.map((row) => (
                      <li
                        key={row.row_id}
                        className="flex items-baseline justify-between gap-2 rounded-md bg-white/70 px-2 py-1.5 text-xs"
                      >
                        <span className="min-w-0 font-medium text-[var(--copilot-ink)]">
                          {row.name}
                        </span>
                        <span className={`shrink-0 tabular-nums font-medium ${amountClass}`}>
                          {formatMoneySymbolOnly(row.deuda)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function HoyCockpitCardDrawer({
  cardId,
  cockpit,
  cashPositionBlocks,
  projectionBlocks,
  currentStateBlocks,
  treasurySummaries,
  manualMovements,
  topCriticalClients,
  onClose,
  onScrollToCriticalClients,
}: {
  cardId: HoyCockpitCardId;
  cockpit: CockpitView;
  cashPositionBlocks: HoyCashPositionBlock[];
  projectionBlocks: HoyProjection30dBlock[];
  currentStateBlocks: HoyCurrentStateBlock[];
  treasurySummaries?: TreasuryOutflowSummary[];
  manualMovements: readonly ManualCashMovement[];
  topCriticalClients: DebtorCollectionRow[];
  onClose: () => void;
  onScrollToCriticalClients: () => void;
}) {
  const title = CARD_TITLES[cardId];

  let footer: ReactNode = null;
  if (cardId === "cash" || cardId === "payments") {
    footer = (
      <TreasuryCta href="/copilot/tesoreria" label={HOY_COCKPIT.drawerViewTreasury} />
    );
  } else if (cardId === "afterPayments") {
    footer = (
      <TreasuryCta href="/copilot/tesoreria" label={HOY_COCKPIT.drawerViewProjection} />
    );
  } else if (cardId === "receivables") {
    footer = (
      <button
        type="button"
        onClick={onScrollToCriticalClients}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-950 hover:bg-amber-100/80"
      >
        {HOY_COCKPIT.drawerGoToCriticalClients}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </button>
    );
  }

  return (
    <HoyDrawer title={title} onClose={onClose} footer={footer}>
      {cardId === "cash" ? (
        <CashPanel
          block={cockpit.moneyAvailable}
          cashBlocks={cashPositionBlocks}
          manualMovements={manualMovements}
        />
      ) : null}
      {cardId === "payments" ? (
        <PaymentsPanel block={cockpit.payments} summaries={treasurySummaries} />
      ) : null}
      {cardId === "afterPayments" ? (
        <AfterPaymentsPanel
          block={cockpit.afterPayments}
          projectionBlocks={projectionBlocks}
          currentStateBlocks={currentStateBlocks}
        />
      ) : null}
      {cardId === "receivables" ? (
        <ReceivablesPanel card={cockpit.receivables} topClients={topCriticalClients} />
      ) : null}
    </HoyDrawer>
  );
}
