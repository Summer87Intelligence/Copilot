import { describe, expect, it } from "vitest";

import {
  buildDailyOperationsQueue,
  computeTaskPriorityScore,
  reprioritizeOperationalTasks,
} from "@/lib/decision-engine/daily-operations-queue";
import type {
  DailyOperationsQueueInput,
  DecisionEngineDataBundle,
  OperationalTask,
  RankedClient,
} from "@/lib/decision-engine/de-types";
import { FALLBACK_FOLLOW_UP_RESULT } from "@/lib/decision-engine/de-types";

const TEST_RISK = {
  score: 50,
  level: "medium" as const,
  aging_component: 10,
  concentration_component: 5,
  behavior_component: 0,
  contact_component: 0,
};

const NOW = new Date("2026-05-18T12:00:00.000Z");

function baseBundle(overrides: Partial<DecisionEngineDataBundle> = {}): DecisionEngineDataBundle {
  return {
    pendingInvoices: [],
    recentInvoices: [],
    recentReceipts: [],
    companies: [{ id: "c1", name: "Cliente Alpha" }],
    recentActions: [],
    operationalStates: [],
    pendingFollowUps: [],
    loadedAt: NOW.toISOString(),
    ...overrides,
  };
}

function rankedClient(overrides: Partial<RankedClient> = {}): RankedClient {
  return {
    company_id: "c1",
    company_name: "Cliente Alpha",
    currency_code: "UYU",
    pending_amount: 50_000,
    invoice_count: 2,
    oldest_days: 95,
    dominant_bucket: "90+",
    concentration_pct: 45,
    score: 85,
    instruction: "llamar_hoy",
    instruction_label: "Llamar hoy",
    reason: "test",
    evidence: [],
    collection_status: null,
    last_action_date: "2026-04-01",
    promise_date: null,
    risk_assessment: { ...TEST_RISK, score: 80, level: "high" },
    recommendation: {
      action: "call",
      channel: "phone",
      urgency: "high",
      rationale: ["test"],
      confidence: 80,
      next_suggested_at: null,
    },
    follow_up_result: { ...FALLBACK_FOLLOW_UP_RESULT, sla_status: "overdue" },
    ...overrides,
  } as RankedClient;
}

function input(overrides: Partial<DailyOperationsQueueInput> = {}): DailyOperationsQueueInput {
  return {
    bundle: baseBundle({
      pendingInvoices: [
        {
          id: "i1",
          company_id: "c1",
          currency_code: "UYU",
          total_amount: 50_000,
          balance_amount: 50_000,
          issue_date: "2025-06-01",
          due_date: "2025-12-01",
          status: "pending",
        },
      ],
    }),
    ranked: [rankedClient()],
    portfolio_score: {
      score: 55,
      band: "riesgo_moderado",
      band_label: "Riesgo moderado",
      effectiveness_score: 70,
      aging_score: 60,
      concentration_score: 40,
      total_pending_uyu: 100_000,
      total_pending_usd: 0,
      active_debtors_count: 1,
      effectiveness_pct: 70,
      over90_pct: 20,
    },
    now: NOW,
    ...overrides,
  };
}

describe("computeTaskPriorityScore", () => {
  it("boosts SLA breach and aging", () => {
    const base = computeTaskPriorityScore({
      company_id: "c1",
      company_name: "X",
      currency_code: "UYU",
      pending_amount: 10_000,
      oldest_days: 95,
      concentration_pct: 10,
      dominant_bucket: "90+",
      risk_level: "medium",
      risk_score: 40,
      machine_state: "critical",
      breached_sla: true,
      active_promise: false,
      promise_date: null,
      promise_due_today: false,
      promise_expired: false,
      days_since_contact: 20,
      has_broken_promise: false,
      has_escalation: false,
      collection_status: null,
      instruction: null,
      next_follow_up_at: null,
    });
    const noBreach = computeTaskPriorityScore({
      company_id: "c1",
      company_name: "X",
      currency_code: "UYU",
      pending_amount: 10_000,
      oldest_days: 10,
      concentration_pct: 10,
      dominant_bucket: "0-30",
      risk_level: "medium",
      risk_score: 40,
      machine_state: "monitoring",
      breached_sla: false,
      active_promise: false,
      promise_date: null,
      promise_due_today: false,
      promise_expired: false,
      days_since_contact: 2,
      has_broken_promise: false,
      has_escalation: false,
      collection_status: null,
      instruction: null,
      next_follow_up_at: null,
    });
    expect(base).toBeGreaterThan(noBreach);
  });
});

describe("buildDailyOperationsQueue — ordering", () => {
  it("orders urgent_today by priority_score descending", () => {
    const queue = buildDailyOperationsQueue(
      input({
        bundle: baseBundle({
          pendingInvoices: [
            {
              id: "i1",
              company_id: "c1",
              currency_code: "UYU",
              total_amount: 80_000,
              balance_amount: 80_000,
              issue_date: "2025-01-01",
              due_date: "2025-06-01",
              status: "pending",
            },
            {
              id: "i2",
              company_id: "c2",
              currency_code: "UYU",
              total_amount: 5_000,
              balance_amount: 5_000,
              issue_date: "2026-04-01",
              due_date: "2026-05-01",
              status: "pending",
            },
          ],
          companies: [
            { id: "c1", name: "Alto" },
            { id: "c2", name: "Bajo" },
          ],
          operationalStates: [
            {
              customer_id: "c1",
              current_risk: "critical",
              machine_state: "critical",
              legacy_follow_up_state: "overdue_no_contact",
              previous_state: null,
              transitioned_at: "2026-05-01T00:00:00.000Z",
              transition_reason: "90+",
              breached_sla: true,
              next_follow_up_at: null,
              last_contact_at: null,
              active_promise: false,
              escalated: true,
              updated_at: NOW.toISOString(),
            },
          ],
        }),
        ranked: [
          rankedClient({ company_id: "c1", company_name: "Alto", pending_amount: 80_000, score: 90 }),
          rankedClient({
            company_id: "c2",
            company_name: "Bajo",
            pending_amount: 5_000,
            oldest_days: 10,
            score: 30,
            instruction: "monitorear",
            risk_assessment: { ...TEST_RISK, score: 20, level: "low" },
          }),
        ],
      })
    );

    const urgent = queue.sections.urgent_today;
    expect(urgent.length).toBeGreaterThan(0);
    for (let i = 1; i < urgent.length; i++) {
      expect(urgent[i - 1]!.priority_score).toBeGreaterThanOrEqual(urgent[i]!.priority_score);
    }
  });
});

describe("buildDailyOperationsQueue — grouping", () => {
  it("groups promises due today", () => {
    const queue = buildDailyOperationsQueue(
      input({
        bundle: baseBundle({
          pendingInvoices: [
            {
              id: "i1",
              company_id: "c1",
              currency_code: "UYU",
              total_amount: 10_000,
              balance_amount: 10_000,
              issue_date: "2026-01-01",
              due_date: "2026-05-01",
              status: "pending",
            },
          ],
          recentActions: [
            {
              id: "a1",
              company_id: "c1",
              action_type: "payment_promise",
              status: "promised_payment",
              priority: "medium",
              notes: null,
              promise_date: "2026-05-18",
              promise_amount: 1000,
              promise_currency: "UYU",
              contact_date: null,
              created_at: "2026-05-17T10:00:00.000Z",
            },
          ],
          operationalStates: [
            {
              customer_id: "c1",
              current_risk: "medium",
              machine_state: "payment_promised",
              legacy_follow_up_state: "awaiting_promise",
              previous_state: "monitoring",
              transitioned_at: "2026-05-17T00:00:00.000Z",
              transition_reason: "Promesa",
              breached_sla: false,
              next_follow_up_at: "2026-05-19T12:00:00.000Z",
              last_contact_at: null,
              active_promise: true,
              escalated: false,
              updated_at: NOW.toISOString(),
            },
          ],
        }),
        ranked: [
          rankedClient({
            promise_date: "2026-05-18",
            instruction: "esperar_promesa",
          }),
        ],
      })
    );

    const group = queue.groups.find((g) => g.key === "promise_due:today");
    expect(group).toBeDefined();
    expect(queue.stats.promises_due_today).toBeGreaterThan(0);
  });

  it("groups critical concentration", () => {
    const queue = buildDailyOperationsQueue(input());
    const group = queue.groups.find((g) => g.key === "concentration:critical");
    expect(group).toBeDefined();
    const all = Object.values(queue.sections).flat();
    expect(all.some((t) => t.category === "high_concentration")).toBe(true);
  });
});

describe("buildDailyOperationsQueue — escalation & stale", () => {
  it("creates escalation_review for escalated state", () => {
    const queue = buildDailyOperationsQueue(
      input({
        bundle: baseBundle({
          pendingInvoices: [
            {
              id: "i1",
              company_id: "c1",
              currency_code: "UYU",
              total_amount: 20_000,
              balance_amount: 20_000,
              issue_date: "2026-01-01",
              due_date: "2026-02-01",
              status: "pending",
            },
          ],
          operationalStates: [
            {
              customer_id: "c1",
              current_risk: "high",
              machine_state: "escalated",
              legacy_follow_up_state: "escalated_active",
              previous_state: "follow_up",
              transitioned_at: "2026-05-10T00:00:00.000Z",
              transition_reason: "Escalación",
              breached_sla: true,
              next_follow_up_at: "2026-05-19T12:00:00.000Z",
              last_contact_at: null,
              active_promise: false,
              escalated: true,
              updated_at: NOW.toISOString(),
            },
          ],
        }),
      })
    );

    const task = [
      ...queue.sections.urgent_today,
      ...queue.sections.high_impact,
    ].find((t) => t.category === "escalation_review");
    expect(task).toBeDefined();
    expect(task!.breached_sla).toBe(true);
  });

  it("detects stale contact", () => {
    const queue = buildDailyOperationsQueue(
      input({
        ranked: [
          rankedClient({
            last_action_date: "2026-03-01",
            oldest_days: 40,
          }),
        ],
      })
    );

    const all = Object.values(queue.sections).flat();
    expect(all.some((t) => t.category === "stale_contact")).toBe(true);
  });
});

describe("reprioritizeOperationalTasks", () => {
  it("re-sorts after score bump", () => {
    const tasks: OperationalTask[] = [
      {
        id: "c1:call_today",
        customer_id: "c1",
        company_name: "A",
        section: "this_week",
        category: "call_today",
        priority: "medium",
        impact: "medium",
        source: "risk_ranker",
        title: "A",
        action_label: "Call",
        reason: "r",
        priority_score: 50,
        currency_code: "UYU",
        pending_amount: 1000,
        oldest_days: 10,
        risk_level: "medium",
        machine_state: "follow_up",
        breached_sla: false,
        group_key: null,
        group_label: null,
        due_at: null,
      },
      {
        id: "c2:call_today",
        customer_id: "c2",
        company_name: "B",
        section: "this_week",
        category: "call_today",
        priority: "medium",
        impact: "medium",
        source: "risk_ranker",
        title: "B",
        action_label: "Call",
        reason: "r",
        priority_score: 40,
        currency_code: "UYU",
        pending_amount: 1000,
        oldest_days: 10,
        risk_level: "medium",
        machine_state: "follow_up",
        breached_sla: false,
        group_key: null,
        group_label: null,
        due_at: null,
      },
    ];

    const updated = reprioritizeOperationalTasks(tasks, (t) =>
      t.customer_id === "c2" ? 95 : t.priority_score
    );
    expect(updated[0]!.customer_id).toBe("c2");
    expect(updated[0]!.section).toBe("urgent_today");
  });
});
