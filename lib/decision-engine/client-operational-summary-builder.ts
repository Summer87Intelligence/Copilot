/**
 * Phase 3A — agrupa OperationalTask[] por cliente en resúmenes ejecutivos.
 */

import type {
  ClientOperationalSummary,
  OperationalTask,
  QueueSection,
  RiskLevel,
  TaskCategory,
  TaskPriority,
  TaskSource,
} from "@/lib/decision-engine/de-types";
import { calculateExpectedImpact } from "@/lib/decision-engine/expected-impact-calculator";

const PRIORITY_RANK: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Orden de acción dentro del mismo nivel de prioridad (menor = más urgente). */
const CATEGORY_ACTION_RANK: Record<TaskCategory, number> = {
  call_today: 0,
  promise_follow_up: 1,
  escalation_review: 1,
  legal_review: 1,
  high_concentration: 1,
  payment_confirmation: 2,
  stale_contact: 2,
  recovery_watch: 4,
};

const RISK_RANK: Record<RiskLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const ACTIONABLE_SECTIONS: Set<QueueSection> = new Set(["urgent_today", "high_impact"]);

const MAX_REASONS = 4;
const MAX_SECONDARY_ACTIONS = 2;

function compareTasksForPrimary(a: OperationalTask, b: OperationalTask): number {
  const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (pr !== 0) return pr;
  const cr = CATEGORY_ACTION_RANK[a.category] - CATEGORY_ACTION_RANK[b.category];
  if (cr !== 0) return cr;
  return b.priority_score - a.priority_score;
}

function highestPriority(tasks: OperationalTask[]): TaskPriority {
  return tasks.reduce<TaskPriority>(
    (best, t) => (PRIORITY_RANK[t.priority] < PRIORITY_RANK[best] ? t.priority : best),
    "low"
  );
}

function highestRiskLevel(tasks: OperationalTask[]): RiskLevel {
  return tasks.reduce<RiskLevel>(
    (best, t) => (RISK_RANK[t.risk_level] < RISK_RANK[best] ? t.risk_level : best),
    "low"
  );
}

function pickPrimaryAction(tasks: OperationalTask[]): OperationalTask {
  return [...tasks].sort(compareTasksForPrimary)[0]!;
}

function pickSecondaryActions(tasks: OperationalTask[], primary: OperationalTask): OperationalTask[] {
  const seenCategories = new Set<TaskCategory>([primary.category]);
  const candidates = [...tasks]
    .filter((t) => t.id !== primary.id)
    .sort(compareTasksForPrimary);

  const secondary: OperationalTask[] = [];
  for (const t of candidates) {
    if (seenCategories.has(t.category)) continue;
    seenCategories.add(t.category);
    secondary.push(t);
    if (secondary.length >= MAX_SECONDARY_ACTIONS) break;
  }
  return secondary;
}

function parseConcentrationPercent(tasks: OperationalTask[]): number | null {
  let max: number | null = null;
  for (const t of tasks) {
    if (t.category === "high_concentration") {
      const m = /(\d+(?:\.\d+)?)\s*%/.exec(t.reason);
      if (m) {
        const pct = parseFloat(m[1]!);
        if (!isNaN(pct)) max = max == null ? pct : Math.max(max, pct);
      }
    }
  }
  return max;
}

function consolidateReasons(tasks: OperationalTask[]): string[] {
  const reasons: string[] = [];
  const seen = new Set<string>();

  function add(label: string) {
    const key = label.toLowerCase();
    if (seen.has(key) || reasons.length >= MAX_REASONS) return;
    seen.add(key);
    reasons.push(label);
  }

  const maxOldest = Math.max(...tasks.map((t) => t.oldest_days), 0);
  const anySla = tasks.some((t) => t.breached_sla);
  const anyStale = tasks.some((t) => t.category === "stale_contact");
  const anyConcentration = tasks.some((t) => t.category === "high_concentration");
  const concentrationPct = parseConcentrationPercent(tasks);

  if (maxOldest >= 90) add("90 días vencido");
  else if (maxOldest >= 60) add(`${maxOldest} días vencido`);

  if (anyStale) add("Sin contacto reciente");

  if (anyConcentration) {
    if (concentrationPct != null) {
      add(`Alta concentración (${Math.round(concentrationPct)}%)`);
    } else {
      add("Alta concentración de cartera");
    }
  }

  if (anySla) add("SLA operativo vencido");

  for (const t of tasks) {
    if (t.category === "promise_follow_up" && !seen.has("promesa")) {
      add("Promesa de pago pendiente");
    }
    if (t.category === "escalation_review" && !seen.has("escalación")) {
      add("Caso escalado");
    }
    if (t.category === "legal_review" && !seen.has("legal")) {
      add("Revisión legal activa");
    }
    if (reasons.length >= MAX_REASONS) break;
  }

  if (reasons.length === 0) {
    add(tasks[0]?.reason.slice(0, 80) ?? "Saldo pendiente activo");
  }

  return reasons;
}

function currencyBreakdown(tasks: OperationalTask[]): { uyu: number; usd: number } {
  const breakdown = { uyu: 0, usd: 0 };
  const seenByCurrency = new Map<string, number>();

  for (const t of tasks) {
    const code = t.currency_code.toUpperCase();
    const prev = seenByCurrency.get(`${t.customer_id}:${code}`) ?? 0;
    seenByCurrency.set(`${t.customer_id}:${code}`, Math.max(prev, t.pending_amount));
  }

  for (const [key, amount] of seenByCurrency) {
    const code = key.split(":")[1]!;
    if (code === "USD") breakdown.usd += amount;
    else breakdown.uyu += amount;
  }

  return breakdown;
}

function totalPendingAmount(breakdown: { uyu: number; usd: number }): number {
  return breakdown.uyu + breakdown.usd;
}

function uniqueSources(tasks: OperationalTask[]): TaskSource[] {
  return [...new Set(tasks.map((t) => t.source))];
}

function isActionableNow(tasks: OperationalTask[]): boolean {
  const hp = highestPriority(tasks);
  if (hp === "critical" || hp === "high") return true;
  return tasks.some((t) => ACTIONABLE_SECTIONS.has(t.section));
}

export function buildClientOperationalSummary(tasks: OperationalTask[]): ClientOperationalSummary | null {
  if (tasks.length === 0) return null;

  const customer_id = tasks[0]!.customer_id;
  const customer_name = tasks[0]!.company_name;
  const primary_action = pickPrimaryAction(tasks);
  const secondary_actions = pickSecondaryActions(tasks, primary_action);
  const breakdown = currencyBreakdown(tasks);
  const concentration_percent = parseConcentrationPercent(tasks);
  const risk_level = highestRiskLevel(tasks);
  const total = totalPendingAmount(breakdown);

  const machine_state =
    tasks.find((t) => t.machine_state === primary_action.machine_state)?.machine_state ??
    primary_action.machine_state ??
    null;

  return {
    customer_id,
    customer_name,
    highest_priority: highestPriority(tasks),
    machine_state,
    risk_level,
    primary_action,
    secondary_actions,
    reasons: consolidateReasons(tasks),
    total_pending_amount: total,
    pending_currency_breakdown: breakdown,
    concentration_percent,
    expected_impact: calculateExpectedImpact({
      total_pending_amount: total,
      risk_level,
      concentration_percent,
    }),
    sla_breached: tasks.some((t) => t.breached_sla),
    actionable_now: isActionableNow(tasks),
    tasks_count: tasks.length,
    generated_from: uniqueSources(tasks),
  };
}

export function buildClientOperationalSummaries(tasks: OperationalTask[]): ClientOperationalSummary[] {
  const byCustomer = new Map<string, OperationalTask[]>();
  for (const t of tasks) {
    const list = byCustomer.get(t.customer_id) ?? [];
    list.push(t);
    byCustomer.set(t.customer_id, list);
  }

  const summaries: ClientOperationalSummary[] = [];
  for (const group of byCustomer.values()) {
    const summary = buildClientOperationalSummary(group);
    if (summary) summaries.push(summary);
  }

  return summaries.sort((a, b) => {
    const pr = PRIORITY_RANK[a.highest_priority] - PRIORITY_RANK[b.highest_priority];
    if (pr !== 0) return pr;
    return b.primary_action.priority_score - a.primary_action.priority_score;
  });
}
