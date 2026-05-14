import type { OperationalFeedGroup, OperationalFeedItem } from "@/lib/copilot-operational-feed-types";
import { compareOperationalFeedScore } from "@/lib/copilot-operational-score";

const DATE_IN_TITLE = /\b\d{4}-\d{2}-\d{2}\b/g;

function normalizeTitleStem(title: string): string {
  return title
    .replace(DATE_IN_TITLE, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function treasuryWindowLabel(items: OperationalFeedItem[]): string | null {
  const dates = items
    .map((item) => {
      const match = item.title.match(/\b(\d{4}-\d{2}-\d{2})\b/);
      return match?.[1] ?? null;
    })
    .filter((value): value is string => Boolean(value))
    .sort();

  if (dates.length < 2) return null;

  const unique = [...new Set(dates)];
  if (unique.length < 2) return null;

  const first = unique[0];
  const last = unique[unique.length - 1];
  const dayCount = unique.length;
  if (dayCount >= 3) {
    return `${dayCount} días consecutivos (${first} → ${last})`;
  }
  return `${dayCount} fechas (${first} → ${last})`;
}

function executiveSummary(item: OperationalFeedItem, itemCount: number): string {
  const parts: string[] = [];
  if (item.summary?.trim()) parts.push(item.summary.trim());

  if (item.source === "action") {
    if (item.blocked) parts.push("Seguimiento bloqueado: resolver primero.");
    else if (!item.owner?.label?.trim()) parts.push("Sin responsable asignado.");
    if (item.metadata?.slaStatus === "overdue") parts.push("Vencida: actuar hoy.");
    else if (item.metadata?.slaStatus === "due_today") parts.push("Vence hoy.");
  }

  if (item.source === "treasury" && itemCount > 1) {
    parts.push("Riesgo de caja concentrado en los próximos días.");
  }

  if (item.source === "finance" && itemCount > 1) {
    parts.push("Presión de liquidez repetida en el horizonte cercano.");
  }

  if (parts.length === 0) return "Resolver primero para reducir exposición operativa.";
  return parts.join(" ");
}

function executiveTitle(
  stem: string,
  itemCount: number,
  windowLabel: string | null,
  source: OperationalFeedItem["source"]
): string {
  if (itemCount <= 1) return stem;
  if (windowLabel) return `${stem} · ${windowLabel}`;
  if (source === "treasury") return `${stem} · ${itemCount} impactos proyectados`;
  if (source === "action") return `${stem} · ${itemCount} seguimientos relacionados`;
  return `${stem} · ${itemCount} alertas relacionadas`;
}

function groupKey(item: OperationalFeedItem): string {
  if (item.source === "treasury") {
    const alertType = String(item.metadata?.treasuryAlertType ?? "treasury");
    return `treasury:${alertType}:${normalizeTitleStem(item.title)}:${item.severity}`;
  }

  if (item.source === "action") {
    const origin = String(item.metadata?.origin ?? "manual");
    const related = String(item.metadata?.relatedEntityId ?? normalizeTitleStem(item.title));
    return `action:${origin}:${related}:${item.severity}`;
  }

  if (item.source === "alert" || item.source === "finance") {
    const alertType = String(item.metadata?.alertType ?? item.source);
    const related = String(
      item.metadata?.alertId ??
        item.metadata?.obligationId ??
        normalizeTitleStem(item.title)
    );
    return `feed:${item.source}:${alertType}:${related}:${item.severity}`;
  }

  if (item.source === "customer" || item.source === "insight") {
    const topic = String(item.metadata?.insightType ?? normalizeTitleStem(item.title));
    const company = String(item.metadata?.companyId ?? "workspace");
    return `insight:${topic}:${company}:${item.severity}`;
  }

  return `misc:${item.source}:${item.id}`;
}

function buildGroup(id: string, items: OperationalFeedItem[]): OperationalFeedGroup {
  const sorted = [...items].sort(compareOperationalFeedScore);
  const primaryItem = sorted[0];
  const stem =
    normalizeTitleStem(primaryItem.title).length > 0
      ? primaryItem.title.replace(DATE_IN_TITLE, "").replace(/\s+/g, " ").trim()
      : primaryItem.title;
  const windowLabel =
    primaryItem.source === "treasury" ? treasuryWindowLabel(sorted) : null;

  return {
    id,
    source: primaryItem.source,
    severity: primaryItem.severity,
    score: primaryItem.score,
    title: executiveTitle(stem, sorted.length, windowLabel, primaryItem.source),
    summary: executiveSummary(primaryItem, sorted.length),
    itemCount: sorted.length,
    primaryItem,
    items: sorted,
    cta: primaryItem.cta,
    quickActions: primaryItem.quickActions,
    collapsedByDefault: sorted.length > 1,
  };
}

export function buildOperationalFeedGroups(items: OperationalFeedItem[]): OperationalFeedGroup[] {
  const buckets = new Map<string, OperationalFeedItem[]>();

  for (const item of items) {
    const key = groupKey(item);
    const bucket = buckets.get(key) ?? [];
    bucket.push(item);
    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .map(([key, bucketItems]) => buildGroup(key, bucketItems))
    .sort(compareOperationalFeedScore);
}

export function pickExecutiveFeedPriorities(
  groups: OperationalFeedGroup[],
  limit = 3
): OperationalFeedGroup[] {
  const seen = new Set<string>();
  const priorities: OperationalFeedGroup[] = [];

  for (const group of groups) {
    const dedupeKey = `${group.source}:${normalizeTitleStem(group.title)}:${group.severity}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    priorities.push(group);
    if (priorities.length >= limit) break;
  }

  return priorities;
}

export function buildGroupedOperationalFeed(items: OperationalFeedItem[]): {
  groups: OperationalFeedGroup[];
  priorities: OperationalFeedGroup[];
} {
  const groups = buildOperationalFeedGroups(items);
  const priorities = pickExecutiveFeedPriorities(groups, 3);
  const priorityIds = new Set(priorities.map((group) => group.id));
  const remainingGroups = groups.filter((group) => !priorityIds.has(group.id));
  return { groups: remainingGroups, priorities };
}
