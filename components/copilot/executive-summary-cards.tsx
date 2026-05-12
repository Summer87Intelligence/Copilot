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
  formatCarteraInteger,
  formatCarteraMoney,
  formatCarteraPercent,
  formatRelativeAgeHours,
  pickMostRecentSync,
} from "@/lib/copilot-cartera-format";
import type {
  FinancialConsistencyReport,
  ReconciliationCurrencyCode,
} from "@/lib/copilot-financial-reconciliation";
import type { CurrencyFilter } from "@/components/copilot/financial-control-bar";
import {
  buildCurrencyIndex,
  type NormalizedCurrencyMetrics,
} from "@/lib/copilot-cartera-cards-source";

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

// ---------------------------------------------------------------------------
// Métricas por moneda para cards — fuente canónica única: report.currencies
// ---------------------------------------------------------------------------
//
// Contrato contable (replica de Zeta):
//   - issuedInPeriod   → ventas emitidas dentro de [Desde, Hasta]
//                       (Zeta: Ventas Detalladas)
//   - pendingAtCutoff  → saldo pendiente AL CORTE = pendingAtCutoff del motor
//                       (Zeta: Comprobantes Pendientes con fecha de corte)
//                       INCLUYE facturas pre-Desde con balance > 0
//   - collectedInPeriod→ recibos sincronizados con receipt_date en [Desde, Hasta]
//                       (Zeta: columna Haber del Estado de Cuenta)
//   - openingBalance   → saldo anterior al Desde (ledger pre-período)
//                       (Zeta: Saldo anterior del Estado de Cuenta)
//
// Reglas:
//   - Las cards leen EXCLUSIVAMENTE `report.currencies[code]` (vía
//     `buildCurrencyIndex`). No hay rederivación desde `agingByCurrency` ni
//     `staleClients`: cualquier drift entre el valor principal y el microcopy
//     siempre fue un fallback que mezclaba fuentes. Si el bucket no existe,
//     todo queda en 0 y el banner dev de inconsistencia (más abajo) flagea
//     el motor mal poblado.
//   - Cobranza efectiva = collectedInPeriod / issuedInPeriod (no mezcla saldo
//     anterior con cobros del período).
//   - Si el motor no recibió receipts, `collectedReceiptCount=0` y la card
//     "Cobrado en período" muestra "—".
type CurrencyCardMetrics = {
  issuedInPeriod: number;
  pendingAtCutoff: number;
  pendingInvoiceCount: number;
  collectedInPeriod: number;
  collectedReceiptCount: number;
  openingBalance: number;
  collectionEffectiveness: number | null;
  invoiceCount: number;
  /** true cuando el motor no recibió receipts (cobrado período no se puede mostrar). */
  collectedDataMissing: boolean;
};

function getCurrencyCardMetrics(
  index: Map<ReconciliationCurrencyCode, NormalizedCurrencyMetrics>,
  code: ReconciliationCurrencyCode
): CurrencyCardMetrics {
  const direct = index.get(code);

  if (direct) {
    return {
      issuedInPeriod: direct.issuedInPeriod,
      pendingAtCutoff: direct.pendingAtCutoff,
      pendingInvoiceCount: direct.pendingInvoiceCount,
      collectedInPeriod: direct.collectedInPeriod,
      collectedReceiptCount: direct.collectedReceiptCount,
      openingBalance: direct.openingBalance,
      collectionEffectiveness: direct.collectionEffectiveness,
      invoiceCount: direct.invoiceCount,
      collectedDataMissing: direct.collectedReceiptCount === 0,
    };
  }

  // Bucket ausente en `report.currencies`: las cards muestran 0 / "—".
  // NO derivamos desde aging/stale para evitar drift entre el valor
  // principal y el microcopy. El banner dev arriba flagea este caso.
  return {
    issuedInPeriod: 0,
    pendingAtCutoff: 0,
    pendingInvoiceCount: 0,
    collectedInPeriod: 0,
    collectedReceiptCount: 0,
    openingBalance: 0,
    collectionEffectiveness: null,
    invoiceCount: 0,
    collectedDataMissing: true,
  };
}

function pendingCollectionCard(
  code: ReconciliationCurrencyCode,
  index: Map<ReconciliationCurrencyCode, NormalizedCurrencyMetrics>,
  zetaAge: string
): SummaryCard {
  const m = getCurrencyCardMetrics(index, code);
  return {
    id: `cartera-${code}`,
    title: `Pendiente de cobro al corte ${code}`,
    source: "zeta",
    tone: m.pendingInvoiceCount > 0 ? "warning" : "positive",
    icon: CircleDollarSign,
    value: m.pendingAtCutoff,
    format: (n) => formatCarteraMoney(code, n),
    subtitle:
      m.pendingInvoiceCount === 0
        ? "Sin facturas con saldo abierto al Hasta"
        : `${formatCarteraInteger(m.pendingInvoiceCount)} factura${m.pendingInvoiceCount === 1 ? "" : "s"} con saldo al corte`,
    meta: zetaAge,
  };
}

function issuedCard(
  code: ReconciliationCurrencyCode,
  index: Map<ReconciliationCurrencyCode, NormalizedCurrencyMetrics>,
  zetaAge: string
): SummaryCard {
  const m = getCurrencyCardMetrics(index, code);
  return {
    id: `facturado-${code}`,
    title: `Emitido en período ${code}`,
    source: "zeta",
    tone: "neutral",
    icon: FileText,
    value: m.issuedInPeriod,
    format: (n) => formatCarteraMoney(code, n),
    subtitle:
      m.invoiceCount === 0
        ? "Sin facturas emitidas en período"
        : `${formatCarteraInteger(m.invoiceCount)} factura${m.invoiceCount === 1 ? "" : "s"} ${currencyShortLabelFor(code).toLowerCase()} emitida${m.invoiceCount === 1 ? "" : "s"}`,
    meta: zetaAge,
  };
}

/**
 * Cobrado en período (receipts in-period). Si el motor no recibió receipts
 * la card muestra "—" en lugar de "$ 0" para no mentir.
 */
function collectedCard(
  code: ReconciliationCurrencyCode,
  index: Map<ReconciliationCurrencyCode, NormalizedCurrencyMetrics>,
  zetaAge: string
): SummaryCard {
  const m = getCurrencyCardMetrics(index, code);
  const dataMissing = m.collectedReceiptCount === 0 && m.collectedInPeriod === 0;
  return {
    id: `collected-${code}`,
    title: `Cobrado en período ${code}`,
    source: "zeta",
    tone: m.collectedInPeriod > 0 ? "positive" : "neutral",
    icon: CircleCheckBig,
    value: m.collectedInPeriod,
    format: (n) => (dataMissing ? "—" : formatCarteraMoney(code, n)),
    subtitle: dataMissing
      ? "Sin recibos registrados en período"
      : `${formatCarteraInteger(m.collectedReceiptCount)} recibo${m.collectedReceiptCount === 1 ? "" : "s"} ${currencyShortLabelFor(code).toLowerCase()}`,
    meta: zetaAge,
  };
}

function effectivenessCard(
  code: ReconciliationCurrencyCode,
  index: Map<ReconciliationCurrencyCode, NormalizedCurrencyMetrics>
): SummaryCard {
  const m = getCurrencyCardMetrics(index, code);
  const ratio = m.collectionEffectiveness;

  return {
    id: `effectiveness-${code}`,
    title: `Cobranza efectiva ${code}`,
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
      m.invoiceCount === 0
        ? `Sin facturas ${code} en período`
        : `${formatCarteraInteger(m.invoiceCount)} factura${m.invoiceCount === 1 ? "" : "s"} ${code}`,
    meta:
      ratio !== null
        ? `Cobrado ${formatCarteraMoney(code, m.collectedInPeriod)} / Emitido ${formatCarteraMoney(code, m.issuedInPeriod)}`
        : undefined,
  };
}

/**
 * Saldo anterior al `Desde` (ledger reconstruido). Solo se muestra cuando el
 * motor lo calculó (modo period_only) y es > 0. Permite separar visualmente
 * "deuda heredada" de "movimientos del período".
 */
function openingBalanceCard(
  code: ReconciliationCurrencyCode,
  index: Map<ReconciliationCurrencyCode, NormalizedCurrencyMetrics>
): SummaryCard {
  const m = getCurrencyCardMetrics(index, code);
  return {
    id: `opening-${code}`,
    title: `Saldo anterior ${code}`,
    source: "analytics",
    tone: "info",
    icon: FileText,
    value: m.openingBalance,
    format: (n) => formatCarteraMoney(code, n),
    subtitle: "Deuda anterior al Desde",
    meta: "Ledger: Σ facturas pre-Desde − Σ recibos pre-Desde",
  };
}

function staleCardAll(report: FinancialConsistencyReport): SummaryCard {
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

/**
 * Variante por moneda: cuenta clientes con saldo > 0 en `code` cuyo `status`
 * no es "ok". El total de clientes con deuda en la moneda se usa para mostrar
 * "X al día" cuando no hay riesgo.
 */
function staleCardForCurrency(
  code: ReconciliationCurrencyCode,
  report: FinancialConsistencyReport
): SummaryCard {
  const clientsWithDebt = report.staleClients.filter(
    (c) => (c.pendingByCurrency[code] ?? 0) > 0
  );
  const atRisk = clientsWithDebt.filter((c) => c.status !== "ok");

  const breakdown: string[] = [];
  let warning = 0;
  let critical = 0;
  let neverSynced = 0;
  for (const c of atRisk) {
    if (c.status === "warning") warning++;
    else if (c.status === "critical") critical++;
    else if (c.status === "never_synced") neverSynced++;
  }
  if (warning > 0) breakdown.push(`${warning} warning`);
  if (critical > 0) breakdown.push(`${critical} critical`);
  if (neverSynced > 0) breakdown.push(`${neverSynced} sin sync`);

  const total = atRisk.length;
  const ratio =
    clientsWithDebt.length > 0 ? total / clientsWithDebt.length : null;

  return {
    id: `stale-${code}`,
    title: `Clientes en riesgo ${code}`,
    source: "recon",
    tone:
      total === 0
        ? "positive"
        : critical > 0 || neverSynced > 0
          ? "warning"
          : "info",
    icon: ShieldAlert,
    value: total,
    format: (n) => formatCarteraInteger(n),
    subtitle:
      total === 0
        ? clientsWithDebt.length === 0
          ? `Sin clientes con saldo ${code}`
          : `${formatCarteraInteger(clientsWithDebt.length)} cliente${clientsWithDebt.length === 1 ? "" : "s"} con saldo ${code} al día`
        : breakdown.join(" · "),
    meta:
      ratio !== null
        ? `${formatCarteraPercent(ratio)} de la cartera ${code}`
        : undefined,
  };
}

function orphanCardAll(report: FinancialConsistencyReport): SummaryCard {
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
  selectedCurrency = "all",
}: {
  report: FinancialConsistencyReport;
  selectedCurrency?: CurrencyFilter;
}) {
  const reduce = useReducedMotion();

  // Normaliza `report.currencies` (array | objeto | snake_case | strings) a un
  // índice por moneda. Esto es lo ÚNICO que las cards consultan para emitido /
  // pendiente / cobrado / efectividad: una sola fuente, una sola lectura.
  const currencyIndex = useMemo(
    () => buildCurrencyIndex(report.currencies),
    [report.currencies]
  );

  // TEMP[2026-05-12]: log de auditoría con los 5 campos contables canónicos
  // que alimentan TANTO el valor principal de cada card COMO su microcopy.
  // Confirma visualmente que `report.currencies` es la única fuente. Remover
  // cuando la verdad financiera quede estable en producción.
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
    try {
      const pick = (m: NormalizedCurrencyMetrics | undefined) =>
        m
          ? {
              issuedInPeriod: m.issuedInPeriod,
              collectedInPeriod: m.collectedInPeriod,
              pendingAtCutoff: m.pendingAtCutoff,
              collectionEffectiveness: m.collectionEffectiveness,
              openingBalance: m.openingBalance,
              invoiceCount: m.invoiceCount,
              pendingInvoiceCount: m.pendingInvoiceCount,
              collectedReceiptCount: m.collectedReceiptCount,
            }
          : null;
      console.log(
        "[cards currencyMetrics]",
        JSON.stringify(
          {
            currenciesShape: Array.isArray(report.currencies)
              ? `array(${report.currencies.length})`
              : typeof report.currencies,
            USD: pick(currencyIndex.get("USD")),
            UYU: pick(currencyIndex.get("UYU")),
          },
          null,
          2
        )
      );
    } catch {
      /* noop */
    }
  }

  // Detección de inconsistencia: aging muestra deuda en una moneda pero el
  // índice normalizado no la encuentra. Es síntoma de motor mal poblado.
  // Solo log dev — las cards muestran 0 en esa moneda (sin rederivar), el
  // warn aquí indica que hay que arreglar el motor, no la UI.
  if (process.env.NODE_ENV !== "production") {
    for (const code of ["USD", "UYU"] as const) {
      const inIndex = currencyIndex.has(code);
      const inAging = (report.agingByCurrency?.[code] ?? []).some(
        (b) => b.amount > 0
      );
      if (!inIndex && inAging) {
        console.warn(
          "[ExecutiveSummaryCards] inconsistencia detectada: aging muestra " +
            code +
            " con saldo > 0 pero `report.currencies` no expone esa moneda. " +
            "Las cards mostrarán 0 en " +
            code +
            ". Revisar generateFinancialConsistencyReport()."
        );
      }
    }
  }

  const cards = useMemo<SummaryCard[]>(() => {
    const recent = pickMostRecentSync(report.syncStates);
    const zetaAge = recent ? formatRelativeAgeHours(recent.ageHours) : "sin sync";

    // Helper local: agregar "Saldo anterior" sólo cuando aplica (modo
    // period_only + opening > 0). Evita poblar la grilla con cards vacías.
    function appendOpeningIfRelevant(
      list: SummaryCard[],
      code: ReconciliationCurrencyCode
    ): SummaryCard[] {
      const m = currencyIndex.get(code);
      if (!m || m.openingBalance <= 0) return list;
      return [...list, openingBalanceCard(code, currencyIndex)];
    }

    if (selectedCurrency === "USD" || selectedCurrency === "UYU") {
      const code = selectedCurrency;
      let list: SummaryCard[] = [
        issuedCard(code, currencyIndex, zetaAge),
        collectedCard(code, currencyIndex, zetaAge),
        pendingCollectionCard(code, currencyIndex, zetaAge),
        effectivenessCard(code, currencyIndex),
        staleCardForCurrency(code, report),
      ];
      list = appendOpeningIfRelevant(list, code);
      return list;
    }

    let list: SummaryCard[] = [
      // Bloque UYU
      issuedCard("UYU", currencyIndex, zetaAge),
      collectedCard("UYU", currencyIndex, zetaAge),
      pendingCollectionCard("UYU", currencyIndex, zetaAge),
      effectivenessCard("UYU", currencyIndex),
      // Bloque USD
      issuedCard("USD", currencyIndex, zetaAge),
      collectedCard("USD", currencyIndex, zetaAge),
      pendingCollectionCard("USD", currencyIndex, zetaAge),
      effectivenessCard("USD", currencyIndex),
      // Salud
      staleCardAll(report),
      orphanCardAll(report),
    ];
    list = appendOpeningIfRelevant(list, "UYU");
    list = appendOpeningIfRelevant(list, "USD");
    return list;
  }, [report, selectedCurrency, currencyIndex]);

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
