"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useCopilotReadingKeyOverride } from "@/components/copilot/copilot-reading-key-context";
import { CopilotTaxEvidenceDrawer } from "@/components/copilot/copilot-tax-evidence-drawer";
import { CopilotCollapsiblePanel } from "@/components/copilot/copilot-collapsible-panel";
import { CopilotObligationPrimaryBadge } from "@/components/copilot/copilot-obligation-primary-badge";
import { FinancialWarningBanner } from "@/components/copilot/financial-warning-banner";
import { FinancialStatusBadge } from "@/components/copilot/financial-status-badge";
import { DataFreshnessBanner } from "@/components/copilot/data-freshness-banner";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import {
  CopilotCard,
  CopilotGhostButton,
  CopilotGhostLink,
  CopilotPrimaryButton,
  CopilotPrimaryLink,
  CopilotSectionTitle,
  copilotPageMainClass,
} from "@/components/copilot/copilot-ui";
import { CopilotSeverityBadge } from "@/components/copilot/copilot-severity-badge";
import {
  COPILOT_READING_KEY_FINANZAS_COBERTURA,
  COPILOT_READING_KEY_FINANZAS_DEFAULT,
} from "@/lib/copilot-reading-keys";
import {
  mapTaxObligationStatus,
  mapTaxTypeLabel,
  sharedObligationPaymentStatusPillClass,
} from "@/lib/copilot-format";
import {
  getObligationSecondaryHint,
  getPrimaryObligationState,
  sortObligationsForCashImpact,
} from "@/lib/copilot-obligation-primary-state";
import { getFinancialPredictiveAlerts } from "@/lib/copilot-financial-alerts";
import {
  financialEngineLocalTodayYmd,
  getFinancialSnapshot,
  type FinancialSnapshotApiV1,
} from "@/lib/copilot-financial-engine";
import {
  snapshotCashNet,
  snapshotCoverageRatio,
  snapshotExpectedOutflowsTotal,
  snapshotLiquidityBalance,
  snapshotReceivablesRiskWeighted,
  snapshotRiskBand,
} from "@/lib/copilot-financial-snapshot-selectors";
import { normalizedCollectionProbability } from "@/lib/copilot-financial-primitives";
import {
  getProtoInvoices,
  getProtoPayments,
  type DataRow,
} from "@/lib/copilot-data";
import { formatMoneyCurrency } from "@/lib/copilot-format-money";
import { deriveFinancialFlags } from "@/lib/derive-financial-flags";
import { FINANCIAL_UX_COPY } from "@/lib/copilot-financial-ux-copy";
import {
  getProtoTaxObligations,
  type ProtoTaxObligation,
} from "@/lib/copilot-tax-data";

const FINANZAS_COBERTURA_QUERY =
  "/copilot/finanzas?mode=cobertura&from=atencion-prioritaria";

function rowNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function ymdFromUnknown(iso: unknown): string {
  const s = String(iso ?? "").trim();
  if (s.length >= 10) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const VOIDED_INVOICE_STATUSES = new Set([
  "paid", "void", "voided", "canceled", "cancelled",
  "anulada", "anulado", "annulled", "annul",
]);

function isVoidedInvoiceStatus(status: unknown): boolean {
  return VOIDED_INVOICE_STATUSES.has(String(status ?? "").toLowerCase());
}

function isOpenInvoiceRow(row: DataRow): boolean {
  if (isVoidedInvoiceStatus(row.status)) return false;
  return rowNum(row.balance_amount) > 0;
}

function formatMoneyCompact(n: number): string {
  // TODO: snapshot amounts are mixed UYU+USD aggregates — pending currency-aware rendering
  return formatMoneyCurrency(n, null, { compact: true });
}

function dueLabel(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-UY", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

function FlowBar({
  label,
  value,
  max,
  flow,
}: {
  label: string;
  value: number;
  max: number;
  flow: "in" | "out";
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const valueClass = flow === "in" ? "text-green-600" : "text-red-500";
  const barClass =
    flow === "in" ? "bg-emerald-500/85" : "bg-red-400/80";

  return (
    <div>
      <div className="flex justify-between text-xs text-[var(--copilot-ink-muted)]">
        <span>{label}</span>
        <span className={`font-semibold tabular-nums ${valueClass}`}>
          {formatMoneyCompact(value)}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-[rgba(44,40,37,0.08)]">
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function formatCoverageRatio(r: number): string {
  if (!Number.isFinite(r) || r > 100) return "—";
  return `${r.toFixed(2)}×`;
}

/**
 * Devuelve el texto del ratio de cobertura distinguiendo "sin egresos" de ratio inválido.
 * El motor asigna 999 cuando expected_outflows = 0; "—" solo cuando el cálculo no aplica.
 */
function coverageRatioDisplay(snapshot: FinancialSnapshotApiV1): {
  value: string;
  isNoOutflows: boolean;
} {
  const outflows = snapshotExpectedOutflowsTotal(snapshot);
  const ratio = snapshotCoverageRatio(snapshot);
  if (outflows <= 0) {
    return { value: "Sin egresos", isNoOutflows: true };
  }
  return { value: formatCoverageRatio(ratio), isNoOutflows: false };
}

function buildDeficitGuidedCopy(
  snapshot: FinancialSnapshotApiV1 | null,
  snapshotLoading: boolean
): string {
  if (snapshotLoading || !snapshot) {
    return "Estamos cargando el panorama de caja para aterrizar el déficit con cifras del motor.";
  }
  const balance = snapshotLiquidityBalance(snapshot);
  const ratio = snapshotCoverageRatio(snapshot);
  if (balance < 0) {
    return `Hay un déficit proyectado de ${formatMoneyCompact(balance)}: caja más cobranza esperada no cubre los egresos modelados en la ventana del motor.`;
  }
  if (ratio < 1 && Number.isFinite(ratio)) {
    return `La cobertura está por debajo de 1,00× (${formatCoverageRatio(ratio)}): el colchón es insuficiente frente a salidas ya comprometidas.`;
  }
  return "La posición de caja está tensa frente a egresos esperados: conviene actuar antes de que se concreten más salidas.";
}

function nearestOpenObligationDue(
  obligations: ProtoTaxObligation[]
): ProtoTaxObligation | null {
  const open = obligations
    .filter((o) => String(o.status ?? "").toLowerCase() !== "paid")
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  return open[0] ?? null;
}

function obligationPrincipal(o: ProtoTaxObligation): number {
  return o.confirmed_amount != null && o.confirmed_amount > 0
    ? o.confirmed_amount
    : o.estimated_amount;
}

/** Abierta, vencimiento más cercano; empate por mayor monto comprometido. */
function pickPrioritaryObligation(
  list: ProtoTaxObligation[]
): ProtoTaxObligation | null {
  const open = list.filter(
    (o) => String(o.status ?? "").toLowerCase() !== "paid"
  );
  if (open.length === 0) return null;
  return [...open].sort((a, b) => {
    const da = a.due_date.slice(0, 10);
    const db = b.due_date.slice(0, 10);
    if (da !== db) return da.localeCompare(db);
    return obligationPrincipal(b) - obligationPrincipal(a);
  })[0];
}

function formatDueFull(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-UY", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/** Modo normal: panorama en panel colapsado; modo guiado: siempre visible. */
function FinanzasPanoramaSection({
  coberturaGuided,
  children,
}: {
  coberturaGuided: boolean;
  children: ReactNode;
}) {
  if (coberturaGuided) {
    return (
      <div id="copilot-finanzas-panorama" className="scroll-mt-28">
        {children}
      </div>
    );
  }
  return (
    <CopilotCollapsiblePanel
      title="Panorama de liquidez (detalle)"
      defaultOpen={false}
      className="scroll-mt-28"
    >
      <div id="copilot-finanzas-panorama" className="scroll-mt-28">
        {children}
      </div>
    </CopilotCollapsiblePanel>
  );
}

function FinanzasFiscalCalendarCollapsible({
  coberturaGuided,
  children,
}: {
  coberturaGuided: boolean;
  children: ReactNode;
}) {
  if (coberturaGuided) return <>{children}</>;
  return (
    <CopilotCollapsiblePanel
      title="Calendario fiscal completo y resumen"
      defaultOpen={false}
    >
      {children}
    </CopilotCollapsiblePanel>
  );
}

function CopilotFinanzasPageContent() {
  const searchParams = useSearchParams();
  const { setReadingKeyOverride } = useCopilotReadingKeyOverride();
  const coberturaGuided = useMemo(() => {
    if (searchParams.get("focus") === "liquidity") return true;
    const from = searchParams.get("from");
    return (
      searchParams.get("mode") === "cobertura" &&
      (from === "atencion-prioritaria" || from === "alertas")
    );
  }, [searchParams]);

  useLayoutEffect(() => {
    setReadingKeyOverride({
      kind: "custom",
      entry: coberturaGuided
        ? COPILOT_READING_KEY_FINANZAS_COBERTURA
        : COPILOT_READING_KEY_FINANZAS_DEFAULT,
    });
  }, [coberturaGuided, setReadingKeyOverride]);

  const [taxObligations, setTaxObligations] = useState<ProtoTaxObligation[]>([]);
  const [taxLoading, setTaxLoading] = useState(true);
  const [taxError, setTaxError] = useState<string | null>(null);
  const [taxObligationId, setTaxObligationId] = useState<string | null>(null);
  const [isTaxDrawerOpen, setIsTaxDrawerOpen] = useState(false);

  const [snapshot, setSnapshot] = useState<FinancialSnapshotApiV1 | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [predictiveHint, setPredictiveHint] = useState<{
    total: number;
    critical: number;
  } | null>(null);

  const [coberturaPasosOpen, setCoberturaPasosOpen] = useState(false);
  const [fiscalPriorityGuideOpen, setFiscalPriorityGuideOpen] = useState(false);
  const [invoiceRows, setInvoiceRows] = useState<DataRow[]>([]);
  const [operationalInvoices, setOperationalInvoices] = useState<DataRow[]>([]);
  const [paymentRows, setPaymentRows] = useState<DataRow[]>([]);
  const [coberturaDetailLoading, setCoberturaDetailLoading] = useState(false);
  const [coberturaDetailError, setCoberturaDetailError] = useState<string | null>(
    null
  );

  const loadTax = useCallback(async () => {
    setTaxError(null);
    setTaxLoading(true);
    try {
      const all = await getProtoTaxObligations();
      setTaxObligations(all);
    } catch (e) {
      setTaxObligations([]);
      setTaxError(
        e instanceof Error ? e.message : "No se pudieron cargar obligaciones fiscales."
      );
    } finally {
      setTaxLoading(false);
    }
  }, []);

  const loadSnapshot = useCallback(async () => {
    setSnapshotError(null);
    setSnapshotLoading(true);
    try {
      const s = await getFinancialSnapshot();
      setSnapshot(s);
    } catch (e) {
      setSnapshot(null);
      setSnapshotError(
        e instanceof Error ? e.message : "No se pudo cargar el panorama financiero."
      );
    } finally {
      setSnapshotLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTax();
    void loadSnapshot();
  }, [loadTax, loadSnapshot]);

  useEffect(() => {
    if (!coberturaGuided) return;
    let cancelled = false;
    setCoberturaDetailLoading(true);
    setCoberturaDetailError(null);
    void Promise.all([getProtoInvoices(), getProtoPayments()])
      .then(([inv, pay]) => {
        if (!cancelled) {
          setInvoiceRows(inv);
          setPaymentRows(pay);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setInvoiceRows([]);
          setPaymentRows([]);
          setCoberturaDetailError(
            e instanceof Error ? e.message : "No se pudieron cargar facturas ni pagos."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setCoberturaDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [coberturaGuided]);

  useEffect(() => {
    let cancelled = false;
    void getProtoInvoices("active")
      .then((inv) => {
        if (!cancelled) setOperationalInvoices(inv);
      })
      .catch(() => {
        if (!cancelled) setOperationalInvoices([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!coberturaGuided) return;
    const h = window.location.hash.replace(/^#/, "");
    if (h === "copilot-finanzas-cobertura-acciones") {
      setCoberturaPasosOpen(true);
    }
    if (h === "copilot-finanzas-fiscal-priority-intervention") {
      setFiscalPriorityGuideOpen(true);
    }
  }, [coberturaGuided]);

  useEffect(() => {
    if (!coberturaGuided || !coberturaPasosOpen) return;
    if (
      window.location.hash.replace(/^#/, "") !== "copilot-finanzas-cobertura-acciones"
    ) {
      return;
    }
    const id = window.requestAnimationFrame(() => {
      document
        .getElementById("copilot-finanzas-cobertura-acciones")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [coberturaGuided, coberturaPasosOpen]);

  useEffect(() => {
    let cancelled = false;
    void getFinancialPredictiveAlerts()
      .then((list) => {
        if (cancelled) return;
        setPredictiveHint({
          total: list.length,
          critical: list.filter((a) => a.priority === "critical").length,
        });
      })
      .catch(() => {
        if (!cancelled) setPredictiveHint(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Modo cobertura: por defecto el foco es el bloque guiado (CTA), no el panorama. */
  useEffect(() => {
    if (!coberturaGuided) return;
    const scrollToCoberturaTarget = () => {
      const raw = window.location.hash.replace(/^#/, "");
      const id =
        raw === "copilot-finanzas-cobranza" ||
        raw === "copilot-finanzas-fiscal" ||
        raw === "copilot-finanzas-cobertura-acciones" ||
        raw === "copilot-finanzas-fiscal-priority-intervention"
          ? raw
          : "copilot-finanzas-cobertura";
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(scrollToCoberturaTarget);
    });
    return () => window.cancelAnimationFrame(id);
  }, [coberturaGuided]);

  useEffect(() => {
    if (!coberturaGuided) return;
    const onHashChange = () => {
      const raw = window.location.hash.replace(/^#/, "");
      if (raw === "copilot-finanzas-cobertura-acciones") {
        setCoberturaPasosOpen(true);
      }
      if (raw === "copilot-finanzas-fiscal-priority-intervention") {
        setFiscalPriorityGuideOpen(true);
      }
      const allowed = new Set([
        "copilot-finanzas-cobertura",
        "copilot-finanzas-cobertura-acciones",
        "copilot-finanzas-panorama",
        "copilot-finanzas-cobranza",
        "copilot-finanzas-fiscal",
        "copilot-finanzas-fiscal-priority-intervention",
      ]);
      if (raw && allowed.has(raw)) {
        document.getElementById(raw)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [coberturaGuided]);

  const paidObligationsCount = useMemo(
    () => taxObligations.filter((o) => o.status === "paid").length,
    [taxObligations]
  );

  const [overdueList, upcomingTotal] = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + 30);
    const t0 = today.toISOString().slice(0, 10);
    const t1 = horizon.toISOString().slice(0, 10);

    const overdue = taxObligations.filter((o) => {
      if (o.status === "paid") return false;
      if (o.status === "overdue") return true;
      return o.due_date.slice(0, 10) < t0;
    });

    const upcoming = taxObligations.filter((o) => {
      if (o.status === "paid") return false;
      const d = o.due_date.slice(0, 10);
      return d >= t0 && d <= t1;
    });

    const total = upcoming.reduce((acc, o) => acc + o.estimated_amount, 0);
    return [overdue, total] as const;
  }, [taxObligations]);

  const upcomingWindowCount = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 45);
    const s = start.toISOString().slice(0, 10);
    const e = end.toISOString().slice(0, 10);
    return taxObligations.filter((o) => {
      if (o.status === "paid") return false;
      const d = o.due_date.slice(0, 10);
      return d >= s && d <= e;
    }).length;
  }, [taxObligations]);

  const overdueCount = overdueList.length;

  const fiscalListObligations = useMemo(() => {
    const nonPaid = taxObligations.filter(
      (o) => String(o.status ?? "").toLowerCase() !== "paid"
    );
    return [...nonPaid]
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, 8);
  }, [taxObligations]);

  const nextOpen = useMemo(
    () => nearestOpenObligationDue(taxObligations),
    [taxObligations]
  );

  const deadlinePhrase = useMemo(() => {
    if (nextOpen) {
      return `Conviene cubrir el hueco antes del vencimiento más próximo (${dueLabel(nextOpen.due_date)} · ${mapTaxTypeLabel(nextOpen.tax_type)}).`;
    }
    return "Conveniencia: alinear cobros y pagos dentro del horizonte de egresos del motor (aprox. 30 días) antes de sumar compromisos nuevos.";
  }, [nextOpen]);

  const deficitGuidedBody = useMemo(
    () => buildDeficitGuidedCopy(snapshot, snapshotLoading),
    [snapshot, snapshotLoading]
  );

  const coberturaInvoices = useMemo(
    () => invoiceRows.filter(isOpenInvoiceRow),
    [invoiceRows]
  );

  const coberturaInvoiceStats = useMemo(() => {
    let balanceSum = 0;
    let weighted = 0;
    for (const r of coberturaInvoices) {
      const bal = rowNum(r.balance_amount);
      balanceSum += bal;
      weighted += bal * normalizedCollectionProbability(r.collection_probability);
    }
    return {
      count: coberturaInvoices.length,
      balanceSum,
      weighted,
    };
  }, [coberturaInvoices]);

  const todayYmd = financialEngineLocalTodayYmd();
  const futurePayments = useMemo(() => {
    let sum = 0;
    let n = 0;
    for (const p of paymentRows) {
      const py = ymdFromUnknown(p.payment_date);
      if (!py || py <= todayYmd) continue;
      const amt = rowNum(p.amount);
      if (amt > 0) {
        sum += amt;
        n += 1;
      }
    }
    return { sum, count: n };
  }, [paymentRows, todayYmd]);

  /** Sin cobranza esperada, sin facturas con saldo y sin pagos operativos futuros cargados. */
  const coberturaSinPalancasInternas = useMemo(() => {
    if (snapshotLoading || snapshotError != null || !snapshot) return false;
    if (coberturaDetailLoading || coberturaDetailError != null) return false;
    if (snapshotReceivablesRiskWeighted(snapshot) > 0) return false;
    if (coberturaInvoiceStats.count > 0) return false;
    if (futurePayments.count > 0) return false;
    return true;
  }, [
    snapshot,
    snapshotLoading,
    snapshotError,
    coberturaDetailLoading,
    coberturaDetailError,
    coberturaInvoiceStats.count,
    futurePayments.count,
  ]);

  const deficitGap = useMemo(() => {
    if (!snapshot || snapshotLiquidityBalance(snapshot) >= 0) return 0;
    return Math.abs(snapshotLiquidityBalance(snapshot));
  }, [snapshot]);

  const prioritaryObligation = useMemo(
    () => pickPrioritaryObligation(taxObligations),
    [taxObligations]
  );

  const coberturaOblTop = useMemo(() => {
    const open = taxObligations.filter(
      (o) => String(o.status ?? "").toLowerCase() !== "paid"
    );
    return [...open]
      .sort((a, b) => {
        const da = a.due_date.slice(0, 10);
        const db = b.due_date.slice(0, 10);
        if (da !== db) return da.localeCompare(db);
        return obligationPrincipal(b) - obligationPrincipal(a);
      })
      .slice(0, 3);
  }, [taxObligations]);

  const openOblCount = useMemo(
    () =>
      taxObligations.filter((o) => String(o.status ?? "").toLowerCase() !== "paid")
        .length,
    [taxObligations]
  );

  const cashImpactObligations = useMemo(() => {
    const open = taxObligations.filter(
      (o) => String(o.status ?? "").toLowerCase() !== "paid"
    );
    return sortObligationsForCashImpact(open, todayYmd).slice(0, 8);
  }, [taxObligations, todayYmd]);

  const finanzasHero = useMemo(() => {
    if (snapshotLoading) {
      return {
        title: "Sincronizando tu posición de caja",
        impact: "Cargando cifras del motor financiero…",
        urgency: "En segundos vas a ver el foco y la acción sugerida.",
      };
    }
    if (snapshotError) {
      return {
        title: "No pudimos leer el panorama financiero",
        impact: snapshotError,
        urgency: "Sin snapshot no podemos priorizar obligaciones frente a caja.",
      };
    }
    if (!snapshot) {
      return {
        title: "Panorama financiero no disponible",
        impact: "Todavía no hay datos suficientes para calcular caja y cobertura.",
        urgency: "Cargá movimientos en Datos para habilitar la lectura.",
      };
    }
    if (snapshotLiquidityBalance(snapshot) < 0) {
      return {
        title: "Tenés un déficit de caja proyectado",
        impact: `Hueco estimado: ${formatMoneyCompact(snapshotLiquidityBalance(snapshot))} en la ventana del motor.`,
        urgency: nextOpen
          ? `Urgencia: el próximo vencimiento relevante es ${dueLabel(nextOpen.due_date)} (${mapTaxTypeLabel(nextOpen.tax_type)}).`
          : "Conviene cerrar el hueco antes de asumir nuevos egresos.",
      };
    }
    if (
      snapshotCoverageRatio(snapshot) < 1 &&
      Number.isFinite(snapshotCoverageRatio(snapshot))
    ) {
      return {
        title: "La cobertura de caja es insuficiente",
        impact: `Ratio ${formatCoverageRatio(snapshotCoverageRatio(snapshot))}: caja más cobranza esperada no cubre egresos modelados.`,
        urgency: nextOpen
          ? `Próximo hito fiscal: ${dueLabel(nextOpen.due_date)} · ${mapTaxTypeLabel(nextOpen.tax_type)}.`
          : "Sin alinear cobros y pagos, el riesgo es de liquidez en días.",
      };
    }
    if (overdueCount > 0) {
      return {
        title: "Hay obligaciones vencidas o a regularizar",
        impact: `${overdueCount} obligación${overdueCount === 1 ? "" : "es"} en calendario que requieren foco.`,
        urgency: "Priorizá regularizar antes de desplazar caja a otros rubros.",
      };
    }
    return {
      title: "Tu liquidez está bajo control",
      impact: `Balance proyectado ${formatMoneyCompact(snapshotLiquidityBalance(snapshot))} · cobertura ${coverageRatioDisplay(snapshot).value}.`,
      urgency: nextOpen
        ? `Próximo vencimiento: ${dueLabel(nextOpen.due_date)} (${mapTaxTypeLabel(nextOpen.tax_type)}).`
        : "Mantené facturas y pagos actualizados en Datos para conservar esta lectura.",
    };
  }, [
    snapshot,
    snapshotLoading,
    snapshotError,
    nextOpen,
    overdueCount,
  ]);

  const finanzasMainCta = useMemo(() => {
    if (!snapshot || snapshotLoading) {
      return {
        href: "/copilot/finanzas#copilot-finanzas-panorama",
        label: "Ver panorama de liquidez",
      };
    }
    const band = snapshotRiskBand(snapshot);
    const stress =
      snapshotLiquidityBalance(snapshot) < 0 ||
      (snapshotCoverageRatio(snapshot) < 1 &&
        Number.isFinite(snapshotCoverageRatio(snapshot))) ||
      band === "high" ||
      band === "critical";
    if (stress) {
      return {
        href: "/copilot/finanzas?mode=cobertura&from=atencion-prioritaria#copilot-finanzas-cobertura",
        label: "Ver plan de cobertura",
      };
    }
    return {
      href: "/copilot/finanzas#copilot-finanzas-fiscal",
      label: "Resolver ahora",
    };
  }, [snapshot, snapshotLoading]);

  const externalValidated = false;
  const financialFlags = useMemo(
    () =>
      deriveFinancialFlags({
        invoices: operationalInvoices,
        asOfDate: snapshot?.as_of_date ?? null,
        externalFinancialValidation: externalValidated,
      }),
    [operationalInvoices, snapshot, externalValidated]
  );

  type RecommendedCoberturaAction =
    | {
        kind: "fiscal_priority";
        label: string;
        hint: string;
      }
    | { kind: "link"; href: string; label: string; hint: string };

  const recommendedCoberturaAction: RecommendedCoberturaAction = useMemo(() => {
    const tense =
      deficitGap > 0 ||
      (snapshot != null &&
        snapshotCoverageRatio(snapshot) < 1 &&
        Number.isFinite(snapshotCoverageRatio(snapshot)));
    if (openOblCount > 0 && tense && prioritaryObligation) {
      return {
        kind: "fiscal_priority",
        label: "Priorizar cobertura ahora",
        hint: "Abrimos la obligación más urgente y te llevamos al registro de pago en Datos.",
      };
    }
    if (coberturaInvoiceStats.count > 0 && coberturaInvoiceStats.weighted > 0) {
      return {
        kind: "link",
        href: "/copilot/datos",
        label: "Ejecutar plan recomendado",
        hint: "En Datos actualizá facturas y seguimiento de cobro.",
      };
    }
    if (futurePayments.count > 0) {
      return {
        kind: "link",
        href: "/copilot/datos",
        label: "Ejecutar plan recomendado",
        hint: "En Datos revisá pagos con fecha futura y lo que podés mover.",
      };
    }
    return {
      kind: "link",
      href: "/copilot/datos",
      label: "Ir a Datos",
      hint: "Todavía no hay suficiente detalle en facturas o pagos: cargá datos reales para que este plan sea medible.",
    };
  }, [
    openOblCount,
    deficitGap,
    snapshot,
    prioritaryObligation,
    coberturaInvoiceStats.count,
    coberturaInvoiceStats.weighted,
    futurePayments.count,
  ]);

  const prioritaryWhy = useMemo(() => {
    if (!prioritaryObligation) return "";
    const st = String(prioritaryObligation.status ?? "").toLowerCase();
    const base =
      "Es la obligación abierta con vencimiento más cercano; si varias comparten fecha, priorizamos la de mayor monto comprometido.";
    if (st === "overdue") {
      return `${base} Figura vencida: conviene regularizar antes de sumar otros egresos discrecionales.`;
    }
    return base;
  }, [prioritaryObligation]);

  const registrarPagoPrioritarioHref = useMemo(() => {
    const base = new URLSearchParams({
      entity: "payments",
      intent: "quick-add",
    });
    if (!prioritaryObligation) {
      return `/copilot/datos?${base.toString()}`;
    }
    base.set("obligation_id", prioritaryObligation.id);
    if (
      prioritaryObligation.company_id != null &&
      String(prioritaryObligation.company_id).trim() !== ""
    ) {
      base.set("company_id", String(prioritaryObligation.company_id).trim());
    }
    return `/copilot/datos?${base.toString()}`;
  }, [prioritaryObligation]);

  const editarObligacionHref = useMemo(() => {
    if (!prioritaryObligation) return "/copilot/datos";
    const p = new URLSearchParams({
      entity: "tax_obligations",
      intent: "edit-obligation",
      obligation_id: prioritaryObligation.id,
    });
    return `/copilot/datos?${p.toString()}`;
  }, [prioritaryObligation]);

  const openFiscalPriorityGuide = useCallback(() => {
    if (!prioritaryObligation) return;
    setFiscalPriorityGuideOpen(true);
    const run = () => {
      document
        .getElementById("copilot-finanzas-fiscal-priority-intervention")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.requestAnimationFrame(() => window.requestAnimationFrame(run));
  }, [prioritaryObligation]);

  const cobranzaImpactLine = useMemo(() => {
    if (!snapshot) return null;
    if (coberturaInvoiceStats.count === 0) return null;
    if (deficitGap > 0 && coberturaInvoiceStats.weighted > 0) {
      const pct = Math.min(
        100,
        Math.round((coberturaInvoiceStats.weighted / deficitGap) * 100)
      );
      if (coberturaInvoiceStats.weighted >= deficitGap) {
        return "Si ingresara la cobranza esperada ponderada por el motor, alcanzaría para cubrir el déficit proyectado (según los datos actuales).";
      }
      return `Si ingresara la cobranza esperada (${formatMoneyCompact(coberturaInvoiceStats.weighted)}), cubriría aproximadamente el ${pct}% del déficit proyectado (${formatMoneyCompact(deficitGap)}).`;
    }
    if (coberturaInvoiceStats.weighted > 0) {
      return `Cobranza esperada ponderada: ${formatMoneyCompact(coberturaInvoiceStats.weighted)} — mejora el colchón aunque hoy el balance proyectado no sea negativo.`;
    }
    return null;
  }, [snapshot, coberturaInvoiceStats, deficitGap]);

  const openCoberturaPasos = useCallback(() => {
    setCoberturaPasosOpen(true);
    const run = () =>
      document
        .getElementById("copilot-finanzas-cobertura-acciones")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.requestAnimationFrame(() => window.requestAnimationFrame(run));
  }, []);

  const openTaxEvidence = (id: string) => {
    setTaxObligationId(id);
    setIsTaxDrawerOpen(true);
  };

  const flowMax = snapshot
    ? Math.max(
        snapshotReceivablesRiskWeighted(snapshot),
        snapshotExpectedOutflowsTotal(snapshot),
        1
      )
    : 1;

  const guidedLinkClass =
    "text-sm font-medium text-[var(--copilot-ink-muted)] underline decoration-[var(--copilot-border)] underline-offset-4 transition hover:text-[var(--copilot-ink)]";

  const riskBand = snapshot ? snapshotRiskBand(snapshot) : null;
  const riskBandConfig = {
    low: { label: "Riesgo bajo", cls: "border-emerald-200/70 bg-emerald-50/40 text-emerald-900" },
    medium: { label: "Riesgo moderado", cls: "border-amber-200/70 bg-amber-50/40 text-amber-900" },
    high: { label: "Riesgo alto", cls: "border-rose-200/70 bg-rose-50/40 text-rose-900" },
    critical: { label: "Riesgo crítico", cls: "border-rose-300/80 bg-rose-50/60 text-rose-950" },
  } as const;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        surfaceId="copilot.finanzas"
        title="Finanzas"
        description={
          coberturaGuided
            ? "Modo cobertura: foco en caja, ingresos esperados y egresos modelados."
            : "Panel ejecutivo — posición de caja, cobranza y riesgo en una sola vista."
        }
      />

      <div className={copilotPageMainClass}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <FinancialStatusBadge flags={financialFlags} />
            <span className="text-xs text-[var(--copilot-ink-muted)]">
              {financialFlags.open_invoices_count > 0
                ? `${financialFlags.open_invoices_count} factura(s) con saldo operativo abierto.`
                : FINANCIAL_UX_COPY.noOpenBalanceInActiveInvoices}
            </span>
          </div>
          <FinancialWarningBanner body={FINANCIAL_UX_COPY.reportWarningBody} />
          <DataFreshnessBanner freshness={financialFlags} />
        </div>
        {coberturaGuided ? (
          <div
            id="copilot-finanzas-cobertura"
            className="scroll-mt-36 sm:scroll-mt-40"
          >
          <CopilotCard className="border-[rgba(31,107,74,0.28)] bg-[rgba(31,107,74,0.07)] ring-1 ring-[rgba(31,107,74,0.12)]">
            <CopilotSectionTitle
              title="Resolver déficit de caja"
              subtitle="Venís de Atención prioritaria — este es el plan de lectura inmediata."
            />
            <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink)]">
              {deficitGuidedBody} {deadlinePhrase}
            </p>
            <p className="mt-3 text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
              No hay simulador automático acá: los pasos usan los mismos datos que el motor de
              Finanzas (proto_*). Lo accionable está abajo cuando lo abrís.
            </p>
            {coberturaSinPalancasInternas ? (
              <p className="mt-3 rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-xs leading-relaxed text-amber-950">
                Con los datos actuales no hay cobranza esperada ni pagos futuros registrados para
                mover: al abrir pasos el foco pasa a{" "}
                <span className="font-semibold">generar ingresos</span> u otras palancas fuera de
                cartera.
              </p>
            ) : null}
            <div className="mt-6">
              {!coberturaPasosOpen ? (
                <CopilotPrimaryButton
                  type="button"
                  onClick={openCoberturaPasos}
                  className="w-full justify-center sm:w-auto"
                >
                  Cómo cubrir el déficit ahora
                </CopilotPrimaryButton>
              ) : (
                <CopilotGhostButton
                  type="button"
                  onClick={() => setCoberturaPasosOpen(false)}
                  className="text-sm font-semibold"
                >
                  Ocultar pasos
                </CopilotGhostButton>
              )}
            </div>
            <p className="mt-4 text-xs text-[var(--copilot-ink-muted)]">
              <Link
                href="/copilot/atencion-prioritaria"
                className="font-semibold text-[var(--copilot-ink)] underline-offset-2 hover:underline"
              >
                Volver a Atención prioritaria
              </Link>
            </p>
          </CopilotCard>

          {coberturaPasosOpen ? (
            <div
              id="copilot-finanzas-cobertura-acciones"
              className="scroll-mt-36 sm:scroll-mt-40"
            >
              <CopilotCard className="mt-4 border-[rgba(31,107,74,0.2)] bg-white/90">
                {coberturaSinPalancasInternas ? (
                  <>
                    <CopilotSectionTitle
                      title="No hay cobertura con la información actual"
                      subtitle="El motor no ve palancas de cartera para cerrar el hueco con lo cargado hoy."
                    />
                    <p className="mt-3 text-sm leading-relaxed text-[var(--copilot-ink)]">
                      No hay facturas a cobrar ni pagos a reprogramar que permitan cubrir el déficit.
                      Para resolver esta situación, necesitás generar ingresos o financiamiento
                      externo.
                    </p>

                    <div className="mt-6 space-y-4 rounded-xl border border-[var(--copilot-border)] bg-[rgba(31,107,74,0.04)] p-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-accent)]">
                          A. Activar cobranza manual
                        </p>
                        <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
                          Seguí deudores y acuerdos en{" "}
                          <Link
                            href="/copilot/clientes"
                            className="font-semibold text-[var(--copilot-accent)] underline-offset-2 hover:underline"
                          >
                            Clientes
                          </Link>
                          . Para contactos puntuales usá{" "}
                          <Link
                            href="/copilot/datos"
                            className="font-semibold text-[var(--copilot-accent)] underline-offset-2 hover:underline"
                          >
                            Datos → Contactos
                          </Link>
                          .
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-accent)]">
                          B. Generar ingresos urgentes
                        </p>
                        <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
                          Revisá lecturas comerciales y prioridades en{" "}
                          <Link
                            href="/copilot/insights"
                            className="font-semibold text-[var(--copilot-accent)] underline-offset-2 hover:underline"
                          >
                            Insights
                          </Link>{" "}
                          (no sustituye un CRM de ventas, pero concentra señales con la base
                          actual).
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-accent)]">
                          C. Revisar financiamiento
                        </p>
                        <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">
                          Líneas de crédito, factoring o aportes requieren decisión fuera de Copilot.
                          Cuando cierres un acuerdo, registrá pagos y movimientos en Datos para que
                          el semáforo refleje la mejora.
                        </p>
                      </div>
                    </div>

                    <div className="mt-6">
                      <CopilotGhostLink
                        href="/copilot/clientes"
                        className="inline-flex w-full justify-center rounded-xl border border-[var(--copilot-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--copilot-accent)] sm:w-auto"
                      >
                        Generar ingreso urgente
                      </CopilotGhostLink>
                    </div>

                    <nav
                      className="mt-5 flex flex-col gap-2 border-t border-[var(--copilot-border)] pt-4 sm:flex-row sm:flex-wrap sm:gap-x-8"
                      aria-label="Atajos modo sin palancas internas"
                    >
                      <Link href="/copilot/datos" className={guidedLinkClass}>
                        Abrir Datos (contactos y facturas)
                      </Link>
                      <Link href="/copilot/insights" className={guidedLinkClass}>
                        Ir a Insights
                      </Link>
                      <Link
                        href={`${FINANZAS_COBERTURA_QUERY}#copilot-finanzas-fiscal`}
                        className={guidedLinkClass}
                      >
                        Revisar obligaciones fiscales
                      </Link>
                    </nav>
                  </>
                ) : (
                  <>
                    <CopilotSectionTitle
                      title="Cómo cubrir el déficit ahora"
                      subtitle="Tres palancas reales. Si falta data en Supabase, lo decimos sin inventar números."
                    />

                    <div className="mt-5 space-y-5">
                      <div className="rounded-xl border border-[var(--copilot-border)] bg-[rgba(31,107,74,0.04)] p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-accent)]">
                          A. Cobros posibles
                        </p>
                        {coberturaDetailLoading ? (
                          <p className="mt-2 flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            Cargando facturas…
                          </p>
                        ) : coberturaDetailError ? (
                          <p className="mt-2 text-sm text-amber-900">{coberturaDetailError}</p>
                        ) : coberturaInvoiceStats.count === 0 ? (
                          <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
                            No hay facturas con saldo pendiente en la base (o todas figuran pagadas
                            / canceladas). Cargá facturas emitidas o parciales en Datos para ver acá
                            montos y cobranza esperada.
                          </p>
                        ) : (
                          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-[var(--copilot-ink)]">
                            <li>
                              <span className="font-semibold">Facturas con saldo:</span>{" "}
                              {coberturaInvoiceStats.count}
                            </li>
                            <li>
                              <span className="font-semibold">Saldo total a cobrar:</span>{" "}
                              {formatMoneyCompact(coberturaInvoiceStats.balanceSum)}
                            </li>
                            <li>
                              <span className="font-semibold">Cobranza esperada (ponderada):</span>{" "}
                              {formatMoneyCompact(coberturaInvoiceStats.weighted)} — misma lógica
                              que “Ingresos esperados” del panorama.
                            </li>
                            {cobranzaImpactLine ? (
                              <li className="text-[var(--copilot-ink-muted)]">
                                {cobranzaImpactLine}
                              </li>
                            ) : null}
                          </ul>
                        )}
                      </div>

                      <div className="rounded-xl border border-[var(--copilot-border)] bg-[rgba(31,107,74,0.04)] p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-accent)]">
                          B. Pagos a revisar
                        </p>
                        {coberturaDetailLoading ? (
                          <p className="mt-2 flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            Cargando pagos…
                          </p>
                        ) : coberturaDetailError ? (
                          <p className="mt-2 text-sm text-amber-900">{coberturaDetailError}</p>
                        ) : futurePayments.count === 0 ? (
                          <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
                            No registramos pagos operativos con fecha estrictamente futura a hoy. Si
                            hay compromisos que aún no cargaste, sumalos en Datos para que el motor
                            pueda mostrar margen de reprogramación.
                          </p>
                        ) : (
                          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-[var(--copilot-ink)]">
                            <li>
                              <span className="font-semibold">Pagos futuros (registrados):</span>{" "}
                              {futurePayments.count} · total{" "}
                              {formatMoneyCompact(futurePayments.sum)}
                            </li>
                            <li className="text-[var(--copilot-ink-muted)]">
                              Reprogramar o negociar plazos sobre esos egresos reduce la presión
                              sobre caja sin tocar obligaciones fiscales ya vencidas. El motor ya
                              suma egresos modelados en{" "}
                              {snapshot
                                ? formatMoneyCompact(snapshotExpectedOutflowsTotal(snapshot))
                                : "el panorama"}
                              .
                            </li>
                          </ul>
                        )}
                      </div>

                      <div className="rounded-xl border border-[var(--copilot-border)] bg-[rgba(31,107,74,0.04)] p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-accent)]">
                          C. Obligaciones a priorizar
                        </p>
                        {taxLoading ? (
                          <p className="mt-2 flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            Cargando obligaciones…
                          </p>
                        ) : taxError ? (
                          <p className="mt-2 text-sm text-amber-900">{taxError}</p>
                        ) : openOblCount === 0 ? (
                          <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
                            No hay obligaciones fiscales abiertas en el prototipo. Si en la realidad
                            sí las tenés, sincronizá `proto_tax_obligations` para listarlas acá.
                          </p>
                        ) : (
                          <ul className="mt-2 space-y-2 text-sm text-[var(--copilot-ink)]">
                            {coberturaOblTop.map((o) => (
                              <li
                                key={o.id}
                                className="flex flex-wrap justify-between gap-2 border-b border-[var(--copilot-border)] border-dashed pb-2 last:border-0 last:pb-0"
                              >
                                <span className="font-medium">
                                  {mapTaxTypeLabel(o.tax_type)}
                                </span>
                                <span className="tabular-nums text-[var(--copilot-ink-muted)]">
                                  Vence {dueLabel(o.due_date)} ·{" "}
                                  {formatMoneyCompact(o.estimated_amount)}
                                </span>
                              </li>
                            ))}
                            {openOblCount > 3 ? (
                              <li className="text-xs text-[var(--copilot-ink-muted)]">
                                +{openOblCount - 3} obligación
                                {openOblCount - 3 === 1 ? "" : "es"} más en la sección de abajo.
                              </li>
                            ) : null}
                          </ul>
                        )}
                      </div>
                    </div>

                    <p className="mt-4 text-xs text-[var(--copilot-ink-muted)]">
                      {recommendedCoberturaAction.hint}
                    </p>
                    <div className="mt-4">
                      {fiscalPriorityGuideOpen &&
                      recommendedCoberturaAction.kind === "fiscal_priority" ? (
                        <p className="text-sm text-[var(--copilot-ink-muted)]">
                          Intervención fiscal abierta debajo.{" "}
                          <button
                            type="button"
                            className="font-semibold text-[var(--copilot-accent)] underline-offset-2 hover:underline"
                            onClick={() => setFiscalPriorityGuideOpen(false)}
                          >
                            Cerrar panel fiscal
                          </button>
                        </p>
                      ) : recommendedCoberturaAction.kind === "fiscal_priority" ? (
                        <CopilotGhostButton
                          type="button"
                          onClick={openFiscalPriorityGuide}
                          className="w-full justify-center rounded-xl border border-[var(--copilot-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--copilot-accent)] sm:w-auto"
                        >
                          {recommendedCoberturaAction.label}
                        </CopilotGhostButton>
                      ) : (
                        <CopilotGhostLink
                          href={recommendedCoberturaAction.href}
                          className="inline-flex w-full justify-center rounded-xl border border-[var(--copilot-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--copilot-accent)] sm:w-auto"
                        >
                          {recommendedCoberturaAction.label}
                        </CopilotGhostLink>
                      )}
                    </div>

                    <nav
                      className="mt-5 flex flex-col gap-2 border-t border-[var(--copilot-border)] pt-4 sm:flex-row sm:flex-wrap sm:gap-x-8"
                      aria-label="Atajos de cobertura"
                    >
                      <Link
                        href={`${FINANZAS_COBERTURA_QUERY}#copilot-finanzas-cobranza`}
                        className={guidedLinkClass}
                      >
                        Ver cobranzas pendientes
                      </Link>
                      <Link
                        href="/copilot/datos?entity=invoices&intent=quick-add"
                        className={guidedLinkClass}
                      >
                        Registrar cobro
                      </Link>
                      <Link href="/copilot/datos" className={guidedLinkClass}>
                        Revisar pagos
                      </Link>
                      <Link
                        href={`${FINANZAS_COBERTURA_QUERY}#copilot-finanzas-fiscal`}
                        className={guidedLinkClass}
                      >
                        Revisar obligaciones
                      </Link>
                    </nav>
                  </>
                )}
              </CopilotCard>
            </div>
          ) : null}
          </div>
        ) : null}

        {!coberturaGuided ? (
          <>
            {/* ── Hero ejecutivo ─────────────────────────────────────────────── */}
            <div id="copilot-finanzas-decision-hero" className="scroll-mt-28">
              <CopilotCard className="border-[rgba(31,107,74,0.22)] bg-[rgba(31,107,74,0.06)] ring-1 ring-[rgba(31,107,74,0.1)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-accent)]">
                      Situación principal
                    </p>
                    <h2 className="mt-2 text-xl font-semibold tracking-tight text-[var(--copilot-ink)] sm:text-2xl">
                      {finanzasHero.title}
                    </h2>
                    <p className="mt-3 text-sm font-medium leading-relaxed text-[var(--copilot-ink)]">
                      {finanzasHero.impact}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
                      {finanzasHero.urgency}
                    </p>
                  </div>
                  {riskBand && riskBandConfig[riskBand] ? (
                    <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold ${riskBandConfig[riskBand].cls}`}>
                      {riskBandConfig[riskBand].label}
                    </span>
                  ) : null}
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <CopilotPrimaryLink
                    href={finanzasMainCta.href}
                    className="shadow-sm"
                  >
                    {finanzasMainCta.label}
                  </CopilotPrimaryLink>
                  {predictiveHint && predictiveHint.total > 0 ? (
                    <CopilotGhostLink
                      href="/copilot/alertas"
                      className="text-sm font-medium"
                    >
                      {predictiveHint.total} alerta{predictiveHint.total === 1 ? "" : "s"}
                      {predictiveHint.critical > 0 ? ` · ${predictiveHint.critical} crítica${predictiveHint.critical === 1 ? "" : "s"}` : ""} →
                    </CopilotGhostLink>
                  ) : null}
                </div>
              </CopilotCard>
            </div>

            {/* ── KPIs de liquidez ───────────────────────────────────────────── */}
            <div id="copilot-finanzas-panorama" className="scroll-mt-28">
              {snapshotLoading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-[var(--copilot-ink-muted)]">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Calculando posición financiera…
                </div>
              ) : snapshotError ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
                  {snapshotError}
                </div>
              ) : snapshot ? (
                <div className="space-y-4">
                  {/* KPI grid */}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-xl border border-[var(--copilot-border)] bg-white/85 p-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        Neto acumulado
                      </p>
                      <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--copilot-ink)]">
                        {formatMoneyCompact(snapshotCashNet(snapshot))}
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--copilot-ink-muted)]">
                        Cobros acumulados − pagos registrados · distinto de caja en Tesorería
                      </p>
                    </div>
                    <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/30 p-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-900/70">
                        Cobranza esperada
                      </p>
                      <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-800">
                        {formatMoneyCompact(snapshotReceivablesRiskWeighted(snapshot))}
                      </p>
                      <p className="mt-1 text-[11px] text-emerald-900/60">
                        Facturas abiertas × probabilidad de cobro · no es caja disponible
                      </p>
                    </div>
                    <div className="rounded-xl border border-rose-200/60 bg-rose-50/30 p-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-900/70">
                        Egresos proyectados
                      </p>
                      <p className="mt-2 text-2xl font-semibold tabular-nums text-rose-800">
                        {formatMoneyCompact(snapshotExpectedOutflowsTotal(snapshot))}
                      </p>
                      <p className="mt-1 text-[11px] text-rose-900/60">
                        Pagos operativos post-hoy + obligaciones fiscales próximas 30 d
                      </p>
                    </div>
                    <div className={`rounded-xl border p-4 shadow-sm ${
                      snapshotLiquidityBalance(snapshot) < 0
                        ? "border-rose-200/70 bg-rose-50/30"
                        : "border-[var(--copilot-border)] bg-white/85"
                    }`}>
                      <p className={`text-[11px] font-semibold uppercase tracking-wide ${
                        snapshotLiquidityBalance(snapshot) < 0
                          ? "text-rose-900/70"
                          : "text-[var(--copilot-ink-muted)]"
                      }`}>
                        Balance proyectado
                      </p>
                      <p className={`mt-2 text-2xl font-semibold tabular-nums ${
                        snapshotLiquidityBalance(snapshot) < 0
                          ? "text-rose-800"
                          : "text-[var(--copilot-ink)]"
                      }`}>
                        {formatMoneyCompact(snapshotLiquidityBalance(snapshot))}
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--copilot-ink-muted)]">
                        Neto + cobranza esperada − egresos proyectados
                      </p>
                    </div>
                    {(() => {
                      const { value: cvDisplay, isNoOutflows } = coverageRatioDisplay(snapshot);
                      const isBelow1 = !isNoOutflows &&
                        snapshotCoverageRatio(snapshot) < 1 &&
                        Number.isFinite(snapshotCoverageRatio(snapshot));
                      return (
                        <div className={`rounded-xl border p-4 shadow-sm sm:col-span-1 lg:col-span-2 ${
                          isBelow1
                            ? "border-amber-200/70 bg-amber-50/30"
                            : "border-[var(--copilot-border)] bg-white/85"
                        }`}>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                            Ratio de cobertura
                          </p>
                          <p className={`mt-2 text-2xl font-semibold tabular-nums ${
                            isBelow1 ? "text-amber-800" : "text-[var(--copilot-ink)]"
                          }`}>
                            {cvDisplay}
                          </p>
                          <p className="mt-1 text-[11px] text-[var(--copilot-ink-muted)]">
                            {isNoOutflows
                              ? "No hay egresos operativos ni fiscales modelados en el horizonte de 30 días."
                              : "(neto + cobranza esperada) / egresos proyectados · meta ≥ 1,00×"}
                          </p>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Flujo proyectado — forward-looking, no es período */}
                  <div
                    id="copilot-finanzas-cobranza"
                    className="scroll-mt-28 rounded-xl border border-[var(--copilot-border)] bg-white/60 p-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        Flujo proyectado de caja
                      </p>
                      <p className="text-[10px] text-[var(--copilot-ink-muted)]">
                        Proyección forward-looking · no es facturación del período
                      </p>
                    </div>
                    <div className="mt-3 space-y-3">
                      <FlowBar
                        label="Cobranza esperada (facturas × prob. de cobro)"
                        value={snapshotReceivablesRiskWeighted(snapshot)}
                        max={flowMax}
                        flow="in"
                      />
                      <FlowBar
                        label="Egresos proyectados (operativos + fiscal 30 d)"
                        value={snapshotExpectedOutflowsTotal(snapshot)}
                        max={flowMax}
                        flow="out"
                      />
                    </div>
                    {snapshot.by_currency ? (
                      <div className="mt-4 border-t border-[var(--copilot-border)] pt-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                          Desglose por moneda
                        </p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {(["UYU", "USD"] as const).map((cur) => {
                            const totals = snapshot.by_currency![cur];
                            if (!totals) return null;
                            return (
                              <div key={cur} className="rounded-lg border border-[var(--copilot-border)] bg-white/70 p-3">
                                <p className="text-xs font-semibold text-[var(--copilot-ink)]">{cur}</p>
                                <dl className="mt-1.5 space-y-1 text-xs text-[var(--copilot-ink-muted)]">
                                  {totals.invoiced !== undefined ? (
                                    <div className="flex justify-between gap-2">
                                      <dt>Facturado</dt>
                                      <dd className="tabular-nums text-[var(--copilot-ink)]">
                                        {totals.invoiced.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                                      </dd>
                                    </div>
                                  ) : null}
                                  {totals.pending !== undefined ? (
                                    <div className="flex justify-between gap-2">
                                      <dt>Pendiente</dt>
                                      <dd className="tabular-nums text-[var(--copilot-ink)]">
                                        {totals.pending.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                                      </dd>
                                    </div>
                                  ) : null}
                                  {totals.overdue !== undefined && totals.overdue > 0 ? (
                                    <div className="flex justify-between gap-2">
                                      <dt>Vencido</dt>
                                      <dd className="tabular-nums font-semibold text-amber-900">
                                        {totals.overdue.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                                      </dd>
                                    </div>
                                  ) : null}
                                </dl>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : snapshot.meta.currency === "unspecified" || snapshot.meta.currency === "mixed" ? (
                      <p className="mt-3 text-[11px] text-[var(--copilot-ink-muted)]">
                        Montos multi-moneda (UYU + USD) — desglose por moneda pendiente.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            {/* ── Obligaciones prioritarias — impacto en caja ────────────────── */}
            <CopilotCard className="border-[var(--copilot-border)]">
              <CopilotSectionTitle
                title="Impacto en caja"
                subtitle="Obligaciones fiscales ordenadas por urgencia y monto comprometido."
              />
              {taxLoading ? (
                <div className="mt-4 flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Cargando obligaciones…
                </div>
              ) : taxError ? (
                <p className="mt-4 text-sm text-amber-900">{taxError}</p>
              ) : cashImpactObligations.length === 0 ? (
                <p className="mt-4 text-sm text-[var(--copilot-ink-muted)]">
                  No hay obligaciones abiertas que impacten la caja en el calendario cargado.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {cashImpactObligations.map((o) => {
                    const ps = getPrimaryObligationState(o, todayYmd);
                    const hint = getObligationSecondaryHint(o, ps);
                    const activeDrawer = isTaxDrawerOpen && taxObligationId === o.id;
                    return (
                      <li
                        key={o.id}
                        className={`flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[var(--copilot-border)] bg-white/90 px-4 py-3 ${
                          activeDrawer ? "ring-2 ring-[rgba(31,107,74,0.22)]" : ""
                        }`}
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-[var(--copilot-ink)]">
                              {mapTaxTypeLabel(o.tax_type)}
                            </span>
                            <CopilotObligationPrimaryBadge state={ps} />
                          </div>
                          <p className="text-xs text-[var(--copilot-ink-muted)]">
                            {o.period_label} · Vence {dueLabel(o.due_date)}
                          </p>
                          {hint ? (
                            <p className="text-[11px] leading-snug text-[var(--copilot-ink-muted)]">
                              {hint}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                          <span className="text-sm font-semibold tabular-nums text-[var(--copilot-ink)]">
                            {formatMoneyCompact(obligationPrincipal(o))}
                          </span>
                          <CopilotGhostButton
                            type="button"
                            className="whitespace-nowrap px-3 py-1.5 text-xs"
                            onClick={() => openTaxEvidence(o.id)}
                          >
                            Ver respaldo
                          </CopilotGhostButton>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CopilotCard>
          </>
        ) : null}

        {/* ── Señales predictivas — solo modo cobertura (normal: inlined en hero) ── */}
        {coberturaGuided && predictiveHint && predictiveHint.total > 0 ? (
          <CopilotCard className="border-sky-200/70 bg-sky-50/35">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-950/85">
              Señales predictivas
            </p>
            <p className="mt-2 text-sm font-semibold text-sky-950">
              {predictiveHint.total} alerta{predictiveHint.total === 1 ? "" : "s"} desde
              caja y calendario fiscal
              {predictiveHint.critical > 0
                ? ` · ${predictiveHint.critical} crítica${predictiveHint.critical === 1 ? "" : "s"}`
                : ""}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-sky-900/80">
              Incluye liquidez proyectada, colchón de cobertura, vencidas sin acreditación
              fiscal y pagos de impuestos sin obligación vinculada.
            </p>
            <CopilotGhostLink
              href="/copilot/alertas"
              className="mt-3 inline-flex text-sm font-semibold text-sky-950"
            >
              Abrir en Alertas →
            </CopilotGhostLink>
          </CopilotCard>
        ) : null}

        {/* ── Panorama de liquidez — solo modo cobertura (normal: KPI grid arriba) ── */}
        {coberturaGuided ? (
          <FinanzasPanoramaSection coberturaGuided={coberturaGuided}>
            <CopilotCard className="border-[rgba(31,107,74,0.16)] bg-[rgba(31,107,74,0.03)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <CopilotSectionTitle
                  title="Panorama de liquidez"
                  subtitle="Misma base que Inicio y Alertas: recibos, pagos, facturas abiertas y obligaciones fiscales."
                />
                {snapshot && !snapshotLoading ? (
                  <CopilotSeverityBadge severity={snapshotRiskBand(snapshot)} />
                ) : null}
              </div>
              <p className="mt-2 text-xs text-[var(--copilot-ink-muted)]">
                Basado en flujo real de ingresos, egresos y obligaciones fiscales.
              </p>
              {snapshotLoading ? (
                <div className="mt-6 flex items-center gap-2 text-sm text-[var(--copilot-ink-muted)]">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Calculando snapshot financiero…
                </div>
              ) : null}
              {snapshotError ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
                  {snapshotError}
                </div>
              ) : null}
              {!snapshotLoading && !snapshotError && snapshot ? (
                <div className="mt-6 space-y-6">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-xl border border-[var(--copilot-border)] bg-white/85 p-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">Caja disponible</p>
                      <p className="mt-2 text-xl font-semibold tabular-nums text-[var(--copilot-ink)]">{formatMoneyCompact(snapshotCashNet(snapshot))}</p>
                    </div>
                    <div className="rounded-xl border border-[var(--copilot-border)] bg-white/85 p-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">Ingresos esperados</p>
                      <p className="mt-2 text-xl font-semibold tabular-nums text-emerald-700">{formatMoneyCompact(snapshotReceivablesRiskWeighted(snapshot))}</p>
                      <p className="mt-1 text-[11px] text-[var(--copilot-ink-muted)]">Facturas abiertas × probabilidad de cobro</p>
                    </div>
                    <div className="rounded-xl border border-[var(--copilot-border)] bg-white/85 p-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">Egresos esperados</p>
                      <p className="mt-2 text-xl font-semibold tabular-nums text-red-600">{formatMoneyCompact(snapshotExpectedOutflowsTotal(snapshot))}</p>
                      <p className="mt-1 text-[11px] text-[var(--copilot-ink-muted)]">Pagos futuros + fiscal pendiente (30 días)</p>
                    </div>
                    <div className="rounded-xl border border-[var(--copilot-border)] bg-white/85 p-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">Balance proyectado</p>
                      <p className="mt-2 text-xl font-semibold tabular-nums text-[var(--copilot-ink)]">{formatMoneyCompact(snapshotLiquidityBalance(snapshot))}</p>
                    </div>
                    <div className="rounded-xl border border-[var(--copilot-border)] bg-white/85 p-4 shadow-sm sm:col-span-2 lg:col-span-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">Ratio de cobertura</p>
                      <p className="mt-2 text-xl font-semibold tabular-nums text-[var(--copilot-ink)]">{coverageRatioDisplay(snapshot).value}</p>
                      <p className="mt-1 text-[11px] text-[var(--copilot-ink-muted)]">
                        {coverageRatioDisplay(snapshot).isNoOutflows
                          ? "Sin egresos operativos ni fiscales modelados en el horizonte."
                          : "(caja + ingresos esperados) / egresos esperados"}
                      </p>
                    </div>
                  </div>
                  {snapshot.by_currency ? (
                    <div className="rounded-xl border border-[var(--copilot-border)] bg-white/60 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">Desglose por moneda</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {(["UYU", "USD"] as const).map((cur) => {
                          const totals = snapshot.by_currency![cur];
                          if (!totals) return null;
                          return (
                            <div key={cur} className="rounded-lg border border-[var(--copilot-border)] bg-white/70 p-3">
                              <p className="text-xs font-semibold text-[var(--copilot-ink)]">{cur}</p>
                              <dl className="mt-2 space-y-1 text-xs text-[var(--copilot-ink-muted)]">
                                {totals.invoiced !== undefined ? (
                                  <div className="flex justify-between gap-2"><dt>Facturado</dt><dd className="tabular-nums text-[var(--copilot-ink)]">{totals.invoiced.toLocaleString("es-AR", { maximumFractionDigits: 0 })}</dd></div>
                                ) : null}
                                {totals.pending !== undefined ? (
                                  <div className="flex justify-between gap-2"><dt>Pendiente</dt><dd className="tabular-nums text-[var(--copilot-ink)]">{totals.pending.toLocaleString("es-AR", { maximumFractionDigits: 0 })}</dd></div>
                                ) : null}
                                {totals.overdue !== undefined && totals.overdue > 0 ? (
                                  <div className="flex justify-between gap-2"><dt>Vencido</dt><dd className="tabular-nums font-semibold text-amber-900">{totals.overdue.toLocaleString("es-AR", { maximumFractionDigits: 0 })}</dd></div>
                                ) : null}
                              </dl>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : snapshot.meta.currency === "unspecified" || snapshot.meta.currency === "mixed" ? (
                    <p className="text-[11px] text-[var(--copilot-ink-muted)]">Montos multi-moneda (UYU + USD) — desglose por moneda pendiente.</p>
                  ) : null}
                  <div id="copilot-finanzas-cobranza" className="scroll-mt-28 space-y-3 rounded-xl border border-[var(--copilot-border)] bg-white/60 p-4">
                    <p className="text-xs font-semibold text-[var(--copilot-ink)]">Cobranza esperada vs egresos esperados</p>
                    <FlowBar label="Cobranza ponderada" value={snapshotReceivablesRiskWeighted(snapshot)} max={flowMax} flow="in" />
                    <FlowBar label="Salidas modeladas" value={snapshotExpectedOutflowsTotal(snapshot)} max={flowMax} flow="out" />
                  </div>
                </div>
              ) : null}
            </CopilotCard>
          </FinanzasPanoramaSection>
        ) : null}

        {/* ── Sección fiscal ─────────────────────────────────────────────────── */}
        <div id="copilot-finanzas-fiscal" className="scroll-mt-28 space-y-4">
          {coberturaGuided && fiscalPriorityGuideOpen ? (
            prioritaryObligation ? (
              <div
                id="copilot-finanzas-fiscal-priority-intervention"
                className="scroll-mt-36 sm:scroll-mt-40"
              >
                <CopilotCard className="border-[rgba(31,107,74,0.32)] bg-[rgba(31,107,74,0.09)] ring-1 ring-[rgba(31,107,74,0.18)]">
                  <CopilotSectionTitle
                    title="Resolver obligación prioritaria"
                    subtitle="Intervención guiada sobre la fila más urgente del calendario fiscal."
                  />
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        Impuesto
                      </dt>
                      <dd className="mt-0.5 font-medium text-[var(--copilot-ink)]">
                        {mapTaxTypeLabel(prioritaryObligation.tax_type)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        Período
                      </dt>
                      <dd className="mt-0.5 text-[var(--copilot-ink)]">
                        {prioritaryObligation.period_label}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        Vencimiento
                      </dt>
                      <dd className="mt-0.5 capitalize text-[var(--copilot-ink)]">
                        {formatDueFull(prioritaryObligation.due_date)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        Monto
                      </dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-[var(--copilot-ink)]">
                        {formatMoneyCompact(obligationPrincipal(prioritaryObligation))}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        Estado
                      </dt>
                      <dd className="mt-0.5">
                        <span
                          className={sharedObligationPaymentStatusPillClass(
                            prioritaryObligation.status
                          )}
                        >
                          {mapTaxObligationStatus(prioritaryObligation.status)}
                        </span>
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-4 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
                    {prioritaryWhy}
                  </p>

                  <div className="mt-5 rounded-xl border border-[var(--copilot-border)] bg-white/70 p-4">
                    <p className="text-xs font-semibold text-[var(--copilot-ink)]">
                      Próximos pasos posibles
                    </p>
                    <ul className="mt-3 space-y-2 text-sm text-[var(--copilot-ink-muted)]">
                      <li>
                        <span className="font-semibold text-[var(--copilot-ink)]">
                          Registrar pago ahora:
                        </span>{" "}
                        cargá el pago en Datos vinculado a esta obligación para que caja y alertas
                        se actualicen.
                      </li>
                      <li>
                        <span className="font-semibold text-[var(--copilot-ink)]">
                          Revisar / editar obligación:
                        </span>{" "}
                        corregí monto confirmado, fechas o estado si el dato en base no refleja la
                        realidad.
                      </li>
                      <li>
                        <span className="font-semibold text-[var(--copilot-ink)]">
                          Ver respaldo documental:
                        </span>{" "}
                        comprobá comprobantes y trazabilidad antes de ejecutar el pago.
                      </li>
                    </ul>
                  </div>

                  <div className="mt-5">
                    <CopilotPrimaryLink
                      href={registrarPagoPrioritarioHref}
                      className="w-full justify-center sm:inline-flex sm:w-auto"
                    >
                      Registrar pago prioritario
                    </CopilotPrimaryLink>
                  </div>

                  <nav
                    className="mt-4 flex flex-col gap-2 border-t border-[var(--copilot-border)] pt-4 sm:flex-row sm:flex-wrap sm:gap-x-6"
                    aria-label="Acciones secundarias obligación prioritaria"
                  >
                    <Link href={editarObligacionHref} className={guidedLinkClass}>
                      Editar obligación
                    </Link>
                    <button
                      type="button"
                      onClick={() => openTaxEvidence(prioritaryObligation.id)}
                      className={guidedLinkClass}
                    >
                      Ver respaldo
                    </button>
                    <Link
                      href={`${FINANZAS_COBERTURA_QUERY}#copilot-finanzas-cobertura-acciones`}
                      className={guidedLinkClass}
                      onClick={() => setFiscalPriorityGuideOpen(false)}
                    >
                      Volver al plan de cobertura
                    </Link>
                  </nav>
                </CopilotCard>
              </div>
            ) : (
              <CopilotCard className="border-amber-200/80 bg-amber-50/50">
                <p className="text-sm font-semibold text-amber-950">
                  No hay obligación prioritaria en la base
                </p>
                <p className="mt-2 text-sm text-amber-900/90">
                  Pediste priorizar cobertura fiscal pero no quedan obligaciones abiertas cargadas.
                  Revisá Datos o sincronizá obligaciones; podés{" "}
                  <button
                    type="button"
                    className="font-semibold underline-offset-2 hover:underline"
                    onClick={() => setFiscalPriorityGuideOpen(false)}
                  >
                    cerrar este panel
                  </button>
                  .
                </p>
              </CopilotCard>
            )
          ) : null}

            <FinanzasFiscalCalendarCollapsible coberturaGuided={coberturaGuided}>
            <CopilotCard className="border-[rgba(31,107,74,0.18)] bg-[rgba(31,107,74,0.04)]">
              <CopilotSectionTitle
                title="Obligaciones fiscales"
                subtitle="Vencimientos y montos — mismo criterio de un solo estado que arriba."
              />
              {taxLoading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-[var(--copilot-ink-muted)]">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Cargando calendario fiscal…
                </div>
              ) : null}
              {taxError ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
                  {taxError} · Ejecutá el SQL de capa fiscal en Supabase si aún no migraste las
                  tablas proto.
                </div>
              ) : null}
              {!taxLoading && !taxError ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border border-[var(--copilot-border)] bg-white/80 p-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        Próximas (45 días)
                      </p>
                      <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--copilot-ink)]">
                        {upcomingWindowCount}
                      </p>
                    </div>
                    <div className="rounded-xl border border-rose-200/80 bg-rose-50/40 p-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-900/80">
                        Vencidas / a regularizar
                      </p>
                      <p className="mt-2 text-2xl font-semibold tabular-nums text-rose-950">
                        {overdueCount}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[var(--copilot-border)] bg-white/80 p-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        Pagadas (cerradas)
                      </p>
                      <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--copilot-ink)]">
                        {paidObligationsCount}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[var(--copilot-border)] bg-white/80 p-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                        Estimado próx. 30 días
                      </p>
                      <p className="mt-2 text-xl font-semibold tabular-nums text-[var(--copilot-ink)]">
                        {formatMoneyCompact(upcomingTotal)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                      Listado completo (orden de agenda)
                    </p>
                    {fiscalListObligations.length === 0 ? (
                      <p className="text-sm text-[var(--copilot-ink-muted)]">
                        No hay obligaciones abiertas en el prototipo, o el calendario está al día.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {fiscalListObligations.map((o) => {
                          const activeDrawer =
                            isTaxDrawerOpen && taxObligationId === o.id;
                          const ps = getPrimaryObligationState(o, todayYmd);
                          const hint = getObligationSecondaryHint(o, ps);
                          return (
                            <li
                              key={o.id}
                              className={`flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[var(--copilot-border)] bg-white/90 px-4 py-3 text-sm ${
                                activeDrawer
                                  ? "ring-2 ring-[rgba(31,107,74,0.22)]"
                                  : ""
                              }`}
                            >
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-[var(--copilot-ink)]">
                                    {mapTaxTypeLabel(o.tax_type)}
                                  </span>
                                  <CopilotObligationPrimaryBadge state={ps} />
                                </div>
                                <p className="text-xs text-[var(--copilot-ink-muted)]">
                                  {o.period_label} · Vence {dueLabel(o.due_date)}
                                </p>
                                {hint ? (
                                  <p className="text-[11px] leading-snug text-[var(--copilot-ink-muted)]">
                                    {hint}
                                  </p>
                                ) : null}
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                                <span className="text-sm font-semibold tabular-nums text-[var(--copilot-ink)]">
                                  {formatMoneyCompact(obligationPrincipal(o))}
                                </span>
                                <CopilotGhostButton
                                  type="button"
                                  className="whitespace-nowrap px-3 py-1.5 text-xs"
                                  onClick={() => openTaxEvidence(o.id)}
                                >
                                  Ver respaldo
                                </CopilotGhostButton>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </>
              ) : null}
            </CopilotCard>
            </FinanzasFiscalCalendarCollapsible>
        </div>
      </div>
      <CopilotTaxEvidenceDrawer
        obligationId={taxObligationId}
        isOpen={isTaxDrawerOpen && taxObligationId != null}
        onClose={() => {
          setIsTaxDrawerOpen(false);
          setTaxObligationId(null);
        }}
      />
    </div>
  );
}

export default function CopilotFinanzasPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-20 text-sm text-[var(--copilot-ink-muted)]">
          Cargando Finanzas…
        </div>
      }
    >
      <CopilotFinanzasPageContent />
    </Suspense>
  );
}
