/**
 * Phase 5D — Action Effectiveness Engine.
 * Proxy: DECollectionAction × DERecentReceipt (7-day window).
 * Primary: LearningOutcome cuando hay ≥10 registros.
 * Puro: sin imports de DB, sin side effects.
 */

import type { DECollectionAction, DERecentReceipt } from "@/lib/decision-engine/de-types";
import type {
  ActionEffectivenessRow,
  ActionEffectivenessSnapshot,
  LearningOutcome,
  LearningOutcomeType,
  StrategicLearningContext,
} from "./learning-types";

const PAYMENT_WINDOW_DAYS = 7;
const MIN_OUTCOMES_FOR_PRIMARY = 10;
const MIN_ACTIONS_FOR_PROXY = 5;

const ACTION_LABELS: Record<string, string> = {
  llamar_hoy:      "Llamar hoy",
  escalar:         "Escalar",
  recordatorio:    "Enviar recordatorio",
  seguimiento:     "Seguimiento",
  monitorear:      "Monitorear",
  esperar_promesa: "Esperar promesa",
  send_reminder:   "Recordatorio",
  manual_call:     "Llamada manual",
  escalate:        "Escalar",
  payment_plan:    "Plan de pago",
  hold_credit:     "Retener crédito",
  monitor:         "Monitorear",
  no_action:       "Sin acción",
};

function labelFor(actionType: string): string {
  return ACTION_LABELS[actionType] ?? actionType.replace(/_/g, " ");
}

function daysBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000;
}

// ---------------------------------------------------------------------------
// Proxy path (no formal outcomes yet)
// ---------------------------------------------------------------------------

function computeProxyRows(
  actions: DECollectionAction[],
  receipts: DERecentReceipt[],
  nowIso: string
): ActionEffectivenessRow[] {
  const byType = new Map<string, DECollectionAction[]>();
  for (const a of actions) {
    const arr = byType.get(a.action_type) ?? [];
    arr.push(a);
    byType.set(a.action_type, arr);
  }

  const rows: ActionEffectivenessRow[] = [];
  for (const [actionType, typeActions] of byType) {
    let paymentCount = 0;
    let promiseKeptCount = 0;
    let promiseBrokenCount = 0;
    let noResponseCount = 0;
    let recoveredCount = 0;
    let totalAmount = 0;
    let amountCount = 0;
    let totalDays = 0;
    let daysCount = 0;

    for (const action of typeActions) {
      const anchor = action.contact_date ?? action.created_at;
      const receipt = receipts.find((r) => {
        if (r.company_id !== action.company_id) return false;
        const diff = daysBetween(anchor, r.receipt_date);
        return diff >= 0 && diff <= PAYMENT_WINDOW_DAYS;
      });

      if (receipt) {
        paymentCount++;
        recoveredCount++;
        totalAmount += receipt.amount;
        amountCount++;
        const d = daysBetween(anchor, receipt.receipt_date);
        if (d >= 0) { totalDays += d; daysCount++; }
      }

      if (action.promise_date) {
        if (receipt) {
          promiseKeptCount++;
        } else if (daysBetween(action.promise_date, nowIso) > 3) {
          promiseBrokenCount++;
        }
      } else if (!receipt && daysBetween(anchor, nowIso) > PAYMENT_WINDOW_DAYS) {
        noResponseCount++;
      }
    }

    const total = typeActions.length;
    rows.push({
      action_type:             actionType,
      action_label:            labelFor(actionType),
      total_actions:           total,
      payment_within_7d_count: paymentCount,
      promise_kept_count:      promiseKeptCount,
      promise_broken_count:    promiseBrokenCount,
      no_response_count:       noResponseCount,
      recovered_count:         recoveredCount,
      avg_recovery_amount:
        amountCount > 0 ? Math.round(totalAmount / amountCount) : 0,
      avg_days_to_payment:
        daysCount > 0 ? Math.round(totalDays / daysCount) : null,
      effectiveness_pct:
        total > 0
          ? Math.round(((paymentCount + promiseKeptCount) / total) * 100)
          : 0,
      sample_size: total,
    });
  }

  return rows.sort((a, b) => b.effectiveness_pct - a.effectiveness_pct);
}

// ---------------------------------------------------------------------------
// Primary path (formal outcomes)
// ---------------------------------------------------------------------------

function computeRowsFromOutcomes(
  outcomes: LearningOutcome[],
  actions: DECollectionAction[]
): ActionEffectivenessRow[] {
  const actionById = new Map(actions.map((a) => [a.id, a]));

  const byType = new Map<string, LearningOutcome[]>();
  for (const o of outcomes) {
    const action = actionById.get(o.source_id);
    const t = action?.action_type ?? "unknown";
    const arr = byType.get(t) ?? [];
    arr.push(o);
    byType.set(t, arr);
  }

  const POSITIVE: LearningOutcomeType[] = ["payment_received", "promise_kept", "recovered"];
  const rows: ActionEffectivenessRow[] = [];

  for (const [actionType, typeOutcomes] of byType) {
    const paymentCount  = typeOutcomes.filter((o) => o.outcome_type === "payment_received").length;
    const promiseKept   = typeOutcomes.filter((o) => o.outcome_type === "promise_kept").length;
    const promiseBroken = typeOutcomes.filter((o) => o.outcome_type === "promise_broken").length;
    const noResponse    = typeOutcomes.filter((o) => o.outcome_type === "no_response").length;
    const recovered     = typeOutcomes.filter((o) => o.outcome_type === "recovered").length;
    const amounts = typeOutcomes
      .filter((o) => POSITIVE.includes(o.outcome_type) && o.outcome_amount !== null)
      .map((o) => o.outcome_amount as number);
    const total = typeOutcomes.length;

    rows.push({
      action_type:             actionType,
      action_label:            labelFor(actionType),
      total_actions:           total,
      payment_within_7d_count: paymentCount,
      promise_kept_count:      promiseKept,
      promise_broken_count:    promiseBroken,
      no_response_count:       noResponse,
      recovered_count:         recovered,
      avg_recovery_amount:
        amounts.length > 0
          ? Math.round(amounts.reduce((s, v) => s + v, 0) / amounts.length)
          : 0,
      avg_days_to_payment: null,
      effectiveness_pct:
        total > 0
          ? Math.round(((paymentCount + promiseKept + recovered) / total) * 100)
          : 0,
      sample_size: total,
    });
  }

  return rows.sort((a, b) => b.effectiveness_pct - a.effectiveness_pct);
}

// ---------------------------------------------------------------------------
// Insight builder
// ---------------------------------------------------------------------------

function buildInsight(rows: ActionEffectivenessRow[]): string {
  if (rows.length === 0) return "Sin datos suficientes para analizar efectividad de acciones.";
  const top = rows[0]!;
  if (rows.length === 1) {
    return `"${top.action_label}" tiene una efectividad de ${top.effectiveness_pct}% (${top.total_actions} acciones).`;
  }
  const worst = rows[rows.length - 1]!;
  return (
    `"${top.action_label}" es la acción más efectiva (${top.effectiveness_pct}%). ` +
    `"${worst.action_label}" tiene la menor efectividad (${worst.effectiveness_pct}%). ` +
    `${rows.reduce((s, r) => s + r.total_actions, 0)} acciones analizadas.`
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function computeActionEffectiveness(
  context: StrategicLearningContext
): ActionEffectivenessSnapshot {
  const { bundle, existingOutcomes } = context;
  const nowIso = context.loadedAt;

  let rows: ActionEffectivenessRow[];
  let dataSource: ActionEffectivenessSnapshot["data_source"];

  if (existingOutcomes.length >= MIN_OUTCOMES_FOR_PRIMARY) {
    rows = computeRowsFromOutcomes(existingOutcomes, bundle.recentActions);
    dataSource = "outcomes";
  } else if (bundle.recentActions.length >= MIN_ACTIONS_FOR_PROXY) {
    rows = computeProxyRows(bundle.recentActions, bundle.recentReceipts, nowIso);
    dataSource = "proxy";
  } else {
    rows = [];
    dataSource = "insufficient";
  }

  return {
    generated_at:            nowIso,
    total_outcomes_analyzed: existingOutcomes.length > 0 ? existingOutcomes.length : bundle.recentActions.length,
    by_action_type:          rows,
    top_performing_action:   rows[0]?.action_type ?? null,
    worst_performing_action: rows.length > 1 ? rows[rows.length - 1]!.action_type : null,
    insight:                 buildInsight(rows),
    data_source:             dataSource,
  };
}
