import { describe, expect, it } from "vitest";

import type { DailyOperationsQueue, OperationalTask } from "@/lib/decision-engine/de-types";
import {
  allSectionsWithTasks,
  getSectionTasks,
  isCacheStale,
  isQueueEmpty,
  shouldShowLegacyFollowUpQueue,
  sliceVisibleTasks,
} from "@/lib/decision-engine/daily-operations-queue-panel.helpers";

function task(overrides: Partial<OperationalTask> = {}): OperationalTask {
  return {
    id: "t1",
    customer_id: "c1",
    company_name: "Acme",
    section: "urgent_today",
    category: "call_today",
    priority: "critical",
    impact: "high",
    source: "state_machine",
    title: "Llamar",
    action_label: "Llamar hoy",
    reason: "SLA vencido",
    priority_score: 92,
    currency_code: "UYU",
    pending_amount: 10_000,
    oldest_days: 45,
    risk_level: "high",
    machine_state: "critical",
    breached_sla: true,
    group_key: null,
    group_label: null,
    due_at: "2026-05-18",
    ...overrides,
  };
}

function emptyQueue(): DailyOperationsQueue {
  return {
    generated_at: "2026-05-18T12:00:00.000Z",
    sections: {
      urgent_today: [],
      high_impact: [],
      this_week: [],
      monitoring: [],
      automated: [],
    },
    groups: [],
    stats: {
      total_tasks: 0,
      urgent_count: 0,
      sla_breach_count: 0,
      promises_due_today: 0,
      by_section: {
        urgent_today: 0,
        high_impact: 0,
        this_week: 0,
        monitoring: 0,
        automated: 0,
      },
      by_category: {},
    },
  };
}

describe("daily-operations-queue-panel.helpers", () => {
  it("isQueueEmpty — cola vacía", () => {
    expect(isQueueEmpty(null)).toBe(true);
    expect(isQueueEmpty(emptyQueue())).toBe(true);
  });

  it("render urgent — sección urgent_today con tareas", () => {
    const urgent = task({ id: "u1", section: "urgent_today" });
    const queue: DailyOperationsQueue = {
      ...emptyQueue(),
      sections: { ...emptyQueue().sections, urgent_today: [urgent] },
      stats: {
        ...emptyQueue().stats,
        total_tasks: 1,
        urgent_count: 1,
        by_section: { ...emptyQueue().stats.by_section, urgent_today: 1 },
      },
    };
    expect(isQueueEmpty(queue)).toBe(false);
    expect(allSectionsWithTasks(queue)).toEqual(["urgent_today"]);
    expect(getSectionTasks(queue, "urgent_today")).toHaveLength(1);
    expect(getSectionTasks(queue, "urgent_today")[0]?.company_name).toBe("Acme");
  });

  it("sliceVisibleTasks — máximo 5 visibles hasta expandir", () => {
    const tasks = Array.from({ length: 7 }, (_, i) => task({ id: `t${i}` }));
    const collapsed = sliceVisibleTasks(tasks, false);
    expect(collapsed.visible).toHaveLength(5);
    expect(collapsed.hiddenCount).toBe(2);

    const expanded = sliceVisibleTasks(tasks, true);
    expect(expanded.visible).toHaveLength(7);
    expect(expanded.hiddenCount).toBe(0);
  });

  it("shouldShowLegacyFollowUpQueue — oculta legacy si cola activa", () => {
    const queueWithTasks: DailyOperationsQueue = {
      ...emptyQueue(),
      stats: { ...emptyQueue().stats, total_tasks: 2 },
    };
    expect(
      shouldShowLegacyFollowUpQueue({ queueLoading: true, queueError: null, queue: null })
    ).toBe(false);
    expect(
      shouldShowLegacyFollowUpQueue({ queueLoading: false, queueError: null, queue: queueWithTasks })
    ).toBe(false);
    expect(
      shouldShowLegacyFollowUpQueue({ queueLoading: false, queueError: "falló", queue: null })
    ).toBe(true);
    expect(
      shouldShowLegacyFollowUpQueue({ queueLoading: false, queueError: null, queue: emptyQueue() })
    ).toBe(true);
  });

  it("isCacheStale — expira en menos de 15 min", () => {
    const now = new Date("2026-05-18T12:00:00.000Z");
    const expiresSoon = new Date("2026-05-18T12:10:00.000Z").toISOString();
    expect(isCacheStale(expiresSoon, now)).toBe(true);
    expect(isCacheStale("2026-05-18T14:00:00.000Z", now)).toBe(false);
  });
});
