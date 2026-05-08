import type {
  AgingBucketLabel,
  CurrencyMetrics,
  FinancialDashboardMetrics,
  TopDebtor,
} from "@/lib/copilot-financial-dashboard-metrics";

export type FinancialPriorityAlert = {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  currencyCode?: string;
  metric?: number;
};

export type FinancialActionPriority = {
  id: string;
  companyId: string;
  companyName: string;
  currencyCode: string;
  pendingAmount: number;
  dominantAgingLabel: AgingBucketLabel;
  oldestAgeDays: number;
  risk: "high" | "medium" | "low";
  priority: "Alta" | "Media" | "Baja";
  priorityScore: number;
  invoiceCount: number;
  collectionEffectiveness: number;
};

export type FinancialRiskIndicator = {
  id: string;
  label: string;
  status: "healthy" | "warning" | "critical";
  description: string;
  currencyCode?: string;
  metric?: number;
};

export type FinancialPriorityModel = {
  alerts: FinancialPriorityAlert[];
  actionPriorities: FinancialActionPriority[];
  risks: FinancialRiskIndicator[];
};

const AGING_WEIGHT: Record<AgingBucketLabel, number> = {
  "0-30": 0.2,
  "31-60": 0.5,
  "61-90": 0.8,
  "90+": 1,
};

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function severityRank(s: FinancialPriorityAlert["severity"]): number {
  if (s === "high") return 0;
  if (s === "medium") return 1;
  return 2;
}

function riskRank(r: FinancialActionPriority["risk"]): number {
  if (r === "high") return 0;
  if (r === "medium") return 1;
  return 2;
}

function bucketAmount(currency: CurrencyMetrics, label: AgingBucketLabel): number {
  return currency.aging.find((b) => b.label === label)?.amount ?? 0;
}

function bucketCount(currency: CurrencyMetrics, label: AgingBucketLabel): number {
  return currency.aging.find((b) => b.label === label)?.invoiceCount ?? 0;
}

function concentration(currency: CurrencyMetrics): number {
  if (!(currency.totalPending > 0)) return 0;
  const topDebt = currency.topDebtors.reduce((sum, d) => sum + d.pendingAmount, 0);
  return round2((topDebt / currency.totalPending) * 100);
}

function debtorShare(currency: CurrencyMetrics, debtor: TopDebtor): number {
  if (!(currency.totalPending > 0)) return 0;
  return round2((debtor.pendingAmount / currency.totalPending) * 100);
}

function buildAlertsForCurrency(currency: CurrencyMetrics): FinancialPriorityAlert[] {
  const alerts: FinancialPriorityAlert[] = [];
  const over90Amount = bucketAmount(currency, "90+");
  const over90Count = bucketCount(currency, "90+");
  const conc = concentration(currency);
  const significant6190 = bucketAmount(currency, "61-90");
  const significant6190Ratio =
    currency.totalPending > 0 ? (significant6190 / currency.totalPending) * 100 : 0;

  if (over90Amount > 0) {
    alerts.push({
      id: `${currency.currencyCode}:aging-90`,
      severity: "high",
      title: "Deuda envejecida crítica",
      description: `${over90Count} factura(s) con deuda mayor a 90 días.`,
      currencyCode: currency.currencyCode,
      metric: over90Amount,
    });
  }

  if (conc > 60 && currency.totalPending > 0) {
    alerts.push({
      id: `${currency.currencyCode}:concentration`,
      severity: "high",
      title: "Concentración alta de deuda",
      description: `${conc}% de la deuda está concentrada en ${currency.topDebtors.length} cliente(s).`,
      currencyCode: currency.currencyCode,
      metric: conc,
    });
  }

  if (currency.collectionEffectiveness < 80 && currency.invoiceCount > 0) {
    alerts.push({
      id: `${currency.currencyCode}:effectiveness-high`,
      severity: "high",
      title: "Cobranza efectiva bajo umbral crítico",
      description: `La efectividad de cobranza está en ${currency.collectionEffectiveness.toFixed(2)}%.`,
      currencyCode: currency.currencyCode,
      metric: currency.collectionEffectiveness,
    });
  } else if (currency.collectionEffectiveness < 90 && currency.invoiceCount > 0) {
    alerts.push({
      id: `${currency.currencyCode}:effectiveness-medium`,
      severity: "medium",
      title: "Cobranza efectiva a monitorear",
      description: `La efectividad de cobranza está en ${currency.collectionEffectiveness.toFixed(2)}%.`,
      currencyCode: currency.currencyCode,
      metric: currency.collectionEffectiveness,
    });
  }

  for (const debtor of currency.topDebtors) {
    const share = debtorShare(currency, debtor);
    if (share > 25) {
      alerts.push({
        id: `${currency.currencyCode}:debtor-share:${debtor.companyId}`,
        severity: "high",
        title: "Cliente concentra demasiada deuda",
        description: `${debtor.companyName} concentra ${share}% de la deuda pendiente.`,
        currencyCode: currency.currencyCode,
        metric: debtor.pendingAmount,
      });
    }
  }

  if (significant6190 > 0 && significant6190Ratio >= 15) {
    alerts.push({
      id: `${currency.currencyCode}:aging-61-90`,
      severity: "medium",
      title: "Deuda entrando en zona de riesgo",
      description: `${round2(significant6190Ratio)}% de la deuda está entre 61 y 90 días.`,
      currencyCode: currency.currencyCode,
      metric: significant6190,
    });
  }

  if (currency.debtorClientsCount > 10) {
    alerts.push({
      id: `${currency.currencyCode}:debtor-count`,
      severity: "medium",
      title: "Muchos clientes con deuda abierta",
      description: `${currency.debtorClientsCount} cliente(s) tienen saldo pendiente.`,
      currencyCode: currency.currencyCode,
      metric: currency.debtorClientsCount,
    });
  }

  if (alerts.length === 0 && currency.invoiceCount > 0) {
    alerts.push({
      id: `${currency.currencyCode}:healthy`,
      severity: "low",
      title: "Sin alertas críticas",
      description: "No se detectan señales fuertes de concentración, aging o baja cobranza.",
      currencyCode: currency.currencyCode,
      metric: currency.collectionEffectiveness,
    });
  }

  return alerts;
}

function buildPriority(currency: CurrencyMetrics, debtor: TopDebtor, maxPending: number): FinancialActionPriority {
  const pendingAmountWeight = maxPending > 0 ? debtor.pendingAmount / maxPending : 0;
  const agingWeight = AGING_WEIGHT[debtor.dominantAgingLabel] ?? 0.2;
  const concentrationWeight = currency.totalPending > 0 ? debtor.pendingAmount / currency.totalPending : 0;
  const score = round2(
    (pendingAmountWeight * 0.45 + agingWeight * 0.35 + concentrationWeight * 0.2) * 100
  );
  const risk: FinancialActionPriority["risk"] =
    score >= 70 || debtor.oldestAgeDays > 90 || concentrationWeight > 0.25
      ? "high"
      : score >= 40 || debtor.oldestAgeDays > 60
        ? "medium"
        : "low";

  return {
    id: `${currency.currencyCode}:${debtor.companyId}`,
    companyId: debtor.companyId,
    companyName: debtor.companyName,
    currencyCode: currency.currencyCode,
    pendingAmount: debtor.pendingAmount,
    dominantAgingLabel: debtor.dominantAgingLabel,
    oldestAgeDays: debtor.oldestAgeDays,
    risk,
    priority: risk === "high" ? "Alta" : risk === "medium" ? "Media" : "Baja",
    priorityScore: score,
    invoiceCount: debtor.invoiceCount,
    collectionEffectiveness: debtor.collectionEffectiveness,
  };
}

function buildPrioritiesForCurrency(currency: CurrencyMetrics): FinancialActionPriority[] {
  const maxPending = Math.max(0, ...currency.topDebtors.map((d) => d.pendingAmount));
  return currency.topDebtors.map((debtor) => buildPriority(currency, debtor, maxPending));
}

function buildRisksForCurrency(currency: CurrencyMetrics): FinancialRiskIndicator[] {
  const over90Amount = bucketAmount(currency, "90+");
  const over90Ratio = currency.totalPending > 0 ? (over90Amount / currency.totalPending) * 100 : 0;
  const conc = concentration(currency);

  return [
    {
      id: `${currency.currencyCode}:risk-effectiveness`,
      label: "Cobranza",
      status:
        currency.collectionEffectiveness >= 90
          ? "healthy"
          : currency.collectionEffectiveness >= 80
            ? "warning"
            : "critical",
      description: `Efectividad ${currency.collectionEffectiveness.toFixed(2)}%.`,
      currencyCode: currency.currencyCode,
      metric: currency.collectionEffectiveness,
    },
    {
      id: `${currency.currencyCode}:risk-concentration`,
      label: "Concentración deuda",
      status: conc > 60 ? "critical" : conc > 40 ? "warning" : "healthy",
      description:
        currency.totalPending > 0
          ? `${conc}% concentrado en top ${currency.topDebtors.length}.`
          : "Sin deuda pendiente.",
      currencyCode: currency.currencyCode,
      metric: conc,
    },
    {
      id: `${currency.currencyCode}:risk-aging`,
      label: "Deuda envejecida",
      status: over90Amount > 0 ? "critical" : bucketAmount(currency, "61-90") > 0 ? "warning" : "healthy",
      description:
        over90Amount > 0
          ? `${round2(over90Ratio)}% de la deuda supera 90 días.`
          : "Sin deuda mayor a 90 días.",
      currencyCode: currency.currencyCode,
      metric: over90Amount,
    },
    {
      id: `${currency.currencyCode}:risk-critical-clients`,
      label: "Clientes críticos",
      status:
        currency.topDebtors.some((d) => debtorShare(currency, d) > 25 || d.oldestAgeDays > 90)
          ? "critical"
          : currency.debtorClientsCount > 10
            ? "warning"
            : "healthy",
      description: `${currency.debtorClientsCount} cliente(s) con deuda abierta.`,
      currencyCode: currency.currencyCode,
      metric: currency.debtorClientsCount,
    },
  ];
}

export function buildFinancialPriorityModel(metrics: FinancialDashboardMetrics): FinancialPriorityModel {
  const alerts = metrics.currencies
    .flatMap(buildAlertsForCurrency)
    .sort((a, b) => {
      const severity = severityRank(a.severity) - severityRank(b.severity);
      if (severity !== 0) return severity;
      return (b.metric ?? 0) - (a.metric ?? 0);
    });

  const actionPriorities = metrics.currencies
    .flatMap(buildPrioritiesForCurrency)
    .sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
      const risk = riskRank(a.risk) - riskRank(b.risk);
      if (risk !== 0) return risk;
      return b.pendingAmount - a.pendingAmount;
    });

  const risks = metrics.currencies.flatMap(buildRisksForCurrency);

  return { alerts, actionPriorities, risks };
}
