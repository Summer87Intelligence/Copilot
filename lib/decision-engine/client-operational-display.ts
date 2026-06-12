/**
 * Phase 3B — badges, chips compactos e impacto ejecutivo (view-model puro).
 */

import type {
  ClientOperationalSummary,
  OperationalMachineState,
  TaskPriority,
} from "@/lib/decision-engine/de-types";
import { OPERATIONAL_MACHINE_STATE_LABELS } from "@/lib/decision-engine/de-types";

export type OperationalBadge = {
  id: string;
  label: string;
  tone: "critical" | "high" | "medium" | "low" | "neutral" | "success" | "warning";
};

const SEVERITY_LABELS: Record<TaskPriority, string> = {
  critical: "Prioridad crítica",
  high: "Prioridad alta",
  medium: "Prioridad media",
  low: "Prioridad baja",
};

const MACHINE_BADGE_LABELS: Record<OperationalMachineState, string> = {
  new_risk: "NUEVO RIESGO",
  monitoring: "MONITOREO",
  follow_up: "SEGUIMIENTO",
  payment_promised: "PROMESA ACTIVA",
  escalated: "ESCALADO",
  critical: "CRÍTICO",
  recovered: "RECUPERADO",
  paused: "PAUSADO",
  legal_review: "REVISIÓN LEGAL",
};

export function severityBadge(priority: TaskPriority): OperationalBadge {
  const tone =
    priority === "critical"
      ? "critical"
      : priority === "high"
        ? "high"
        : priority === "medium"
          ? "medium"
          : "low";
  return { id: "severity", label: SEVERITY_LABELS[priority], tone };
}

export function machineStateBadge(state: OperationalMachineState | null): OperationalBadge | null {
  if (!state) return null;
  const label = MACHINE_BADGE_LABELS[state] ?? OPERATIONAL_MACHINE_STATE_LABELS[state].toUpperCase();
  const tone =
    state === "escalated" || state === "critical" || state === "legal_review"
      ? "critical"
      : state === "payment_promised" || state === "follow_up"
        ? "warning"
        : state === "recovered"
          ? "success"
          : "neutral";
  return { id: "machine", label, tone };
}

export function slaBadge(breached: boolean, dueToday: boolean): OperationalBadge {
  if (breached) return { id: "sla", label: "SLA atrasado", tone: "critical" };
  if (dueToday) return { id: "sla", label: "Seguimiento hoy", tone: "warning" };
  return { id: "sla", label: "SLA al día", tone: "success" };
}

export function agingBadge(oldestDays: number): OperationalBadge | null {
  if (oldestDays >= 90) return { id: "aging", label: "+90 días", tone: "critical" };
  if (oldestDays >= 61) return { id: "aging", label: "61–90 días", tone: "high" };
  if (oldestDays >= 31) return { id: "aging", label: "31–60 días", tone: "medium" };
  if (oldestDays > 0) return { id: "aging", label: `${oldestDays} días`, tone: "low" };
  return null;
}

export function isFollowUpDueToday(dueAt: string | null, now = new Date()): boolean {
  if (!dueAt) return false;
  const d = new Date(dueAt.includes("T") ? dueAt : `${dueAt}T12:00:00`);
  if (isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function maxOldestDays(summary: ClientOperationalSummary): number {
  const fromPrimary = summary.primary_action.oldest_days;
  const fromSecondary = summary.secondary_actions.reduce(
    (m, t) => Math.max(m, t.oldest_days),
    0
  );
  return Math.max(fromPrimary, fromSecondary);
}

export function buildOperationalBadges(summary: ClientOperationalSummary): OperationalBadge[] {
  const badges: OperationalBadge[] = [severityBadge(summary.highest_priority)];
  const machine = machineStateBadge(summary.machine_state);
  if (machine) badges.push(machine);
  badges.push(
    slaBadge(
      summary.sla_breached,
      isFollowUpDueToday(summary.primary_action.due_at)
    )
  );
  const aging = agingBadge(maxOldestDays(summary));
  if (aging) badges.push(aging);
  return badges;
}

export type ReasonChip = { id: string; label: string };

export function compactReasonChips(summary: ClientOperationalSummary): ReasonChip[] {
  const chips: ReasonChip[] = [];
  const days = maxOldestDays(summary);
  if (days >= 90) chips.push({ id: "90d", label: "+90 días" });
  else if (days >= 61) chips.push({ id: "aging", label: `${days} días` });

  if (summary.reasons.some((r) => /sin contacto/i.test(r))) {
    chips.push({ id: "contact", label: "Sin contacto" });
  }
  const conc = summary.concentration_percent;
  if (conc != null) chips.push({ id: "conc", label: `Conc ${Math.round(conc)}%` });
  if (summary.sla_breached) chips.push({ id: "sla", label: "SLA atrasado" });
  if (summary.reasons.some((r) => /promesa/i.test(r))) {
    chips.push({ id: "promise", label: "Promesa" });
  }
  if (summary.reasons.some((r) => /escalad/i.test(r))) {
    chips.push({ id: "esc", label: "Escalado" });
  }

  if (chips.length === 0 && summary.reasons.length > 0) {
    return summary.reasons.slice(0, 4).map((r, i) => ({
      id: `r${i}`,
      label: r.length > 18 ? `${r.slice(0, 16)}…` : r,
    }));
  }
  return chips.slice(0, 4);
}

export type ImpactBullet = { id: string; text: string };

export function compactImpactBullets(summary: ClientOperationalSummary): ImpactBullet[] {
  const bullets: ImpactBullet[] = [];
  const { pending_currency_breakdown, expected_impact } = summary;

  if (pending_currency_breakdown.usd > 0) {
    bullets.push({
      id: "rec-usd",
      text: `Recuperar USD ${pending_currency_breakdown.usd.toLocaleString("es-UY", { maximumFractionDigits: 0 })}`,
    });
  }
  if (pending_currency_breakdown.uyu > 0) {
    bullets.push({
      id: "rec-uyu",
      text: `Recuperar UYU ${pending_currency_breakdown.uyu.toLocaleString("es-UY", { maximumFractionDigits: 0 })}`,
    });
  }
  if (bullets.length === 0 && expected_impact.recovery_amount > 0) {
    bullets.push({
      id: "rec",
      text: `Recuperar ${expected_impact.recovery_amount.toLocaleString("es-UY")}`,
    });
  }

  const riskLabel =
    expected_impact.risk_reduction === "high"
      ? "Reducir riesgo crítico"
      : expected_impact.risk_reduction === "medium"
        ? "Reducir riesgo moderado"
        : "Reducir riesgo cartera";
  bullets.push({ id: "risk", text: riskLabel });

  if (expected_impact.concentration_reduction != null && summary.concentration_percent != null) {
    const ccy =
      pending_currency_breakdown.usd >= pending_currency_breakdown.uyu ? "USD" : "UYU";
    bullets.push({ id: "conc", text: `Reducir concentración ${ccy}` });
  }

  return bullets.slice(0, 4);
}

export const BADGE_TONE_CLASS: Record<OperationalBadge["tone"], string> = {
  critical: "bg-rose-100 text-rose-800 border-rose-200",
  high: "bg-orange-50 text-orange-800 border-orange-200",
  medium: "bg-amber-50 text-amber-800 border-amber-200",
  low: "bg-slate-50 text-slate-600 border-slate-200",
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
  success: "bg-emerald-50 text-emerald-800 border-emerald-200",
  warning: "bg-amber-50 text-amber-900 border-amber-200",
};
