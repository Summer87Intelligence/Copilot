/**
 * Phase 5D — Outcome Detection Engine.
 * Conservative: solo detecta outcomes con evidencia clara y dedupable.
 * Puro: sin imports de DB, sin side effects.
 */

import type {
  DECollectionAction,
  DEFollowUpRow,
  DEOperationalStateRow,
  DERecentReceipt,
} from "@/lib/decision-engine/de-types";
import type {
  DetectedOutcome,
  LearningOutcome,
  LearningOutcomeSourceType,
  LearningOutcomeType,
} from "./learning-types";

export type OutcomeDetectionInput = {
  recentReceipts: DERecentReceipt[];
  recentActions: DECollectionAction[];
  operationalStates: DEOperationalStateRow[];
  completedFollowUps: DEFollowUpRow[];
  existingOutcomes: LearningOutcome[];
  workspaceCompanyId: string;
  nowIso: string;
};

export type OutcomeDetectionResult = {
  detected: DetectedOutcome[];
  skipped_duplicate_count: number;
  sources_evaluated: number;
};

const PAYMENT_WINDOW_DAYS = 7;
const PROMISE_OVERDUE_GRACE_DAYS = 3;

function dedupeKey(
  sourceType: LearningOutcomeSourceType,
  sourceId: string,
  outcomeType: LearningOutcomeType
): string {
  return `${sourceType}:${sourceId}:${outcomeType}`;
}

function daysBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000;
}

function findReceiptForCompany(
  companyId: string,
  afterIso: string,
  receipts: DERecentReceipt[],
  windowDays: number
): DERecentReceipt | undefined {
  return receipts.find((r) => {
    if (r.company_id !== companyId) return false;
    const diff = daysBetween(afterIso, r.receipt_date);
    return diff >= 0 && diff <= windowDays;
  });
}

function buildExistingKeys(outcomes: LearningOutcome[]): Set<string> {
  return new Set(
    outcomes.map((o) => `${o.source_type}:${o.source_id}:${o.outcome_type}`)
  );
}

/** Rule 1: Every receipt with known company_id → payment_received */
function detectPaymentReceived(
  receipts: DERecentReceipt[],
  workspaceCompanyId: string,
  existingKeys: Set<string>
): DetectedOutcome[] {
  const out: DetectedOutcome[] = [];
  for (const r of receipts) {
    if (!r.company_id) continue;
    const key = dedupeKey("manual_action", r.id, "payment_received");
    if (existingKeys.has(key)) continue;
    out.push({
      workspace_company_id: workspaceCompanyId,
      customer_id:          r.company_id,
      source_type:          "manual_action",
      source_id:            r.id,
      outcome_type:         "payment_received",
      outcome_amount:       r.amount,
      currency_code:        r.currency_code,
      observed_at:          r.receipt_date,
      metadata:             {},
      dedupe_key:           key,
    });
  }
  return out;
}

/** Rule 2: machine_state === "recovered" → recovered */
function detectRecoveredStates(
  states: DEOperationalStateRow[],
  workspaceCompanyId: string,
  existingKeys: Set<string>
): DetectedOutcome[] {
  const out: DetectedOutcome[] = [];
  for (const s of states) {
    if (s.machine_state !== "recovered") continue;
    const srcId = `${s.customer_id}_state_recovered`;
    const key = dedupeKey("follow_up", srcId, "recovered");
    if (existingKeys.has(key)) continue;
    out.push({
      workspace_company_id: workspaceCompanyId,
      customer_id:          s.customer_id,
      source_type:          "follow_up",
      source_id:            srcId,
      outcome_type:         "recovered",
      outcome_amount:       null,
      currency_code:        null,
      observed_at:          s.transitioned_at ?? s.updated_at,
      metadata:             { previous_state: s.previous_state },
      dedupe_key:           key,
    });
  }
  return out;
}

/** Rule 3: machine_state === "escalated" | "legal_review" → escalated */
function detectEscalatedStates(
  states: DEOperationalStateRow[],
  workspaceCompanyId: string,
  existingKeys: Set<string>
): DetectedOutcome[] {
  const out: DetectedOutcome[] = [];
  for (const s of states) {
    if (s.machine_state !== "escalated" && s.machine_state !== "legal_review") continue;
    const srcId = `${s.customer_id}_state_${s.machine_state}`;
    const key = dedupeKey("manual_action", srcId, "escalated");
    if (existingKeys.has(key)) continue;
    out.push({
      workspace_company_id: workspaceCompanyId,
      customer_id:          s.customer_id,
      source_type:          "manual_action",
      source_id:            srcId,
      outcome_type:         "escalated",
      outcome_amount:       null,
      currency_code:        null,
      observed_at:          s.transitioned_at ?? s.updated_at,
      metadata:             { machine_state: s.machine_state },
      dedupe_key:           key,
    });
  }
  return out;
}

/** Rule 4: action with past promise_date + receipt within 7d → promise_kept */
function detectPromiseKept(
  actions: DECollectionAction[],
  receipts: DERecentReceipt[],
  workspaceCompanyId: string,
  nowIso: string,
  existingKeys: Set<string>
): DetectedOutcome[] {
  const out: DetectedOutcome[] = [];
  for (const action of actions) {
    if (!action.promise_date) continue;
    if (daysBetween(action.promise_date, nowIso) < 0) continue; // not yet due
    const receipt = findReceiptForCompany(
      action.company_id,
      action.promise_date,
      receipts,
      PAYMENT_WINDOW_DAYS
    );
    if (!receipt) continue;
    const key = dedupeKey("manual_action", action.id, "promise_kept");
    if (existingKeys.has(key)) continue;
    out.push({
      workspace_company_id: workspaceCompanyId,
      customer_id:          action.company_id,
      source_type:          "manual_action",
      source_id:            action.id,
      outcome_type:         "promise_kept",
      outcome_amount:       receipt.amount,
      currency_code:        receipt.currency_code,
      observed_at:          receipt.receipt_date,
      metadata:             { promise_date: action.promise_date, action_type: action.action_type },
      dedupe_key:           key,
    });
  }
  return out;
}

/** Rule 5: action with past promise_date + no receipt + >grace days → promise_broken */
function detectPromiseBroken(
  actions: DECollectionAction[],
  receipts: DERecentReceipt[],
  workspaceCompanyId: string,
  nowIso: string,
  existingKeys: Set<string>
): DetectedOutcome[] {
  const out: DetectedOutcome[] = [];
  for (const action of actions) {
    if (!action.promise_date) continue;
    const daysOverdue = daysBetween(action.promise_date, nowIso);
    if (daysOverdue < PROMISE_OVERDUE_GRACE_DAYS) continue;
    const receipt = findReceiptForCompany(
      action.company_id,
      action.promise_date,
      receipts,
      PAYMENT_WINDOW_DAYS
    );
    if (receipt) continue; // kept
    const key = dedupeKey("manual_action", action.id, "promise_broken");
    if (existingKeys.has(key)) continue;
    out.push({
      workspace_company_id: workspaceCompanyId,
      customer_id:          action.company_id,
      source_type:          "manual_action",
      source_id:            action.id,
      outcome_type:         "promise_broken",
      outcome_amount:       action.promise_amount ?? null,
      currency_code:        action.promise_currency ?? null,
      observed_at:          nowIso,
      metadata:             {
        promise_date:  action.promise_date,
        days_overdue:  Math.round(daysOverdue),
        action_type:   action.action_type,
      },
      dedupe_key: key,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function detectOutcomes(input: OutcomeDetectionInput): OutcomeDetectionResult {
  const existingKeys = buildExistingKeys(input.existingOutcomes);

  const candidates: DetectedOutcome[] = [
    ...detectPaymentReceived(input.recentReceipts, input.workspaceCompanyId, existingKeys),
    ...detectRecoveredStates(input.operationalStates, input.workspaceCompanyId, existingKeys),
    ...detectEscalatedStates(input.operationalStates, input.workspaceCompanyId, existingKeys),
    ...detectPromiseKept(
      input.recentActions,
      input.recentReceipts,
      input.workspaceCompanyId,
      input.nowIso,
      existingKeys
    ),
    ...detectPromiseBroken(
      input.recentActions,
      input.recentReceipts,
      input.workspaceCompanyId,
      input.nowIso,
      existingKeys
    ),
  ];

  // Deduplicate within this run
  const seen = new Set<string>();
  const detected: DetectedOutcome[] = [];
  let skipped = 0;
  for (const o of candidates) {
    if (seen.has(o.dedupe_key)) {
      skipped++;
      continue;
    }
    seen.add(o.dedupe_key);
    detected.push(o);
  }

  return {
    detected,
    skipped_duplicate_count: skipped,
    sources_evaluated:
      input.recentReceipts.length +
      input.operationalStates.length +
      input.recentActions.length +
      input.completedFollowUps.length,
  };
}
