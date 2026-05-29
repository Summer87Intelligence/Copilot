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

import { useCallback, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  ChevronDown,
  CircleCheckBig,
  CircleDollarSign,
  Clock,
  Database,
  FileMinus,
  FileText,
  Info,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { CarteraCountUp } from "@/components/copilot/cartera-count-up";
import {
  formatCarteraInteger,
  formatCarteraMoney,
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
import { FINANCIAL_UX_COPY } from "@/lib/copilot-financial-ux-copy";
import { buildCurrentDebtSnapshot } from "@/lib/copilot-cartera-pending-debt-snapshot";
import { CarteraPendingDrawer } from "@/components/copilot/cartera-pending-drawer";

// ---------------------------------------------------------------------------
// Tipos de card y badges
// ---------------------------------------------------------------------------

type SourceBadge = "zeta" | "analytics" | "recon";

type CardTone = "neutral" | "info" | "positive" | "warning" | "danger";

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
  /** Tooltip explicativo (ícono Info junto al título). */
  tooltip?: string;
  /** Marca la card como afectada por datos históricos pre-sync. */
  isHistoricalPartial?: boolean;
  /** Abre el drawer de deuda pendiente (solo cards `cartera-*` con saldo > 0). */
  clickable?: boolean;
  onClick?: () => void;
  actionLabel?: string;
  /**
   * Opcional: desglose de 2 líneas bajo el subtitle.
   * Usado en cards de saldo pendiente para mostrar período / anterior.
   */
  breakdown?: { label: string; value: string }[];
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
  issuedInPeriodNet: number;
  /** Saldo pendiente al corte (incluye pre-período). Alias canónico para "Comprobantes Pendientes Zeta". */
  pendingAtCutoff: number;
  /**
   * Saldo pendiente SOLO de facturas emitidas en el período (alias legacy).
   * Usado para derivar deuda pre-período: prePeriodPending = pendingAtCutoff − totalPending.
   */
  totalPending: number;
  /** Facturas con balance > 0 emitidas EN el período (no incluye deuda histórica). */
  pendingInvoiceCount: number;
  collectedInPeriod: number;
  collectedReceiptCount: number;
  openingBalance: number;
  collectionEffectiveness: number | null;
  invoiceCount: number;
  /** true cuando el motor no recibió receipts (cobrado período no se puede mostrar). */
  collectedDataMissing: boolean;
  creditNoteCount: number;
  creditNoteAmount: number;
  /** Saldo arrastrado: facturas anteriores al período con balance > 0. */
  previousPending: number;
  /** Derived residual: max(0, issuedInPeriod − creditNoteAmount − pendingAtCutoff). See NormalizedCurrencyMetrics. */
  portfolioResolvedAmount: number;
};

function getCurrencyCardMetrics(
  index: Map<ReconciliationCurrencyCode, NormalizedCurrencyMetrics>,
  code: ReconciliationCurrencyCode
): CurrencyCardMetrics {
  const direct = index.get(code);

  if (direct) {
    return {
      issuedInPeriod: direct.issuedInPeriod,
      issuedInPeriodNet: direct.issuedInPeriodNet,
      pendingAtCutoff: direct.pendingAtCutoff,
      totalPending: direct.totalPending,
      pendingInvoiceCount: direct.pendingInvoiceCount,
      collectedInPeriod: direct.collectedInPeriod,
      collectedReceiptCount: direct.collectedReceiptCount,
      openingBalance: direct.openingBalance,
      collectionEffectiveness: direct.collectionEffectiveness,
      invoiceCount: direct.invoiceCount,
      collectedDataMissing: direct.collectedReceiptCount === 0,
      creditNoteCount: direct.creditNoteCount,
      creditNoteAmount: direct.creditNoteAmount,
      previousPending: direct.previousPending,
      portfolioResolvedAmount: direct.portfolioResolvedAmount,
    };
  }

  // Bucket ausente en `report.currencies`: las cards muestran 0 / "—".
  return {
    issuedInPeriod: 0,
    issuedInPeriodNet: 0,
    pendingAtCutoff: 0,
    totalPending: 0,
    pendingInvoiceCount: 0,
    collectedInPeriod: 0,
    collectedReceiptCount: 0,
    openingBalance: 0,
    collectionEffectiveness: null,
    invoiceCount: 0,
    collectedDataMissing: true,
    creditNoteCount: 0,
    creditNoteAmount: 0,
    previousPending: 0,
    portfolioResolvedAmount: 0,
  };
}

function pendingCollectionCard(
  code: ReconciliationCurrencyCode,
  index: Map<ReconciliationCurrencyCode, NormalizedCurrencyMetrics>
): SummaryCard {
  const m = getCurrencyCardMetrics(index, code);

  const hasAnyDebt = m.pendingAtCutoff > 0;

  // Deuda del período = totalPending (facturas emitidas dentro del rango con balance > 0)
  // Deuda anterior    = previousPending (facturas pre-período con balance vivo)
  // Total             = pendingAtCutoff = período + anterior
  const periodPending = m.totalPending;

  const breakdown: { label: string; value: string }[] | undefined = hasAnyDebt
    ? [
        {
          label: "Del período",
          value: formatCarteraMoney(code, periodPending, { fractionDigits: 0 }),
        },
        {
          label: "Anterior",
          value: formatCarteraMoney(code, m.previousPending, { fractionDigits: 0 }),
        },
      ]
    : undefined;

  const subtitle = !hasAnyDebt
    ? "Sin deuda en cartera"
    : "Deuda total";

  return {
    id: `cartera-${code}`,
    title: `Saldo pendiente ${code}`,
    source: "zeta",
    tone: hasAnyDebt ? "danger" : "positive",
    icon: CircleDollarSign,
    value: m.pendingAtCutoff,
    format: (n) => formatCarteraMoney(code, n),
    subtitle,
    breakdown,
    tooltip: FINANCIAL_UX_COPY.kpiPendingTooltip,
  };
}

function issuedCard(
  code: ReconciliationCurrencyCode,
  index: Map<ReconciliationCurrencyCode, NormalizedCurrencyMetrics>
): SummaryCard {
  const m = getCurrencyCardMetrics(index, code);
  const hasNcs = m.creditNoteAmount > 0;
  return {
    id: `facturado-${code}`,
    title: `Facturado neto ${code}`,
    source: "zeta",
    tone: "positive",
    icon: FileText,
    value: m.issuedInPeriodNet,
    format: (n) => formatCarteraMoney(code, n),
    subtitle: hasNcs
      ? `Bruto ${formatCarteraMoney(code, m.issuedInPeriod)}`
      : m.invoiceCount === 0
        ? "Sin facturas en el período"
        : `${formatCarteraInteger(m.invoiceCount)} factura${m.invoiceCount === 1 ? "" : "s"}`,
    tooltip: FINANCIAL_UX_COPY.kpiGrossIssuedTooltip,
  };
}

function creditNotesCard(
  code: ReconciliationCurrencyCode,
  index: Map<ReconciliationCurrencyCode, NormalizedCurrencyMetrics>
): SummaryCard {
  const m = getCurrencyCardMetrics(index, code);
  return {
    id: `credit-notes-${code}`,
    title: `Notas de crédito ${code}`,
    source: "zeta",
    tone: "danger",
    icon: FileMinus,
    value: m.creditNoteAmount,
    format: (n) => formatCarteraMoney(code, n),
    subtitle: `${formatCarteraInteger(m.creditNoteCount)} nota${m.creditNoteCount === 1 ? "" : "s"} de crédito`,
    tooltip: FINANCIAL_UX_COPY.kpiCreditNotesAppliedTooltip,
  };
}

function collectedAppliedCard(
  code: ReconciliationCurrencyCode,
  index: Map<ReconciliationCurrencyCode, NormalizedCurrencyMetrics>
): SummaryCard {
  const m = getCurrencyCardMetrics(index, code);
  return {
    id: `collected-applied-${code}`,
    title: `Cobrado aplicado ${code}`,
    source: "zeta",
    tone: m.portfolioResolvedAmount > 0 ? "positive" : "neutral",
    icon: CircleCheckBig,
    value: m.portfolioResolvedAmount,
    format: (n) => formatCarteraMoney(code, n),
    subtitle:
      m.collectedReceiptCount > 0
        ? `${formatCarteraInteger(m.collectedReceiptCount)} recibo${m.collectedReceiptCount === 1 ? "" : "s"} aplicado${m.collectedReceiptCount === 1 ? "" : "s"}`
        : m.portfolioResolvedAmount === 0
          ? "Sin cobros registrados"
          : "Del período",
    tooltip: FINANCIAL_UX_COPY.kpiCollectedAppliedTooltip,
  };
}

function effectivenessCard(
  code: ReconciliationCurrencyCode,
  index: Map<ReconciliationCurrencyCode, NormalizedCurrencyMetrics>
): SummaryCard {
  const m = getCurrencyCardMetrics(index, code);
  const netIssued = Math.max(0, m.issuedInPeriod - m.creditNoteAmount);
  const rawRatio = netIssued > 0 ? m.portfolioResolvedAmount / netIssued : null;
  // Clamp to [0, 9.99] — avoids absurd % from advances/overpayments while
  // still surfacing anomalies above 100%.
  const ratio = rawRatio !== null ? Math.max(0, Math.min(rawRatio, 9.99)) : null;

  return {
    id: `effectiveness-${code}`,
    title: `Cobranza efectiva ${code}`,
    source: "analytics",
    tone: "info",
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
        ? "Sin datos en el período"
        : `${formatCarteraInteger(m.invoiceCount)} factura${m.invoiceCount === 1 ? "" : "s"} emitida${m.invoiceCount === 1 ? "" : "s"}`,
    tooltip: FINANCIAL_UX_COPY.kpiNetEffectivenessTooltip,
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
    subtitle: "Deuda anterior al período",
  };
}

function staleCardAll(report: FinancialConsistencyReport): SummaryCard {
  // Misma fuente que ClientDebtExplorer: solo clientes con deuda activa > 0.
  // staleSummary incluye clientes con saldo $0 (stale sin deuda real) que el
  // Explorer no muestra — usar ese pre-cómputo generaba discrepancias de conteo.
  const withDebt = report.staleClients.filter((c) =>
    Object.values(c.pendingByCurrency).some((v) => (v ?? 0) > 0.005)
  );
  let warning = 0;
  let critical = 0;
  let neverSynced = 0;
  let ok = 0;
  for (const c of withDebt) {
    if (c.status === "critical") critical++;
    else if (c.status === "warning") warning++;
    else if (c.status === "never_synced") neverSynced++;
    else ok++;
  }
  const total = warning + critical + neverSynced;
  const breakdown: string[] = [];
  if (critical > 0) breakdown.push(`${critical} crítico${critical === 1 ? "" : "s"}`);
  if (warning > 0) breakdown.push(`${warning} con alerta`);
  if (neverSynced > 0) breakdown.push(`${neverSynced} sin datos`);
  return {
    id: "stale",
    title: "Clientes en riesgo",
    source: "recon",
    tone: total === 0 ? "positive" : critical > 0 || neverSynced > 0 ? "warning" : "info",
    icon: ShieldAlert,
    value: total,
    format: (n) => formatCarteraInteger(n),
    subtitle:
      total === 0
        ? withDebt.length > 0
          ? `${formatCarteraInteger(ok)} clientes con deuda al día`
          : "Sin deuda activa en cartera"
        : `${breakdown.join(" · ")} · con deuda activa`,
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
  if (warning > 0) breakdown.push(`${warning} con alerta`);
  if (critical > 0) breakdown.push(`${critical} crítico${critical === 1 ? "" : "s"}`);
  if (neverSynced > 0) breakdown.push(`${neverSynced} sin datos`);

  const total = atRisk.length;

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
          : `${formatCarteraInteger(clientsWithDebt.length)} cliente${clientsWithDebt.length === 1 ? "" : "s"} al día`
        : breakdown.join(" · "),
  };
}

function orphanCardAll(report: FinancialConsistencyReport): SummaryCard {
  const o = report.orphanSummary;
  return {
    id: "orphans",
    title: "Facturas por conciliar",
    source: "recon",
    tone: o.warned === 0 ? "positive" : o.pending_auto_close > 0 ? "warning" : "info",
    icon: AlertTriangle,
    value: o.warned,
    format: (n) => formatCarteraInteger(n),
    subtitle:
      o.warned === 0
        ? "Sin alertas activas"
        : `${formatCarteraInteger(o.warned)} con deuda abierta`,
  };
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function ExecutiveSummaryCards({
  report,
  selectedCurrency = "all",
  isPreSync = false,
  block,
  showBadges = false,
}: {
  report: FinancialConsistencyReport;
  selectedCurrency?: CurrencyFilter;
  /** Indica que el período confirmado incluye facturas pre-2026-01-01. */
  isPreSync?: boolean;
  /** Filtra por bloque temático: "cobranza" (saldos, cobros, efectividad) o "ventas" (facturado, NCs). Sin valor → todas las cards. */
  block?: "executive" | "cobranza" | "ventas" | "auditoria";
  /** Ocultar badges de fuente (Zeta / Analytics / Recon). Útil en el resumen ejecutivo compacto. */
  showBadges?: boolean;
}) {
  const reduce = useReducedMotion();
  const [pendingDrawerCurrency, setPendingDrawerCurrency] =
    useState<ReconciliationCurrencyCode | null>(null);

  const openPendingDrawer = useCallback((currency: ReconciliationCurrencyCode) => {
    setPendingDrawerCurrency(currency);
  }, []);

  const closePendingDrawer = useCallback(() => {
    setPendingDrawerCurrency(null);
  }, []);

  const pendingSnapshot = useMemo(
    () =>
      pendingDrawerCurrency
        ? buildCurrentDebtSnapshot(report, pendingDrawerCurrency)
        : null,
    [report, pendingDrawerCurrency]
  );

  // Normaliza `report.currencies` (array | objeto | snake_case | strings) a un
  // índice por moneda. Esto es lo ÚNICO que las cards consultan para emitido /
  // pendiente / cobrado / efectividad: una sola fuente, una sola lectura.
  const currencyIndex = useMemo(
    () => buildCurrencyIndex(report.currencies),
    [report.currencies]
  );

  const cards = useMemo<SummaryCard[]>(() => {
    function appendOpeningIfRelevant(
      list: SummaryCard[],
      code: ReconciliationCurrencyCode
    ): SummaryCard[] {
      const m = currencyIndex.get(code);
      if (!m || m.openingBalance <= 0 || !isPreSync) return list;
      return [...list, openingBalanceCard(code, currencyIndex)];
    }

    let list: SummaryCard[];

    if (selectedCurrency === "USD" || selectedCurrency === "UYU") {
      const code = selectedCurrency;
      const mSingle = getCurrencyCardMetrics(currencyIndex, code);
      list = [
        issuedCard(code, currencyIndex),
        ...(mSingle.creditNoteAmount > 0 ? [creditNotesCard(code, currencyIndex)] : []),
        collectedAppliedCard(code, currencyIndex),
        pendingCollectionCard(code, currencyIndex),
        effectivenessCard(code, currencyIndex),
        staleCardForCurrency(code, report),
      ];
      list = appendOpeningIfRelevant(list, code);
    } else {
      const mUYU = getCurrencyCardMetrics(currencyIndex, "UYU");
      const mUSD = getCurrencyCardMetrics(currencyIndex, "USD");
      list = [
        issuedCard("UYU", currencyIndex),
        ...(mUYU.creditNoteAmount > 0 ? [creditNotesCard("UYU", currencyIndex)] : []),
        collectedAppliedCard("UYU", currencyIndex),
        pendingCollectionCard("UYU", currencyIndex),
        effectivenessCard("UYU", currencyIndex),
        issuedCard("USD", currencyIndex),
        ...(mUSD.creditNoteAmount > 0 ? [creditNotesCard("USD", currencyIndex)] : []),
        collectedAppliedCard("USD", currencyIndex),
        pendingCollectionCard("USD", currencyIndex),
        effectivenessCard("USD", currencyIndex),
        staleCardAll(report),
        orphanCardAll(report),
      ];
      list = appendOpeningIfRelevant(list, "UYU");
      list = appendOpeningIfRelevant(list, "USD");
    }

    // Marcar cards afectadas cuando el período incluye datos pre-sync
    if (isPreSync) {
      list = list.map((c) => {
        if (
          c.id.startsWith("facturado-") ||
          c.id.startsWith("credit-notes-") ||
          c.id.startsWith("collected-applied-") ||
          c.id.startsWith("effectiveness-")
        ) {
          return {
            ...c,
            isHistoricalPartial: true,
            ...(c.id.startsWith("effectiveness-")
              ? { tooltip: FINANCIAL_UX_COPY.kpiNetEffectivenessTooltipPreSync }
              : {}),
          };
        }
        return c;
      });
    }

    // Filtrar por bloque temático
    if (block === "executive") {
      // 4 KPIs críticos: cobrado aplicado + saldo pendiente por moneda
      list = list.filter(
        (c) =>
          c.id.startsWith("collected-applied-") || c.id.startsWith("cartera-")
      );
    } else if (block === "cobranza") {
      // KPIs secundarios de cobranza: efectividad, clientes en riesgo, saldo anterior
      list = list.filter(
        (c) =>
          c.id.startsWith("effectiveness-") ||
          c.id === "stale" ||
          c.id.startsWith("stale-") ||
          c.id.startsWith("opening-")
      );
    } else if (block === "ventas") {
      list = list.filter((c) => c.id.startsWith("facturado-"));
    } else if (block === "auditoria") {
      // Alertas técnicas: orphan warnings
      list = list.filter((c) => c.id === "orphans");
    }

    return list;
  }, [report, selectedCurrency, currencyIndex, isPreSync, block]);

  const showBadge = showBadges;

  const cardsWithPendingActions = useMemo(() => {
    return cards.map((card) => {
      if (card.id !== "cartera-UYU" && card.id !== "cartera-USD") return card;
      if (card.value <= 0) return card;
      const currency: ReconciliationCurrencyCode =
        card.id === "cartera-UYU" ? "UYU" : "USD";
      return {
        ...card,
        clickable: true,
        actionLabel: "Ver facturas",
        onClick: () => openPendingDrawer(currency),
      };
    });
  }, [cards, openPendingDrawer]);

  return (
    <>
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
        {cardsWithPendingActions.map((card) => (
          <SummaryCardView key={card.id} card={card} showBadge={showBadge} />
        ))}
      </motion.section>

      <CarteraPendingDrawer
        snapshot={pendingSnapshot}
        open={pendingDrawerCurrency !== null}
        onClose={closePendingDrawer}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Card view
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// KPI tooltip inline (click/hover + keyboard accessible)
// ---------------------------------------------------------------------------

function KpiInfoButton({ tooltip, id }: { tooltip: string; id: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-flex shrink-0 items-center">
      <button
        type="button"
        aria-label="Más información"
        aria-expanded={open}
        aria-describedby={open ? `${id}-kpi-tip` : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex items-center rounded-sm text-[var(--copilot-ink-muted)]/50 transition-colors hover:text-[var(--copilot-ink-muted)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--copilot-accent)]/60"
      >
        <Info className="h-3 w-3" aria-hidden />
      </button>
      {open ? (
        <div
          id={`${id}-kpi-tip`}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-0 z-50 mb-1.5 w-52 rounded-xl border border-[var(--copilot-border)] bg-white px-3 py-2 text-[11px] leading-relaxed text-[var(--copilot-ink)] shadow-md"
        >
          {tooltip}
        </div>
      ) : null}
    </div>
  );
}

const TONE_VALUE_CLASS: Record<CardTone, string> = {
  neutral:  "text-[var(--copilot-ink)]",
  info:     "text-sky-700",      // azul petróleo suave (era sky-900, demasiado oscuro)
  positive: "text-emerald-600",  // jade suave (era emerald-800, verde oscuro)
  warning:  "text-amber-600",    // naranja suave (era amber-900, casi marrón)
  danger:   "text-rose-600",     // coral premium (era rose-800, vino oscuro)
};

const TONE_ICON_CLASS: Record<CardTone, string> = {
  neutral:  "bg-slate-50 text-slate-400",
  info:     "bg-sky-50 text-sky-500",
  positive: "bg-emerald-50 text-emerald-500",
  warning:  "bg-amber-50 text-amber-500",
  danger:   "bg-rose-50 text-rose-500",
};

function SummaryCardView({ card, showBadge = false }: { card: SummaryCard; showBadge?: boolean }) {
  const Icon = card.icon;
  const isClickable = card.clickable === true && typeof card.onClick === "function";

  return (
    <motion.article
      variants={{
        hidden: { opacity: 0, y: 8 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: "easeOut" } },
      }}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? card.onClick : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                card.onClick?.();
              }
            }
          : undefined
      }
      className={[
        "group relative flex flex-col rounded-2xl border border-[rgba(15,23,42,0.10)] bg-[var(--copilot-card)] px-5 py-6 shadow-[0_1px_3px_rgba(15,23,42,0.07)] transition",
        isClickable
          ? "cursor-pointer hover:border-[var(--copilot-accent)]/25 hover:bg-white/80 hover:shadow-[0_6px_16px_rgba(15,23,42,0.12)]"
          : "hover:shadow-[0_4px_12px_rgba(15,23,42,0.10)]",
      ].join(" ")}
    >
      {/* Label row */}
      <div className="mb-4 flex items-center gap-2">
        <span
          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${TONE_ICON_CLASS[card.tone]}`}
          aria-hidden
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="flex min-w-0 items-center gap-1">
          <p className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--copilot-ink-muted)]/90">
            {card.title}
          </p>
          {card.tooltip ? (
            <span
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <KpiInfoButton tooltip={card.tooltip} id={card.id} />
            </span>
          ) : null}
        </div>
        {showBadge ? <SourceBadgeView source={card.source} /> : null}
      </div>

      {/* Value — dominant */}
      <p
        className={`text-[28px] font-bold leading-none tabular-nums ${TONE_VALUE_CLASS[card.tone]}`}
      >
        <CarteraCountUp value={card.value} format={card.format} />
      </p>

      {/* Descriptor line */}
      <p className="mt-2 text-[12px] leading-snug text-[var(--copilot-ink-muted)]/85">
        {card.subtitle}
      </p>

      {/* Breakdown: Del período / Anterior */}
      {card.breakdown && card.breakdown.length > 0 ? (
        <div className="mt-2 space-y-1 border-t border-[rgba(15,23,42,0.07)] pt-2">
          {card.breakdown.map((line) => (
            <div key={line.label} className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-[var(--copilot-ink-muted)]/65">{line.label}</span>
              <span className="text-[12px] tabular-nums text-[var(--copilot-ink-muted)]/80">{line.value}</span>
            </div>
          ))}
        </div>
      ) : null}

      {card.isHistoricalPartial ? (
        <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-amber-200/70 bg-amber-50/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-800">
          <Clock className="h-2.5 w-2.5" aria-hidden />
          {FINANCIAL_UX_COPY.historicalPartialBadge}
        </div>
      ) : null}

      {isClickable && card.actionLabel ? (
        <p className="mt-3 text-xs font-semibold text-[var(--copilot-accent)]">
          {card.actionLabel}
        </p>
      ) : null}
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
// CreditNotesSection — colapsable, default cerrado
// ---------------------------------------------------------------------------

export function CreditNotesSection({
  report,
  selectedCurrency = "all",
}: {
  report: FinancialConsistencyReport;
  selectedCurrency?: CurrencyFilter;
}) {
  const [expanded, setExpanded] = useState(false);
  const currencyIndex = useMemo(
    () => buildCurrencyIndex(report.currencies),
    [report.currencies]
  );

  const currencies =
    selectedCurrency === "USD" || selectedCurrency === "UYU"
      ? ([selectedCurrency] as const)
      : (["UYU", "USD"] as const);

  const ncLines = currencies
    .map((code) => {
      const m = currencyIndex.get(code);
      if (!m || m.creditNoteAmount === 0) return null;
      return { code, amount: m.creditNoteAmount, count: m.creditNoteCount, issuedBruto: m.issuedInPeriod };
    })
    .filter(Boolean) as Array<{
      code: "UYU" | "USD";
      amount: number;
      count: number;
      issuedBruto: number;
    }>;

  if (ncLines.length === 0) return null;

  const summaryText = ncLines
    .map(
      (l) =>
        `${l.code}: ${formatCarteraMoney(l.code, l.amount)} (${l.count} nota${l.count === 1 ? "" : "s"})`
    )
    .join(" · ");

  return (
    <div className="overflow-hidden rounded-2xl border border-rose-200/70 bg-rose-50/30 shadow-[var(--copilot-shadow)]">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-rose-50/60"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
            <FileMinus className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-800">
              Notas de crédito del período
            </p>
            <p className="mt-0.5 text-xs text-rose-700/80">{summaryText}</p>
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-rose-600 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {expanded && (
        <div className="border-t border-rose-200/50 px-5 pb-5 pt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ncLines.map((l) => (
              <div
                key={l.code}
                className="rounded-xl border border-rose-200/60 bg-white/70 p-4"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-rose-700">
                  NC aplicadas {l.code}
                </p>
                <p className="mt-1.5 text-xl font-semibold tabular-nums text-rose-800">
                  −{formatCarteraMoney(l.code, l.amount)}
                </p>
                <p className="mt-1 text-sm text-rose-700/80">
                  {l.count} nota{l.count === 1 ? "" : "s"} de crédito
                </p>
                <p className="mt-0.5 text-[11px] text-rose-600/70">
                  Facturado bruto: {formatCarteraMoney(l.code, l.issuedBruto)}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-rose-600/60">
            Las NCs reducen el facturado neto, no el saldo pendiente · Detalle por comprobante disponible en Zeta
          </p>
        </div>
      )}
    </div>
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
