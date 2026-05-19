/**
 * Phase 5D — Automation Effectiveness Engine.
 * Agrupa AutomationActionRow por rule_key y calcula ruido/efectividad.
 * Puro: sin imports de DB, sin side effects.
 */

import type { AutomationActionRow, AutomationRunRow } from "@/lib/decision-engine/de-types";
import type {
  AutomationEffectivenessSnapshot,
  AutomationNoiseLevel,
  AutomationRuleEffectivenessRow,
  LearningOutcome,
  StrategicLearningContext,
} from "./learning-types";

const RULE_LABELS: Record<string, string> = {
  promise_overdue_no_action_24h: "Promesa vencida sin acción 24h",
  critical_unowned_2h:           "Crítico sin dueño 2h",
  sla_breach_48h:                "Incumplimiento SLA 48h",
  no_contact_14d:                "Sin contacto 14 días",
  concentration_critical_alert:  "Alerta concentración crítica",
  aging_90d_manual_review:       "Antigüedad 90d → revisión manual",
  partial_payment_plan:          "Pago parcial → plan de pago",
};

function labelFor(ruleKey: string): string {
  return RULE_LABELS[ruleKey] ?? ruleKey.replace(/_/g, " ");
}

function noiseLevel(dedupeRatio: number): AutomationNoiseLevel {
  if (dedupeRatio >= 0.6) return "critical";
  if (dedupeRatio >= 0.4) return "high";
  if (dedupeRatio >= 0.2) return "medium";
  return "low";
}

function recommendation(level: AutomationNoiseLevel, ruleKey: string): string {
  switch (level) {
    case "critical":
      return `Revisar y posiblemente deshabilitar la regla "${labelFor(ruleKey)}" — alta redundancia.`;
    case "high":
      return `Ajustar ventana de tiempo o condiciones de la regla "${labelFor(ruleKey)}".`;
    case "medium":
      return `Monitorear "${labelFor(ruleKey)}" — deduplicación moderada detectada.`;
    default:
      return `Regla "${labelFor(ruleKey)}" operando correctamente.`;
  }
}

function computeRows(
  automationActions: AutomationActionRow[],
  existingOutcomes: LearningOutcome[]
): AutomationRuleEffectivenessRow[] {
  // Group actions by rule_key
  const byRule = new Map<string, AutomationActionRow[]>();
  for (const a of automationActions) {
    const arr = byRule.get(a.rule_key) ?? [];
    arr.push(a);
    byRule.set(a.rule_key, arr);
  }

  // Index positive outcomes by source_id for lookup
  const positiveOutcomeIds = new Set(
    existingOutcomes
      .filter((o) =>
        o.source_type === "automation_action" &&
        (o.outcome_type === "payment_received" ||
          o.outcome_type === "promise_kept" ||
          o.outcome_type === "recovered")
      )
      .map((o) => o.source_id)
  );

  const rows: AutomationRuleEffectivenessRow[] = [];
  for (const [ruleKey, ruleActions] of byRule) {
    const total         = ruleActions.length;
    const executed      = ruleActions.filter((a) => a.executed).length;
    const deduped       = total - executed;
    const dedupeRatio   = total > 0 ? deduped / total : 0;
    const positive      = ruleActions.filter((a) => positiveOutcomeIds.has(a.id)).length;
    const level         = noiseLevel(dedupeRatio);

    rows.push({
      rule_key:         ruleKey,
      rule_label:       labelFor(ruleKey),
      total_triggered:  total,
      deduped_count:    deduped,
      executed_count:   executed,
      outcomes_positive: positive,
      dedupe_ratio:     Math.round(dedupeRatio * 100) / 100,
      noise_level:      level,
      recommendation:   recommendation(level, ruleKey),
    });
  }

  // Sort: noisiest first
  return rows.sort((a, b) => b.dedupe_ratio - a.dedupe_ratio);
}

function overallDedupeRatio(rows: AutomationRuleEffectivenessRow[]): number {
  const totalTriggered = rows.reduce((s, r) => s + r.total_triggered, 0);
  const totalDeduped   = rows.reduce((s, r) => s + r.deduped_count, 0);
  if (totalTriggered === 0) return 0;
  return Math.round((totalDeduped / totalTriggered) * 100) / 100;
}

function buildInsight(
  rows: AutomationRuleEffectivenessRow[],
  overallRatio: number
): string {
  if (rows.length === 0) return "Sin datos de automatización para analizar.";
  const noisyCount = rows.filter(
    (r) => r.noise_level === "high" || r.noise_level === "critical"
  ).length;
  if (noisyCount === 0) {
    return `Automatización eficiente: ratio de deduplicación global ${Math.round(overallRatio * 100)}%. Sin reglas ruidosas detectadas.`;
  }
  return (
    `${noisyCount} regla(s) con alto nivel de ruido. ` +
    `Ratio de deduplicación global: ${Math.round(overallRatio * 100)}%. ` +
    `Revisar reglas marcadas como "high" o "critical".`
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function computeAutomationEffectiveness(
  context: StrategicLearningContext
): AutomationEffectivenessSnapshot {
  const { automationActions, existingOutcomes } = context;
  const nowIso = context.loadedAt;

  const allRows   = computeRows(automationActions, existingOutcomes);
  const noisy     = allRows.filter((r) => r.noise_level === "high" || r.noise_level === "critical");
  const effective = allRows.filter((r) => r.noise_level === "low" || r.noise_level === "medium");
  const ratio     = overallDedupeRatio(allRows);

  return {
    generated_at:          nowIso,
    total_rules_evaluated: allRows.length,
    noisy_rules:           noisy,
    effective_rules:       effective,
    all_rules:             allRows,
    overall_dedupe_ratio:  ratio,
    insight:               buildInsight(allRows, ratio),
  };
}
