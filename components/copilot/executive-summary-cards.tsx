"use client";

/**
 * ExecutiveSummaryCards
 * ---------------------
 * 7 KPIs ejecutivos para el centro de Cartera. Render-only:
 *  - Toma sólo `report.currencies`, `report.metrics`, `report.staleSummary`,
 *    `report.orphanSummary`, `report.syncStates` (estos últimos sólo para
 *    timestamps relativos en cada card).
 *  - Animación stagger sutil al primer mount (respeta reduced-motion).
 *  - Tipografía tabular-nums, badges de fuente (Zeta ✓ / Analytics / Recon).
 *  - Sin cálculos financieros: solo deriva ratios o lee subtotales del backend.
 */

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  CircleCheckBig,
  CircleDollarSign,
  Database,
  FileText,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { CarteraCountUp } from "@/components/copilot/cartera-count-up";
import {
  currencyShortLabelFor,
  deriveCollectionEffectiveness,
  formatCarteraInteger,
  formatCarteraMoney,
  formatCarteraPercent,
  formatRelativeAgeHours,
  pickMostRecentSync,
} from "@/lib/copilot-cartera-format";
import type {
  CurrencyReconciliation,
  FinancialConsistencyReport,
  ReconciliationCurrencyCode,
} from "@/lib/copilot-financial-reconciliation";

// ---------------------------------------------------------------------------
// Tipos de card y badges
// ---------------------------------------------------------------------------

type SourceBadge = "zeta" | "analytics" | "recon";

type CardTone = "neutral" | "info" | "positive" | "warning";

type SummaryCard = {
  id: string;
  title: string;
  source: SourceBadge;
  tone: CardTone;
  icon: LucideIcon;
  /** Valor numérico para count-up. */
  value: number;
  /** Función de formato del número principal. */
  format: (n: number) => string;
  /** Texto secundario (debajo del valor principal). */
  subtitle: string;
  /** Texto auxiliar terciario (tipo "hace 2h"). */
  meta?: string;
};

// ---------------------------------------------------------------------------
// Builders pure → cards
// ---------------------------------------------------------------------------

function findCurrency(
  report: FinancialConsistencyReport,
  code: ReconciliationCurrencyCode
): CurrencyReconciliation | undefined {
  return report.currencies.find((c) => c.currencyCode === code);
}

function carteraCard(
  code: ReconciliationCurrencyCode,
  report: FinancialConsistencyReport,
  zetaAge: string
): SummaryCard {
  const currency = findCurrency(report, code);
  const pendingAmount = currency?.totalPending ?? 0;
  const pendingCount = currency?.pendingInvoiceCount ?? 0;
  return {
    id: `cartera-${code}`,
    title: `Cartera ${code}`,
    source: "zeta",
    tone: pendingCount > 0 ? "warning" : "positive",
    icon: CircleDollarSign,
    value: pendingAmount,
    format: (n) => formatCarteraMoney(code, n),
    subtitle:
      pendingCount === 0
        ? "Sin facturas con saldo abierto"
        : `${formatCarteraInteger(pendingCount)} factura${pendingCount === 1 ? "" : "s"} pendiente${pendingCount === 1 ? "" : "s"}`,
    meta: zetaAge,
  };
}

function facturadoCard(
  code: ReconciliationCurrencyCode,
  report: FinancialConsistencyReport,
  zetaAge: string
): SummaryCard {
  const currency = findCurrency(report, code);
  const totalInvoiced = currency?.totalInvoiced ?? 0;
  const invoiceCount = currency?.invoiceCount ?? 0;
  return {
    id: `facturado-${code}`,
    title: `Facturado ${code}`,
    source: "zeta",
    tone: "neutral",
    icon: FileText,
    value: totalInvoiced,
    format: (n) => formatCarteraMoney(code, n),
    subtitle:
      invoiceCount === 0
        ? "Sin facturas en período"
        : `${formatCarteraInteger(invoiceCount)} factura${invoiceCount === 1 ? "" : "s"} ${currencyShortLabelFor(code).toLowerCase()}`,
    meta: zetaAge,
  };
}

function effectivenessCard(
  code: ReconciliationCurrencyCode,
  report: FinancialConsistencyReport
): SummaryCard {
  const currency = findCurrency(report, code);
  const ratio = currency
    ? deriveCollectionEffectiveness({
        totalInvoiced: currency.totalInvoiced,
        totalPending: currency.totalPending,
      })
    : null;

  const invoiceCount = currency?.invoiceCount ?? 0;

  return {
    id: `effectiveness-${code}`,
    title: `Efectividad ${code}`,
    source: "analytics",
    tone: ratio !== null && ratio < 0.8 ? "warning" : "info",
    icon: TrendingUp,
    value: ratio !== null ? ratio * 100 : 0,
    format: (n) =>
      ratio === null
        ? "—"
        : `${n.toLocaleString("es-UY", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}%`,
    subtitle:
      invoiceCount === 0
        ? `Sin facturas ${code} en período`
        : `${formatCarteraInteger(invoiceCount)} factura${invoiceCount === 1 ? "" : "s"} ${code}`,
    meta: ratio !== null ? "Cobrado / facturado (sin mezcla de monedas)" : undefined,
  };
}

function staleCard(report: FinancialConsistencyReport): SummaryCard {
  const s = report.staleSummary;
  const total = s.warning + s.critical + s.never_synced;
  const breakdown: string[] = [];
  if (s.warning > 0) breakdown.push(`${s.warning} warning`);
  if (s.critical > 0) breakdown.push(`${s.critical} critical`);
  if (s.never_synced > 0) breakdown.push(`${s.never_synced} sin sync`);
  return {
    id: "stale",
    title: "Clientes en riesgo",
    source: "recon",
    tone: total === 0 ? "positive" : s.critical > 0 || s.never_synced > 0 ? "warning" : "info",
    icon: ShieldAlert,
    value: total,
    format: (n) => formatCarteraInteger(n),
    subtitle:
      total === 0
        ? `${formatCarteraInteger(s.ok)} clientes al día`
        : breakdown.join(" · "),
    meta:
      report.metrics.stale_ratio !== null
        ? `${formatCarteraPercent(report.metrics.stale_ratio)} del total`
        : undefined,
  };
}

function orphanCard(report: FinancialConsistencyReport): SummaryCard {
  const o = report.orphanSummary;
  return {
    id: "orphans",
    title: "Orphan warnings",
    source: "recon",
    tone: o.warned === 0 ? "positive" : o.pending_auto_close > 0 ? "warning" : "info",
    icon: AlertTriangle,
    value: o.warned,
    format: (n) => formatCarteraInteger(n),
    subtitle:
      o.warned === 0
        ? "Sin facturas huérfanas detectadas"
        : `${formatCarteraInteger(o.warned)} con warning${o.warned === 1 ? "" : "s"}`,
    meta:
      o.pending_auto_close > 0
        ? `${formatCarteraInteger(o.pending_auto_close)} pendiente${o.pending_auto_close === 1 ? "" : "s"} de cierre`
        : "Cleanup al día",
  };
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function ExecutiveSummaryCards({
  report,
}: {
  report: FinancialConsistencyReport;
}) {
  const reduce = useReducedMotion();

  const cards = useMemo<SummaryCard[]>(() => {
    const recent = pickMostRecentSync(report.syncStates);
    const zetaAge = recent ? formatRelativeAgeHours(recent.ageHours) : "sin sync";
    return [
      carteraCard("UYU", report, zetaAge),
      carteraCard("USD", report, zetaAge),
      facturadoCard("UYU", report, zetaAge),
      facturadoCard("USD", report, zetaAge),
      effectivenessCard("UYU", report),
      effectivenessCard("USD", report),
      staleCard(report),
      orphanCard(report),
    ];
  }, [report]);

  return (
    <motion.section
      aria-label="Resumen ejecutivo"
      className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4"
      initial={reduce ? false : "hidden"}
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
      }}
    >
      {cards.map((card) => (
        <SummaryCardView key={card.id} card={card} />
      ))}
    </motion.section>
  );
}

// ---------------------------------------------------------------------------
// Card view
// ---------------------------------------------------------------------------

const TONE_VALUE_CLASS: Record<CardTone, string> = {
  neutral: "text-[var(--copilot-ink)]",
  info: "text-[var(--copilot-ink)]",
  positive: "text-emerald-800",
  warning: "text-amber-900",
};

const TONE_ICON_CLASS: Record<CardTone, string> = {
  neutral: "bg-[rgba(44,40,37,0.06)] text-[var(--copilot-ink)]",
  info: "bg-sky-50 text-sky-700",
  positive: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-800",
};

function SummaryCardView({ card }: { card: SummaryCard }) {
  const Icon = card.icon;
  return (
    <motion.article
      variants={{
        hidden: { opacity: 0, y: 8 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: "easeOut" } },
      }}
      className="group relative flex flex-col justify-between rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] p-5 shadow-[var(--copilot-shadow)] transition hover:shadow-md"
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONE_ICON_CLASS[card.tone]}`}
            aria-hidden
          >
            <Icon className="h-4 w-4" />
          </span>
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--copilot-ink-muted)]">
            {card.title}
          </p>
        </div>
        <SourceBadgeView source={card.source} />
      </header>

      <div className="space-y-1.5">
        <p
          className={`text-2xl font-semibold leading-tight tabular-nums ${TONE_VALUE_CLASS[card.tone]}`}
        >
          <CarteraCountUp value={card.value} format={card.format} />
        </p>
        <p className="text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
          {card.subtitle}
        </p>
        {card.meta ? (
          <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--copilot-ink-muted)]/80">
            {card.meta}
          </p>
        ) : null}
      </div>
    </motion.article>
  );
}

const SOURCE_LABEL: Record<SourceBadge, string> = {
  zeta: "Zeta",
  analytics: "Analytics",
  recon: "Recon",
};

const SOURCE_CLASS: Record<SourceBadge, string> = {
  zeta:
    "border border-emerald-200/70 bg-emerald-50/70 text-emerald-800",
  analytics:
    "border border-[var(--copilot-border)] bg-white/70 text-[var(--copilot-ink-muted)]",
  recon:
    "border border-amber-200/70 bg-amber-50/60 text-amber-800",
};

function SourceBadgeView({ source }: { source: SourceBadge }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${SOURCE_CLASS[source]}`}
      title={`Fuente: ${SOURCE_LABEL[source]}`}
    >
      {source === "zeta" ? <CircleCheckBig className="h-3 w-3" aria-hidden /> : null}
      {source === "analytics" ? <Database className="h-3 w-3" aria-hidden /> : null}
      {source === "recon" ? <ShieldAlert className="h-3 w-3" aria-hidden /> : null}
      {SOURCE_LABEL[source]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export function ExecutiveSummaryCardsSkeleton({ count = 7 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4"
      aria-hidden
      role="presentation"
    >
      {Array.from({ length: count }).map((_, i) => (
        <SummarySkeletonCard key={i} index={i} />
      ))}
    </div>
  );
}

function SummarySkeletonCard({ index }: { index: number }) {
  const reduce = useReducedMotion();
  const delay = reduce ? 0 : index * 0.04;
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut", delay }}
      className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)]/85 p-5 shadow-[var(--copilot-shadow)]"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-[rgba(44,40,37,0.06)]" />
          <div className="h-2.5 w-24 rounded-full bg-[rgba(44,40,37,0.08)]" />
        </div>
        <div className="h-4 w-16 rounded-full bg-[rgba(44,40,37,0.06)]" />
      </div>
      <div className="space-y-2">
        <ShimmerBar className="h-7 w-32" />
        <ShimmerBar className="h-3 w-44" />
        <ShimmerBar className="h-2.5 w-24" />
      </div>
    </motion.div>
  );
}

function ShimmerBar({ className = "" }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className={`relative overflow-hidden rounded-md bg-[rgba(44,40,37,0.06)] ${className}`}>
      {reduce ? null : (
        <motion.div
          className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/55 to-transparent"
          animate={{ x: ["-100%", "100%"] }}
          transition={{
            duration: 1.4,
            ease: "linear",
            repeat: Infinity,
          }}
        />
      )}
    </div>
  );
}
