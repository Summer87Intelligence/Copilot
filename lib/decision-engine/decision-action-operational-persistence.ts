/**
 * Decision Engine — Action → operational state + follow-up persistence.
 * Orquesta engines determinísticos y repositorios (sin lógica duplicada de negocio).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CollectionAction } from "@/lib/copilot-collection-types";
import { COPILOT_OPERATIONAL_START_DATE } from "@/lib/copilot-operational-period";
import { computeActionImpact } from "@/lib/decision-engine/action-impact-engine";
import { computeClientRiskScore } from "@/lib/decision-engine/client-risk-scorer";
import { computeFollowUp } from "@/lib/decision-engine/follow-up-engine";
import type {
  AgingBucket,
  DECollectionAction,
  DEActionOperationalPayload,
  DEPendingInvoice,
  RiskLevel,
} from "@/lib/decision-engine/de-types";
import {
  RISK_LEVEL_SCORES,
  riskLevelFromScore,
} from "@/lib/decision-engine/de-types";
import {
  createFollowUpDeduped,
  scheduleDateToTimestamptz,
} from "@/lib/data/decision-follow-up-repository";
import {
  selectOperationalStateByCustomer,
  upsertOperationalState,
} from "@/lib/data/decision-operational-state-repository";

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

export function collectionActionToDE(action: CollectionAction): DECollectionAction {
  return {
    id: action.id,
    company_id: action.companyId,
    action_type: action.actionType,
    status: action.status,
    priority: action.priority,
    notes: action.notes,
    promise_date: action.promiseDate,
    promise_amount: action.promiseAmount,
    promise_currency: action.promiseCurrency,
    contact_date: action.contactDate,
    created_at: action.createdAt,
  };
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function agingBucketFromDays(days: number): AgingBucket {
  if (days <= 0) return "not_due";
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

function companyPendingSignals(
  companyId: string,
  invoices: DEPendingInvoice[],
  ref: Date
): { oldest_days: number; dominant_bucket: AgingBucket } {
  const companyInvoices = invoices.filter((i) => i.company_id === companyId && i.balance_amount > 0);
  if (companyInvoices.length === 0) {
    return { oldest_days: 0, dominant_bucket: "not_due" };
  }

  let oldestDays = 0;
  let dominantBucket: AgingBucket = "not_due";
  let maxBalance = 0;

  for (const inv of companyInvoices) {
    const due = inv.due_date ? new Date(inv.due_date) : null;
    const days = due && !isNaN(due.getTime()) ? Math.max(0, daysBetween(due, ref)) : 0;
    if (days > oldestDays) oldestDays = days;
    if (inv.balance_amount > maxBalance) {
      maxBalance = inv.balance_amount;
      dominantBucket = agingBucketFromDays(days);
    }
  }

  return { oldest_days: oldestDays, dominant_bucket: dominantBucket };
}

type ActionSignals = {
  collection_status: string | null;
  last_action_type: string | null;
  last_action_date: string | null;
  has_active_promise: boolean;
  promise_date: string | null;
  days_since_contact: number | null;
  has_escalation: boolean;
  has_broken_promise: boolean;
};

function extractActionSignals(
  companyId: string,
  actions: DECollectionAction[],
  now: Date
): ActionSignals {
  const companyActions = actions
    .filter((a) => a.company_id === companyId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (companyActions.length === 0) {
    return {
      collection_status: null,
      last_action_type: null,
      last_action_date: null,
      has_active_promise: false,
      promise_date: null,
      days_since_contact: null,
      has_escalation: false,
      has_broken_promise: false,
    };
  }

  const latest = companyActions[0]!;
  const contactDates = companyActions
    .filter((a) => a.contact_date != null)
    .map((a) => new Date(a.contact_date!));
  const lastContact =
    contactDates.length > 0 ? contactDates.reduce((a, b) => (a > b ? a : b)) : null;

  const promise = companyActions.find(
    (a) => a.action_type === "payment_promise" && a.promise_date != null && a.status !== "paid"
  );
  const hasActivePromise =
    !!promise && !!promise.promise_date && new Date(promise.promise_date) > now;

  const hasBrokenPromise = companyActions.some(
    (a) =>
      a.action_type === "payment_promise" &&
      a.promise_date != null &&
      new Date(a.promise_date) < now &&
      a.status !== "paid"
  );

  const hasEscalation = companyActions.some((a) => a.status === "escalated");

  return {
    collection_status: latest.status,
    last_action_type: latest.action_type,
    last_action_date: latest.created_at,
    has_active_promise: hasActivePromise,
    promise_date: promise?.promise_date ?? null,
    days_since_contact: lastContact ? daysBetween(lastContact, now) : null,
    has_escalation: hasEscalation,
    has_broken_promise: hasBrokenPromise,
  };
}

function countIgnoredCalls(actions: DECollectionAction[], companyId: string): number {
  return actions.filter(
    (a) =>
      a.company_id === companyId &&
      a.action_type === "call" &&
      a.status === "pending_review"
  ).length;
}

function priorityFromCollection(priority: string): RiskLevel {
  if (priority === "critical" || priority === "high" || priority === "medium" || priority === "low") {
    return priority;
  }
  return "medium";
}

async function loadPendingInvoicesForCompany(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  companyId: string
): Promise<DEPendingInvoice[]> {
  const { data, error } = await supabase
    .from("proto_invoices")
    .select("id, company_id, currency_code, total_amount, balance_amount, issue_date, due_date, status")
    .eq("workspace_company_id", tenantCompanyId)
    .eq("company_id", companyId)
    .eq("is_active", true)
    .gt("balance_amount", 0)
    .gte("issue_date", COPILOT_OPERATIONAL_START_DATE)
    .limit(500);

  if (error) {
    console.warn("DE: loadPendingInvoicesForCompany (non-fatal):", error.message);
    return [];
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row["id"] ?? ""),
    company_id: String(row["company_id"] ?? ""),
    currency_code: String(row["currency_code"] ?? "UYU"),
    total_amount: Number(row["total_amount"] ?? 0),
    balance_amount: Number(row["balance_amount"] ?? 0),
    issue_date: typeof row["issue_date"] === "string" ? row["issue_date"] : null,
    due_date: typeof row["due_date"] === "string" ? row["due_date"] : null,
    status: typeof row["status"] === "string" ? row["status"] : null,
  }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function persistActionOperationalUpdate(
  supabase: SupabaseClient,
  tenantCompanyId: string,
  action: CollectionAction,
  recentActions: DECollectionAction[]
): Promise<DEActionOperationalPayload> {
  const ref = new Date();
  const companyId = action.companyId;

  const [existingState, pendingInvoices] = await Promise.all([
    selectOperationalStateByCustomer(supabase, tenantCompanyId, companyId),
    loadPendingInvoicesForCompany(supabase, tenantCompanyId, companyId),
  ]);

  const signals = extractActionSignals(companyId, recentActions, ref);
  const pendingSignals = companyPendingSignals(companyId, pendingInvoices, ref);

  const totalPending = pendingInvoices.reduce((s, i) => s + i.balance_amount, 0);
  const concentrationPct =
    totalPending > 0
      ? Math.round(
          (pendingInvoices.reduce((s, i) => s + i.balance_amount, 0) / totalPending) * 100
        )
      : 0;

  const riskAssessment = computeClientRiskScore({
    oldest_days: pendingSignals.oldest_days,
    dominant_bucket: pendingSignals.dominant_bucket,
    concentration_pct: concentrationPct,
    has_active_promise: signals.has_active_promise,
    has_broken_promise: signals.has_broken_promise,
    days_since_contact: signals.days_since_contact,
    invoice_count: pendingInvoices.length,
  });

  const baseScore = existingState
    ? RISK_LEVEL_SCORES[existingState.current_risk]
    : riskAssessment.score;

  const actionImpact = computeActionImpact({
    action_type: action.actionType,
    action_status: action.status,
    current_risk_score: baseScore,
    has_active_promise: signals.has_active_promise,
    has_broken_promise: signals.has_broken_promise,
    has_escalation: signals.has_escalation,
    ignored_call_count: countIgnoredCalls(recentActions, companyId),
  });

  const adjustedScore = Math.max(0, Math.min(100, baseScore + actionImpact.risk_delta));
  const currentRisk = riskLevelFromScore(adjustedScore);

  const followUpResult = computeFollowUp(
    {
      last_action_type: signals.last_action_type,
      last_action_date: signals.last_action_date,
      last_action_status: signals.collection_status,
      promise_date: signals.promise_date,
      has_active_promise: signals.has_active_promise,
      has_broken_promise: signals.has_broken_promise,
      has_escalation: signals.has_escalation,
      oldest_days: pendingSignals.oldest_days,
      risk_score: adjustedScore,
      days_since_contact: signals.days_since_contact,
    },
    ref
  );

  const lastContactAt =
    action.contactDate != null
      ? scheduleDateToTimestamptz(action.contactDate)
      : existingState?.last_contact_at ?? null;

  const nextFollowUpAt = followUpResult.next_follow_up_at
    ? scheduleDateToTimestamptz(followUpResult.next_follow_up_at)
    : null;

  const currentPriority = priorityFromCollection(action.priority);

  const operationalRow = await upsertOperationalState(supabase, tenantCompanyId, {
    customerId: companyId,
    currentRisk,
    currentPriority,
    operationalState: followUpResult.operational_state,
    nextFollowUpAt,
    lastContactAt,
    activePromise: signals.has_active_promise,
    escalated: signals.has_escalation || action.status === "escalated",
  });

  let followUpRow = null;
  if (actionImpact.requires_follow_up && followUpResult.next_follow_up_at) {
    followUpRow = await createFollowUpDeduped(supabase, tenantCompanyId, {
      customerId: companyId,
      scheduledFor: followUpResult.next_follow_up_at,
      reason: followUpResult.follow_up_reason,
      sourceActionId: action.id,
      priority: currentRisk,
    });
  }

  return {
    operational_state: operationalRow,
    follow_up: followUpRow,
    action_impact: actionImpact,
    follow_up_result: followUpResult,
  };
}
