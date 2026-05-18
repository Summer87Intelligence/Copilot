import { describe, expect, it } from "vitest";

import {
  buildClientOperationalSummaries,
  buildClientOperationalSummary,
} from "@/lib/decision-engine/client-operational-summary-builder";
import type { OperationalTask } from "@/lib/decision-engine/de-types";

function task(overrides: Partial<OperationalTask> = {}): OperationalTask {
  return {
    id: "t1",
    customer_id: "c1",
    company_name: "Petrovic Solutions",
    section: "urgent_today",
    category: "call_today",
    priority: "critical",
    impact: "high",
    source: "state_machine",
    title: "Llamar",
    action_label: "Llamar hoy",
    reason: "SLA operativo excedido",
    priority_score: 95,
    currency_code: "USD",
    pending_amount: 936,
    oldest_days: 95,
    risk_level: "critical",
    machine_state: "escalated",
    breached_sla: true,
    group_key: null,
    group_label: null,
    due_at: null,
    ...overrides,
  };
}

describe("buildClientOperationalSummary", () => {
  it("elige acción principal por prioridad y categoría", () => {
    const tasks = [
      task({ id: "t1", category: "stale_contact", priority: "high", action_label: "Establecer contacto" }),
      task({ id: "t2", category: "call_today", priority: "critical", action_label: "Llamar hoy" }),
    ];
    const summary = buildClientOperationalSummary(tasks)!;
    expect(summary.primary_action.action_label).toBe("Llamar hoy");
    expect(summary.highest_priority).toBe("critical");
  });

  it("deduplica categorías en secundarias (máx 2)", () => {
    const tasks = [
      task({ id: "t1", category: "call_today", action_label: "Llamar hoy" }),
      task({ id: "t2", category: "call_today", action_label: "Otra llamada" }),
      task({ id: "t3", category: "stale_contact", action_label: "Contactar" }),
      task({ id: "t4", category: "high_concentration", action_label: "Plan focalizado" }),
    ];
    const summary = buildClientOperationalSummary(tasks)!;
    expect(summary.secondary_actions).toHaveLength(2);
    expect(summary.secondary_actions.map((t) => t.category).sort()).toEqual([
      "high_concentration",
      "stale_contact",
    ]);
  });

  it("consolida razones sin duplicados (máx 4)", () => {
    const summary = buildClientOperationalSummary([
      task({
        oldest_days: 95,
        breached_sla: true,
        category: "high_concentration",
        reason: "Concentra 50% de la cartera USD",
      }),
      task({
        id: "t2",
        category: "stale_contact",
        reason: "Sin contacto hace 30 días",
      }),
    ])!;
    expect(summary.reasons).toContain("90 días vencido");
    expect(summary.reasons).toContain("SLA operativo vencido");
    expect(summary.reasons.some((r) => r.includes("concentración"))).toBe(true);
    expect(summary.reasons.length).toBeLessThanOrEqual(4);
    expect(new Set(summary.reasons.map((r) => r.toLowerCase())).size).toBe(summary.reasons.length);
  });

  it("calcula impacto esperado y breakdown por moneda", () => {
    const summary = buildClientOperationalSummary([
      task({ currency_code: "USD", pending_amount: 936 }),
      task({ id: "t2", currency_code: "UYU", pending_amount: 10_000, category: "stale_contact" }),
    ])!;
    expect(summary.pending_currency_breakdown.usd).toBe(936);
    expect(summary.pending_currency_breakdown.uyu).toBe(10_000);
    expect(summary.expected_impact.recovery_amount).toBe(10_936);
    expect(summary.concentration_percent).toBeNull();
  });
});

describe("buildClientOperationalSummaries", () => {
  it("agrupa por customer_id y ordena por prioridad", () => {
    const summaries = buildClientOperationalSummaries([
      task({ customer_id: "c2", company_name: "Beta", priority: "medium", priority_score: 40 }),
      task({ customer_id: "c1", company_name: "Alpha", priority: "critical", priority_score: 90 }),
    ]);
    expect(summaries).toHaveLength(2);
    expect(summaries[0]!.customer_id).toBe("c1");
    expect(summaries[1]!.customer_id).toBe("c2");
  });
});
