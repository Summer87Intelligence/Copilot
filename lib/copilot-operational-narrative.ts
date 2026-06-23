import type {
  OperationalFeedGroup,
  OperationalFeedItem,
} from "@/lib/copilot-operational-feed-types";
import type {
  OperationalNarrative,
  OperationalNarrativeCategory,
  OperationalNarrativeSeverity,
} from "@/lib/copilot-operational-narrative-types";
import type { TreasuryProjectionRiskLevel } from "@/lib/treasury/treasury-cash-projection";

export type OperationalNarrativeTreasuryContext = {
  runwayDays: number | null;
  riskLevel: TreasuryProjectionRiskLevel;
  upcomingObligationCount: number;
  criticalAlertCount: number;
  warningAlertCount: number;
  hasNegativeProjection: boolean;
};

export type OperationalNarrativeFinanceContext = {
  coverageRatio: number | null;
  liquidityBalance: number | null;
};

export type OperationalNarrativeInput = {
  items: OperationalFeedItem[];
  priorities?: OperationalFeedGroup[];
  treasury?: OperationalNarrativeTreasuryContext | null;
  finance?: OperationalNarrativeFinanceContext | null;
};

type NarrativeCandidate = OperationalNarrative & { dedupeKey: string };

const SEVERITY_RANK: Record<OperationalNarrativeSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
};

function actionIdFromItem(item: OperationalFeedItem): string | null {
  const metadata = item.metadata ?? {};
  if (typeof metadata.actionId === "string") return metadata.actionId;
  if (item.id.startsWith("action:")) return item.id.slice("action:".length);
  return null;
}

function relatedActionIds(items: OperationalFeedItem[]): string[] {
  const ids = items
    .map(actionIdFromItem)
    .filter((value): value is string => Boolean(value?.trim()));
  return [...new Set(ids)];
}

function relatedFeedIds(items: OperationalFeedItem[]): string[] {
  return [...new Set(items.map((item) => item.id))];
}

function maxFeedScore(items: OperationalFeedItem[]): number {
  return items.reduce((max, item) => Math.max(max, item.score), 0);
}

function openActionItems(items: OperationalFeedItem[]): OperationalFeedItem[] {
  return items.filter((item) => item.source === "action");
}

function blockedActionItems(items: OperationalFeedItem[]): OperationalFeedItem[] {
  return openActionItems(items).filter((item) => item.blocked);
}

function overdueActionItems(items: OperationalFeedItem[]): OperationalFeedItem[] {
  return openActionItems(items).filter((item) => item.metadata?.slaStatus === "overdue");
}

function unassignedActionItems(items: OperationalFeedItem[]): OperationalFeedItem[] {
  return openActionItems(items).filter(
    (item) => !item.owner?.label?.trim() && (item.severity === "critical" || item.severity === "high")
  );
}

function treasuryFeedItems(items: OperationalFeedItem[]): OperationalFeedItem[] {
  return items.filter((item) => item.source === "treasury");
}

function financeFeedItems(items: OperationalFeedItem[]): OperationalFeedItem[] {
  return items.filter((item) => item.source === "finance" || item.source === "alert");
}

function collectionFeedItems(items: OperationalFeedItem[]): OperationalFeedItem[] {
  return items.filter(
    (item) =>
      item.source === "customer" ||
      item.metadata?.insightType === "deuda_vencida" ||
      item.metadata?.insightType === "concentracion_deuda"
  );
}

function hasCoverageAlert(items: OperationalFeedItem[]): boolean {
  return financeFeedItems(items).some((item) => item.metadata?.alertType === "cobertura");
}

function hasLiquidityAlert(items: OperationalFeedItem[]): boolean {
  return financeFeedItems(items).some(
    (item) =>
      item.metadata?.alertType === "liquidez" &&
      (item.severity === "critical" || item.severity === "high")
  );
}

function candidate(
  id: string,
  category: OperationalNarrativeCategory,
  severity: OperationalNarrativeSeverity,
  title: string,
  cause: string,
  impact: string,
  recommendation: string,
  score: number,
  options: {
    timeframe?: OperationalNarrative["timeframe"];
    relatedActionIds?: string[];
    relatedFeedIds?: string[];
    cta?: OperationalNarrative["cta"];
  } = {}
): NarrativeCandidate {
  return {
    id,
    category,
    severity,
    title,
    cause,
    impact,
    recommendation,
    score,
    dedupeKey: id,
    ...options,
  };
}

function buildCashCriticalNarrative(
  input: OperationalNarrativeInput
): NarrativeCandidate | null {
  const treasury = input.treasury;
  if (!treasury) return null;

  const runwayZero = treasury.runwayDays === 0;
  const treasuryCritical = treasury.riskLevel === "critical";
  const hasUpcoming = treasury.upcomingObligationCount > 0;

  if (
    !runwayZero &&
    !(treasuryCritical && hasUpcoming && treasury.criticalAlertCount > 0) &&
    !treasury.hasNegativeProjection
  ) {
    return null;
  }

  const related = [
    ...treasuryFeedItems(input.items),
    ...financeFeedItems(input.items).filter(
      (item) => item.metadata?.alertType === "liquidez" || item.metadata?.alertType === "cobertura"
    ),
  ];

  return candidate(
    "narrative:cash-critical",
    "cashflow",
    "critical",
    "Caja crítica",
    "Las obligaciones próximas superan la cobertura disponible.",
    "La caja proyectada será negativa en los próximos días.",
    "Priorizar cobranza y revisar pagos no críticos.",
    4_000 + maxFeedScore(related),
    {
      timeframe: "next_days",
      relatedActionIds: relatedActionIds(related),
      relatedFeedIds: relatedFeedIds(related),
      cta: { label: "Ir a Tesorería", href: "/copilot/tesoreria" },
    }
  );
}

function buildInsufficientCoverageNarrative(
  input: OperationalNarrativeInput
): NarrativeCandidate | null {
  const finance = input.finance;
  const coverageBelowOne =
    finance?.coverageRatio != null && Number.isFinite(finance.coverageRatio) && finance.coverageRatio < 1;
  const liquidityNegative =
    finance?.liquidityBalance != null &&
    Number.isFinite(finance.liquidityBalance) &&
    finance.liquidityBalance < 0;

  if (!coverageBelowOne && !hasCoverageAlert(input.items) && !liquidityNegative && !hasLiquidityAlert(input.items)) {
    return null;
  }

  const related = financeFeedItems(input.items).filter(
    (item) =>
      item.metadata?.alertType === "cobertura" ||
      item.metadata?.alertType === "liquidez" ||
      item.source === "finance"
  );

  return candidate(
    "narrative:insufficient-coverage",
    "risk",
    coverageBelowOne || liquidityNegative ? "critical" : "high",
    "Cobertura financiera insuficiente",
    "La liquidez proyectada no cubre obligaciones próximas.",
    "El margen operativo queda comprometido.",
    "Reducir egresos no prioritarios y acelerar ingresos.",
    3_200 + maxFeedScore(related),
    {
      timeframe: "this_week",
      relatedActionIds: relatedActionIds(related),
      relatedFeedIds: relatedFeedIds(related),
      cta: { label: "Revisar finanzas", href: "/copilot/finanzas" },
    }
  );
}

function buildBlockedFollowupsNarrative(
  input: OperationalNarrativeInput
): NarrativeCandidate | null {
  const blocked = blockedActionItems(input.items);
  if (blocked.length === 0) return null;

  const severity: OperationalNarrativeSeverity = blocked.some((item) => item.severity === "critical")
    ? "critical"
    : "high";

  return candidate(
    "narrative:blocked-followups",
    "operations",
    severity,
    "Seguimientos bloqueados",
    "Hay acciones críticas sin resolución.",
    "El riesgo operativo permanece abierto.",
    "Resolver bloqueos prioritarios y reasignar responsables.",
    3_500 + maxFeedScore(blocked),
    {
      timeframe: "today",
      relatedActionIds: relatedActionIds(blocked),
      relatedFeedIds: relatedFeedIds(blocked),
      cta: { label: "Abrir cola", href: "/copilot/cobranza" },
    }
  );
}

function buildTreasuryPressureNarrative(
  input: OperationalNarrativeInput
): NarrativeCandidate | null {
  const treasury = input.treasury;
  if (!treasury) return null;

  const treasuryItems = treasuryFeedItems(input.items);
  const hasTreasurySignal =
    treasury.warningAlertCount > 0 ||
    treasury.hasNegativeProjection ||
    treasuryItems.length > 0;

  if (!hasTreasurySignal || treasury.riskLevel === "critical") {
    return null;
  }

  return candidate(
    "narrative:treasury-pressure",
    "treasury",
    treasury.warningAlertCount > 0 ? "high" : "medium",
    "Presión de liquidez en caja manual",
    "La proyección de caja muestra tensión en el horizonte cercano.",
    "La liquidez disponible puede no alcanzar para cubrir egresos previstos.",
    "Revisar obligaciones próximas y ajustar prioridades de pago.",
    2_800 + maxFeedScore(treasuryItems),
    {
      timeframe: "next_days",
      relatedFeedIds: relatedFeedIds(treasuryItems),
      cta: { label: "Ir a Tesorería", href: "/copilot/tesoreria" },
    }
  );
}

function buildCollectionsNarrative(
  input: OperationalNarrativeInput
): NarrativeCandidate | null {
  const collectionItems = collectionFeedItems(input.items).filter(
    (item) => item.severity === "critical" || item.severity === "high"
  );
  if (collectionItems.length === 0) return null;

  return candidate(
    "narrative:collections",
    "collections",
    collectionItems.some((item) => item.severity === "critical") ? "critical" : "high",
    "Cobranza prioritaria pendiente",
    "Hay clientes con deuda atrasada o concentrada en cartera.",
    "La recuperación de caja se retrasa y aumenta el riesgo de liquidez.",
    "Contactar cuentas atrasadas y definir plan de cobro inmediato.",
    2_500 + maxFeedScore(collectionItems),
    {
      timeframe: "this_week",
      relatedFeedIds: relatedFeedIds(collectionItems),
      cta: {
        label: "Abrir cartera",
        href: collectionItems[0]?.href ?? "/copilot/clientes",
      },
    }
  );
}

function buildOverdueFollowupsNarrative(
  input: OperationalNarrativeInput
): NarrativeCandidate | null {
  const overdue = overdueActionItems(input.items);
  if (overdue.length === 0) return null;

  return candidate(
    "narrative:overdue-followups",
    "operations",
    "high",
    "Seguimientos vencidos",
    "Hay acciones abiertas fuera de plazo.",
    "La prioridad operativa se acumula sin cierre.",
    "Resolver seguimientos vencidos y redefinir responsables.",
    3_000 + maxFeedScore(overdue),
    {
      timeframe: "today",
      relatedActionIds: relatedActionIds(overdue),
      relatedFeedIds: relatedFeedIds(overdue),
      cta: { label: "Abrir cola", href: "/copilot/cobranza" },
    }
  );
}

function buildUnassignedFollowupsNarrative(
  input: OperationalNarrativeInput
): NarrativeCandidate | null {
  const unassigned = unassignedActionItems(input.items);
  if (unassigned.length === 0) return null;

  return candidate(
    "narrative:unassigned-followups",
    "operations",
    "medium",
    "Seguimientos sin responsable",
    "Hay prioridades abiertas sin dueño asignado.",
    "La resolución se demora y el riesgo queda sin dueño claro.",
    "Asignar responsables y fijar fecha de cierre.",
    2_400 + maxFeedScore(unassigned),
    {
      timeframe: "today",
      relatedActionIds: relatedActionIds(unassigned),
      relatedFeedIds: relatedFeedIds(unassigned),
      cta: { label: "Abrir cola", href: "/copilot/cobranza" },
    }
  );
}

function compareNarratives(left: NarrativeCandidate, right: NarrativeCandidate): number {
  const severityDelta = SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity];
  if (severityDelta !== 0) return severityDelta;
  if (right.score !== left.score) return right.score - left.score;
  return left.id.localeCompare(right.id);
}

export function buildOperationalNarratives(
  input: OperationalNarrativeInput,
  limit = 3
): OperationalNarrative[] {
  const candidates = [
    buildCashCriticalNarrative(input),
    buildInsufficientCoverageNarrative(input),
    buildBlockedFollowupsNarrative(input),
    buildOverdueFollowupsNarrative(input),
    buildTreasuryPressureNarrative(input),
    buildCollectionsNarrative(input),
    buildUnassignedFollowupsNarrative(input),
  ].filter((value): value is NarrativeCandidate => value != null);

  const sorted = [...candidates].sort(compareNarratives);
  const seen = new Set<string>();
  const selected: OperationalNarrative[] = [];

  for (const narrative of sorted) {
    if (seen.has(narrative.dedupeKey)) continue;
    seen.add(narrative.dedupeKey);
    const { dedupeKey, ...publicNarrative } = narrative;
    void dedupeKey;
    selected.push(publicNarrative);
    if (selected.length >= limit) break;
  }

  return selected;
}

export function buildTreasuryNarrativeContext(
  signals: {
    projection: { runwayDays: number | null; riskLevel: TreasuryProjectionRiskLevel; snapshots: { projectedCashUyu: number }[] } | null;
    upcoming7: unknown[];
    criticalAlertCount: number;
    warningAlertCount: number;
  } | null
): OperationalNarrativeTreasuryContext | null {
  if (!signals?.projection) return null;

  const hasNegativeProjection = signals.projection.snapshots
    .slice(0, 7)
    .some((snapshot) => snapshot.projectedCashUyu < 0);

  return {
    runwayDays: signals.projection.runwayDays,
    riskLevel: signals.projection.riskLevel,
    upcomingObligationCount: signals.upcoming7.length,
    criticalAlertCount: signals.criticalAlertCount,
    warningAlertCount: signals.warningAlertCount,
    hasNegativeProjection,
  };
}
