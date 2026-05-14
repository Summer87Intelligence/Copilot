import type { OperationalAutomationRuleDefinition } from "@/lib/copilot-operational-governance-types";

export const OPERATIONAL_AUTOMATION_RULES: OperationalAutomationRuleDefinition[] = [
  {
    id: "rule.sla.escalation_unassigned",
    name: "Escalado por SLA sin responsable",
    description:
      "Escala workflows críticos sin responsable cuando el SLA está vencido y superan el umbral de apertura.",
    category: "sla",
    defaultEnabled: true,
    riskLevel: "supervised",
    actionMode: "auto_event",
    cooldownMinutes: 60,
  },
  {
    id: "rule.recurrence.follow_up",
    name: "Seguimiento recomendado",
    description: "Sugiere follow-up cuando un workflow se reabre varias veces con la misma clave.",
    category: "recurrence",
    defaultEnabled: true,
    riskLevel: "safe",
    actionMode: "suggest_only",
    cooldownMinutes: 120,
  },
  {
    id: "rule.recurrence.pattern_detected",
    name: "Patrón recurrente detectado",
    description: "Marca workflows que reaparecen con la misma dedupeKey.",
    category: "recurrence",
    defaultEnabled: true,
    riskLevel: "safe",
    actionMode: "auto_flag",
    cooldownMinutes: 120,
  },
  {
    id: "rule.resolution.suggest_complete",
    name: "Cierre sugerido",
    description: "Sugiere completar workflows activos sin señal operativa vigente.",
    category: "resolution",
    defaultEnabled: true,
    riskLevel: "safe",
    actionMode: "suggest_only",
    cooldownMinutes: 180,
  },
  {
    id: "rule.linking.related_workflows",
    name: "Workflows relacionados",
    description: "Vincula workflows activos que comparten acciones o presión operativa.",
    category: "linking",
    defaultEnabled: true,
    riskLevel: "safe",
    actionMode: "auto_flag",
    cooldownMinutes: 60,
  },
  {
    id: "rule.risk.auto_event",
    name: "Evento operativo automático",
    description: "Registra eventos de timeline derivados de reglas supervisadas.",
    category: "risk",
    defaultEnabled: true,
    riskLevel: "supervised",
    actionMode: "auto_event",
    cooldownMinutes: 30,
  },
  {
    id: "rule.restricted.auto_complete",
    name: "Auto-completar workflow",
    description: "Reservado para futuras automatizaciones destructivas; no se ejecuta en esta fase.",
    category: "resolution",
    defaultEnabled: false,
    riskLevel: "restricted",
    actionMode: "requires_confirmation",
  },
  {
    id: "rule.restricted.auto_cancel",
    name: "Auto-cancelar workflow",
    description: "Reservado para futuras automatizaciones destructivas; no se ejecuta en esta fase.",
    category: "risk",
    defaultEnabled: false,
    riskLevel: "restricted",
    actionMode: "requires_confirmation",
  },
];

const RULES_BY_ID = new Map(OPERATIONAL_AUTOMATION_RULES.map((rule) => [rule.id, rule]));

export function getOperationalAutomationRule(
  ruleId: string
): OperationalAutomationRuleDefinition | undefined {
  return RULES_BY_ID.get(ruleId);
}

export function listOperationalAutomationRules(): OperationalAutomationRuleDefinition[] {
  return [...OPERATIONAL_AUTOMATION_RULES];
}

export const AUTOMATION_KIND_RULE_IDS = {
  auto_escalation: "rule.sla.escalation_unassigned",
  follow_up: "rule.recurrence.follow_up",
  recurring_detection: "rule.recurrence.pattern_detected",
  resolution_suggestion: "rule.resolution.suggest_complete",
  workflow_link: "rule.linking.related_workflows",
  auto_event: "rule.risk.auto_event",
} as const;
