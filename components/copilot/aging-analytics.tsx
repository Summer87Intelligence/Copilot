"use client";

/**
 * AgingAnalytics
 * --------------
 * Distribución OPERATIVA de la deuda viva por días de atraso (due_date).
 * FASE 1C: consume `operatingAging` (buckets Al día / 1–7 / 8–14 / 15–30 / +30)
 * derivado del snapshot canónico. Render-only, no recalcula nada.
 *
 * Los buckets contables históricos del reporte de reconciliación NO se muestran
 * acá: son para reconciliación/auditoría interna.
 */

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { TrendingDown } from "lucide-react";

import {
  formatCarteraMoney,
  formatCarteraInteger,
} from "@/lib/copilot-cartera-format";
import { useDisplayCurrency } from "@/components/copilot/display-currency-provider";
import { convertToUsdEquivalent, formatUsdEquivalent } from "@/lib/currency-display-mode";
import type { ReconciliationCurrencyCode } from "@/lib/copilot-financial-reconciliation";
import type {
  CarteraOperatingAging,
  CarteraOperatingAgingBucketRow,
} from "@/lib/copilot/cartera-operating-aging";
import type { OperatingDelayBucket } from "@/lib/copilot/operating-aging";
import type { CurrencyFilter } from "@/components/copilot/financial-control-bar";

// ---------------------------------------------------------------------------
// Config de buckets operativos
// ---------------------------------------------------------------------------

const BUCKET_CONFIG: Record<
  OperatingDelayBucket,
  { label: string; bar: string; dot: string; text: string; badge: string }
> = {
  on_time: {
    label: "Al día",
    bar: "bg-[var(--copilot-success-text)]",
    dot: "bg-[var(--copilot-success-text)]",
    text: "text-[var(--copilot-success-text-strong)]",
    badge: "border-[var(--copilot-success-border)]/60 text-[var(--copilot-success-text-strong)]",
  },
  late_1_7: {
    label: "1–7 días de atraso",
    bar: "bg-[var(--copilot-warning-text)]",
    dot: "bg-[var(--copilot-warning-text)]",
    text: "text-[var(--copilot-warning-text-strong)]",
    badge: "border-[var(--copilot-warning-border)]/60 text-[var(--copilot-warning-text-strong)]",
  },
  late_8_14: {
    label: "8–14 días de atraso",
    bar: "bg-orange-400",
    dot: "bg-orange-400",
    text: "text-orange-600 dark:text-orange-400",
    badge: "border-orange-300/50 text-orange-700 dark:text-orange-400",
  },
  late_15_30: {
    label: "15–30 días de atraso",
    bar: "bg-orange-500",
    dot: "bg-orange-500",
    text: "text-orange-700 dark:text-orange-400",
    badge: "border-orange-400/50 text-orange-700 dark:text-orange-400",
  },
  late_30_plus: {
    label: "+30 días de atraso",
    bar: "bg-[var(--copilot-danger-text)]",
    dot: "bg-[var(--copilot-danger-text)]",
    text: "text-[var(--copilot-danger-text-strong)]",
    badge: "border-[var(--copilot-danger-border)]/60 text-[var(--copilot-danger-text-strong)]",
  },
};

const CURRENCY_ORDER: ReconciliationCurrencyCode[] = ["UYU", "USD"];

function formatCurrencyPending(agg: CarteraOperatingAging | null | undefined) {
  const map = new Map<ReconciliationCurrencyCode, {
    buckets: CarteraOperatingAgingBucketRow[];
    unclassified: number;
    pending: number;
  }>();
  for (const c of agg?.byCurrency ?? []) {
    map.set(c.currency, {
      buckets: c.buckets,
      unclassified: c.unclassifiedDueDateBalance,
      pending: c.pendingBalance,
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function AgingAnalytics({
  operatingAging,
  selectedCurrency = "all",
  compact = false,
}: {
  operatingAging: CarteraOperatingAging | null;
  selectedCurrency?: CurrencyFilter;
  /** Oculta header grande cuando el padre ya muestra título de sección. */
  compact?: boolean;
}) {
  const byCurrency = formatCurrencyPending(operatingAging);
  const availableCurrencies = CURRENCY_ORDER.filter((c) => (byCurrency.get(c)?.pending ?? 0) > 0);

  const forcedCurrency: ReconciliationCurrencyCode | null =
    selectedCurrency === "USD" || selectedCurrency === "UYU" ? selectedCurrency : null;

  const [internalCurrency, setInternalCurrency] = useState<ReconciliationCurrencyCode>(
    forcedCurrency ?? availableCurrencies[0] ?? "UYU"
  );

  const activeCurrency = forcedCurrency ?? internalCurrency;
  const active = byCurrency.get(activeCurrency);
  const buckets = active?.buckets ?? [];
  const hasData = buckets.some((b) => b.amount > 0);
  const unclassified = active?.unclassified ?? 0;
  const showTabs = !forcedCurrency && availableCurrencies.length > 1;

  return (
    <section
      aria-label="Antigüedad de cartera por días de atraso"
      className={`rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] shadow-sm ${compact ? "" : "rounded-2xl shadow-[var(--copilot-shadow)]"}`}
    >
      {!compact ? (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--copilot-border)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[rgba(44,40,37,0.06)]">
              <TrendingDown className="h-4 w-4 text-[var(--copilot-ink)]" aria-hidden />
            </span>
            <div>
              <h3 className="text-base font-semibold tracking-tight text-[var(--copilot-ink)]">
                Cartera por días de atraso
              </h3>
              <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">
                Deuda viva por días de atraso · estado actual, no limitado al rango seleccionado
              </p>
            </div>
          </div>

          {showTabs ? (
            <CurrencyTabs
              currencies={availableCurrencies}
              active={activeCurrency}
              onChange={setInternalCurrency}
              size="lg"
            />
          ) : forcedCurrency ? (
            <span
              className="inline-flex h-8 items-center rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-3 text-xs font-semibold text-[var(--copilot-ink)] shadow-sm"
              aria-label={`Moneda activa ${forcedCurrency}`}
            >
              {forcedCurrency}
            </span>
          ) : null}
        </header>
      ) : showTabs ? (
        <div className="flex justify-end border-b border-[var(--copilot-border)] px-3 py-2">
          <CurrencyTabs
            currencies={availableCurrencies}
            active={activeCurrency}
            onChange={setInternalCurrency}
            size="sm"
          />
        </div>
      ) : null}

      <div className={compact ? "p-3" : "p-5"}>
        {!hasData ? (
          <p className="py-4 text-center text-sm text-[var(--copilot-ink-muted)]">
            Sin facturas pendientes para {activeCurrency}.
          </p>
        ) : (
          <BucketsView key={activeCurrency} buckets={buckets} currency={activeCurrency} />
        )}

        {unclassified > 0 ? (
          <p className="mt-3 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/60 px-3 py-2 text-[11px] leading-snug text-[var(--copilot-ink-muted)]">
            Hay saldo pendiente sin una fecha de vencimiento válida y no puede clasificarse por
            días de atraso ({formatCarteraMoney(activeCurrency, unclassified, { fractionDigits: 0 })}).
          </p>
        ) : null}
      </div>
    </section>
  );
}

function CurrencyTabs({
  currencies,
  active,
  onChange,
  size,
}: {
  currencies: ReconciliationCurrencyCode[];
  active: ReconciliationCurrencyCode;
  onChange: (c: ReconciliationCurrencyCode) => void;
  size: "sm" | "lg";
}) {
  const lg = size === "lg";
  return (
    <div
      role="tablist"
      aria-label="Moneda"
      className={[
        "inline-flex items-center border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-0.5",
        lg ? "rounded-xl shadow-sm" : "rounded-lg",
      ].join(" ")}
    >
      {currencies.map((c) => {
        const isActive = c === active;
        return (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(c)}
            className={[
              lg ? "h-8 rounded-lg px-3 text-xs" : "h-7 rounded-md px-2.5 text-[10px]",
              "font-semibold transition",
              isActive
                ? "bg-[var(--copilot-accent)] text-[var(--copilot-on-accent)] shadow"
                : "text-[var(--copilot-ink-muted)] hover:text-[var(--copilot-ink)]",
            ].join(" ")}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vista de buckets (key=activeCurrency → remount al cambiar tab → re-anima)
// ---------------------------------------------------------------------------

function BucketsView({
  buckets,
  currency,
}: {
  buckets: CarteraOperatingAgingBucketRow[];
  currency: ReconciliationCurrencyCode;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className="space-y-3"
      initial={reduce ? false : "hidden"}
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
      }}
    >
      {buckets.map((bucket) => (
        <BucketRow key={bucket.bucket} bucket={bucket} currency={currency} reduce={!!reduce} />
      ))}
    </motion.div>
  );
}

function BucketRow({
  bucket,
  currency,
  reduce,
}: {
  bucket: CarteraOperatingAgingBucketRow;
  currency: ReconciliationCurrencyCode;
  reduce: boolean;
}) {
  const { mode, fxRate } = useDisplayCurrency();
  const isUsd = mode === "usd_equivalent";
  const cfg = BUCKET_CONFIG[bucket.bucket];
  const pct = Math.max(0, Math.min(1, bucket.percentage));
  const pctLabel = `${(pct * 100).toLocaleString("es-UY", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 6 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" } },
      }}
      className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80 p-3.5"
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--copilot-ink)]">
          <span className={`h-2 w-2 shrink-0 rounded-full ${cfg.dot}`} aria-hidden />
          {cfg.label}
        </span>
        <span
          className={`inline-flex items-center rounded-md border bg-transparent px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${cfg.badge}`}
        >
          {pctLabel}
        </span>
      </div>

      <div
        className="mb-3 h-2.5 w-full overflow-hidden rounded-full bg-[rgba(44,40,37,0.08)]"
        role="meter"
        aria-valuenow={Math.round(pct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${cfg.label} ${pctLabel}`}
      >
        <motion.div
          className={`h-full rounded-full ${cfg.bar}`}
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${pct * 100}%` }}
          transition={reduce ? undefined : { duration: 0.75, ease: [0.25, 0.1, 0.25, 1] }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] tabular-nums text-[var(--copilot-ink-muted)]">
        <span className={`font-semibold ${cfg.text}`}>
          {isUsd
            ? formatUsdEquivalent(
                convertToUsdEquivalent(
                  {
                    uyu: currency === "UYU" ? bucket.amount : 0,
                    usd: currency === "USD" ? bucket.amount : 0,
                  },
                  fxRate
                )
              )
            : formatCarteraMoney(currency, bucket.amount, { fractionDigits: 0 })}
        </span>
        <span>{formatCarteraInteger(bucket.invoiceCount)} fact.</span>
        <span>{formatCarteraInteger(bucket.clientCount)} clientes</span>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function AgingAnalyticsSkeleton() {
  const reduce = useReducedMotion();
  return (
    <div
      className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)]/85 shadow-[var(--copilot-shadow)]"
      aria-hidden
      role="presentation"
    >
      <header className="flex items-center justify-between gap-3 border-b border-[var(--copilot-border)] px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-[rgba(44,40,37,0.06)]" />
          <div className="space-y-1.5">
            <SkBar className="h-3 w-32" reduce={!!reduce} />
            <SkBar className="h-2.5 w-52" reduce={!!reduce} />
          </div>
        </div>
        <SkBar className="h-8 w-24 rounded-xl" reduce={!!reduce} />
      </header>
      <div className="space-y-3 p-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/55 p-3.5"
          >
            <div className="mb-2.5 flex items-center justify-between">
              <SkBar className="h-2.5 w-20" reduce={!!reduce} />
              <SkBar className="h-4 w-12 rounded-md" reduce={!!reduce} />
            </div>
            <SkBar className="mb-3 h-2.5 w-full rounded-full" reduce={!!reduce} />
            <div className="flex gap-4">
              <SkBar className="h-3 w-24" reduce={!!reduce} />
              <SkBar className="h-3 w-16" reduce={!!reduce} />
              <SkBar className="h-3 w-20" reduce={!!reduce} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SkBar({ className = "", reduce }: { className?: string; reduce: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-md bg-[rgba(44,40,37,0.06)] ${className}`}>
      {reduce ? null : (
        <motion.div
          className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/55 to-transparent"
          animate={{ x: ["-100%", "100%"] }}
          transition={{ duration: 1.4, ease: "linear", repeat: Infinity }}
        />
      )}
    </div>
  );
}
