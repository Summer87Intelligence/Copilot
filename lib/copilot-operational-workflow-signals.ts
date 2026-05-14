import type { OperationalActionListItem } from "@/lib/copilot-operational-actions-types";
import type { CopilotRutasSnapshot } from "@/lib/copilot-rutas-snapshot-types";
import type { OperationalWorkflowType } from "@/lib/copilot-operational-workflows-types";

const OPEN_ACTION_STATUSES = new Set(["pending", "in_progress", "blocked"]);

export type WorkflowSignalCandidate = {
  type: OperationalWorkflowType;
  dedupeKey: string;
  relatedActionIds?: string[];
  relatedNarrativeIds?: string[];
  relatedMemoryIds?: string[];
};

export type WorkflowSignalStrength = "critical" | "high" | "normal";

export type WorkflowSignalsInput = {
  snapshot: Pick<
    CopilotRutasSnapshot,
    "narratives" | "recommendations" | "memory" | "feed" | "generatedAt"
  >;
  actions: OperationalActionListItem[];
};

function isOpenAction(action: OperationalActionListItem): boolean {
  return OPEN_ACTION_STATUSES.has(action.operational_status);
}

export function buildWorkflowSignalHash(candidate: WorkflowSignalCandidate): string {
  return [
    candidate.type,
    candidate.dedupeKey,
    ...(candidate.relatedActionIds ?? []),
    ...(candidate.relatedNarrativeIds ?? []),
    ...(candidate.relatedMemoryIds ?? []),
  ].join(":");
}

export function detectWorkflowSignalCandidates(input: WorkflowSignalsInput): WorkflowSignalCandidate[] {
  const candidates: WorkflowSignalCandidate[] = [];

  const criticalCashNarrative = input.snapshot.narratives.find(
    (narrative) =>
      narrative.category === "cashflow" &&
      (narrative.severity === "critical" || narrative.id === "narrative:cash-critical")
  );
  if (criticalCashNarrative) {
    candidates.push({
      type: "critical_cash",
      dedupeKey: "workflow:critical_cash:caja-critica",
      relatedNarrativeIds: [criticalCashNarrative.id],
    });
  }

  const criticalCashRecommendation = input.snapshot.recommendations.find(
    (recommendation) =>
      recommendation.category === "cashflow" &&
      (recommendation.priority === "critical" || recommendation.id === "strategic:cash-critical")
  );
  if (criticalCashRecommendation) {
    candidates.push({
      type: "critical_cash",
      dedupeKey: "workflow:critical_cash:caja-critica",
      relatedNarrativeIds: criticalCashRecommendation.relatedNarrativeIds,
    });
  }

  const collectionsRecommendation = input.snapshot.recommendations.find(
    (recommendation) => recommendation.category === "collections"
  );
  const collectionsNarrative = input.snapshot.narratives.find(
    (narrative) => narrative.category === "collections"
  );
  if (collectionsRecommendation || collectionsNarrative) {
    candidates.push({
      type: "priority_collections",
      dedupeKey: "workflow:priority_collections:cobranza",
      relatedNarrativeIds: collectionsNarrative ? [collectionsNarrative.id] : undefined,
    });
  }

  const recurringMemory = input.snapshot.memory.find((signal) => signal.type === "recurring_issue");
  if (recurringMemory) {
    candidates.push({
      type: "blocked_followup",
      dedupeKey: "workflow:blocked_followup:recurring",
      relatedMemoryIds: [recurringMemory.id],
      relatedActionIds: recurringMemory.relatedActionIds,
    });
  }

  const blockedActions = input.actions.filter(
    (action) => isOpenAction(action) && action.operational_status === "blocked"
  );
  if (blockedActions.length > 0) {
    candidates.push({
      type: "blocked_followup",
      dedupeKey: "workflow:blocked_followup:blocked-open",
      relatedActionIds: blockedActions.map((action) => action.id),
    });
  }

  const deduped = new Map<string, WorkflowSignalCandidate>();
  for (const candidate of candidates) {
    if (!deduped.has(candidate.dedupeKey)) {
      deduped.set(candidate.dedupeKey, candidate);
    }
  }
  return [...deduped.values()];
}

export function resolveWorkflowSignalStrength(
  candidate: WorkflowSignalCandidate,
  input: WorkflowSignalsInput
): WorkflowSignalStrength {
  if (candidate.type === "critical_cash") {
    const criticalNarrative = input.snapshot.narratives.find(
      (narrative) =>
        narrative.category === "cashflow" &&
        (narrative.severity === "critical" || narrative.id === "narrative:cash-critical")
    );
    const criticalRecommendation = input.snapshot.recommendations.find(
      (recommendation) =>
        recommendation.category === "cashflow" &&
        (recommendation.priority === "critical" || recommendation.id === "strategic:cash-critical")
    );
    if (criticalNarrative || criticalRecommendation) return "critical";
    return "high";
  }

  if (candidate.type === "priority_collections") {
    const collectionsRecommendation = input.snapshot.recommendations.find(
      (recommendation) => recommendation.category === "collections"
    );
    if (collectionsRecommendation?.priority === "critical") return "critical";
    return "high";
  }

  const recurringMemory = input.snapshot.memory.find((signal) => signal.type === "recurring_issue");
  if (recurringMemory?.severity === "critical") return "critical";
  if (recurringMemory?.severity === "high") return "high";
  return "normal";
}

export function hasWorkflowJustifyingSignal(
  execution: Pick<WorkflowSignalCandidate, "type" | "dedupeKey">,
  input: WorkflowSignalsInput
): boolean {
  return detectWorkflowSignalCandidates(input).some(
    (candidate) => candidate.dedupeKey === execution.dedupeKey
  );
}

export function hasSignalEscalated(
  previousStrength: WorkflowSignalStrength,
  nextStrength: WorkflowSignalStrength
): boolean {
  const rank: Record<WorkflowSignalStrength, number> = {
    normal: 0,
    high: 1,
    critical: 2,
  };
  return rank[nextStrength] > rank[previousStrength];
}
