import { describe, expect, it } from "vitest";

import type { ClientOperationalSummary, OperationalTask } from "@/lib/decision-engine/de-types";
import {
  buildOperationalBadges,
  compactImpactBullets,
  compactReasonChips,
  severityBadge,
  slaBadge,
} from "@/lib/decision-engine/client-operational-display";

function summary(overrides: Partial<ClientOperationalSummary> = {}): ClientOperationalSummary {
  const task: OperationalTask = {
    id: "t1",
    customer_id: "c1",
    company_name: "Test",
    section: "urgent_today",
    category: "call_today",
    priority: "critical",
    impact: "high",
    source: "state_machine",
    title: "x",
    action_label: "Llamar hoy",
    reason: "SLA",
    priority_score: 90,
    currency_code: "USD",
    pending_amount: 500,
    oldest_days: 95,
    risk_level: "critical",
    machine_state: "escalated",
    breached_sla: true,
    group_key: null,
    group_label: null,
    due_at: null,
  };
  return {
    customer_id: "c1",
    customer_name: "Test",
    highest_priority: "critical",
    machine_state: "escalated",
    risk_level: "critical",
    primary_action: task,
    secondary_actions: [],
    reasons: ["90 días vencido", "SLA operativo vencido"],
    total_pending_amount: 500,
    pending_currency_breakdown: { uyu: 0, usd: 500 },
    concentration_percent: 50,
    expected_impact: {
      recovery_amount: 500,
      risk_reduction: "high",
      concentration_reduction: 7.5,
    },
    sla_breached: true,
    actionable_now: true,
    tasks_count: 2,
    generated_from: ["state_machine"],
    ...overrides,
  };
}

describe("client-operational-display", () => {
  it("badges separados — severidad, máquina, SLA, aging", () => {
    const badges = buildOperationalBadges(summary());
    expect(severityBadge("critical").label).toBe("Prioridad crítica");
    expect(badges.some((b) => b.label === "ESCALADO")).toBe(true);
    expect(badges.some((b) => b.label === "SLA atrasado")).toBe(true);
    expect(badges.some((b) => b.label === "+90 días")).toBe(true);
    expect(badges.find((b) => b.label.includes("·"))).toBeUndefined();
  });

  it("chips compactos de razones", () => {
    const chips = compactReasonChips(summary());
    expect(chips.some((c) => c.label === "+90 días")).toBe(true);
    expect(chips.some((c) => c.label.includes("Conc"))).toBe(true);
  });

  it("impacto en bullets ejecutivos", () => {
    const bullets = compactImpactBullets(summary());
    expect(bullets[0]?.text).toMatch(/Recuperar USD/);
    expect(bullets.some((b) => b.text.includes("riesgo"))).toBe(true);
    expect(bullets.some((b) => b.text.includes("concentración"))).toBe(true);
  });

  it("sla ok cuando no breach", () => {
    expect(slaBadge(false, false).label).toBe("SLA al día");
  });
});
