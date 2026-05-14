import type { OperationalActionSlaStatus } from "@/lib/copilot-operational-actions-types";
import { getActionSlaStatus } from "@/lib/copilot-operational-actions-sla";

export type OperationalFeedSeverity = "critical" | "high" | "medium" | "low";

export type OperationalFeedSourceKind =
  | "alert"
  | "action"
  | "insight"
  | "treasury"
  | "finance"
  | "customer";

export type OperationalScoreInput = {
  source: OperationalFeedSourceKind;
  severity: OperationalFeedSeverity;
  slaStatus?: OperationalActionSlaStatus;
  blocked?: boolean;
  treasuryRisk?: boolean;
  financialImpact?: number;
  dueAt?: string | null;
};

const SEVERITY_BASE: Record<OperationalFeedSeverity, number> = {
  critical: 10_000,
  high: 7_000,
  medium: 4_000,
  low: 1_000,
};

const SOURCE_BASE: Record<OperationalFeedSourceKind, number> = {
  alert: 900,
  action: 700,
  treasury: 650,
  finance: 600,
  customer: 550,
  insight: 500,
};

export function scoreOperationalFeedItem(
  input: OperationalScoreInput,
  now: Date = new Date()
): number {
  let score = SEVERITY_BASE[input.severity] + SOURCE_BASE[input.source];

  if (input.slaStatus === "overdue") score += 5_000;
  else if (input.slaStatus === "due_today") score += 3_000;
  else if (input.slaStatus === "due_soon") score += 1_500;

  if (input.blocked) score += 4_000;
  if (input.treasuryRisk) score += 2_500;

  if (input.financialImpact != null && Number.isFinite(input.financialImpact)) {
    score += Math.min(2_000, Math.round(Math.log10(Math.max(1, input.financialImpact)) * 400));
  }

  if (input.dueAt) {
    const due = new Date(input.dueAt);
    if (!Number.isNaN(due.getTime()) && due.getTime() < now.getTime()) {
      score += 500;
    }
  }

  return score;
}

export function compareOperationalFeedScore(
  left: { score: number; id: string },
  right: { score: number; id: string }
): number {
  if (right.score !== left.score) return right.score - left.score;
  return left.id.localeCompare(right.id);
}

export function mapAlertPriorityToFeedSeverity(
  priority: "critical" | "high" | "medium"
): OperationalFeedSeverity {
  if (priority === "critical") return "critical";
  if (priority === "high") return "high";
  return "medium";
}

export function mapTreasurySeverityToFeedSeverity(
  severity: "critical" | "warning" | "info"
): OperationalFeedSeverity {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "high";
  return "medium";
}

export function mapOperationalPriorityToFeedSeverity(
  priority: "critical" | "high" | "medium" | "low"
): OperationalFeedSeverity {
  if (priority === "critical") return "critical";
  if (priority === "high") return "high";
  if (priority === "medium") return "medium";
  return "low";
}

export function scoreOperationalActionRow(
  action: {
    priority: "critical" | "high" | "medium" | "low";
    operational_status: "pending" | "in_progress" | "blocked" | "resolved" | "dismissed";
    due_at: string | null;
  },
  now: Date = new Date()
): number {
  return scoreOperationalFeedItem({
    source: "action",
    severity: mapOperationalPriorityToFeedSeverity(action.priority),
    slaStatus: getActionSlaStatus(action, now),
    blocked: action.operational_status === "blocked",
    dueAt: action.due_at,
  });
}
