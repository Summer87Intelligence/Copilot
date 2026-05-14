import { describe, expect, it } from "vitest";

import {
  compareOperationalActionsForQueue,
  getActionSlaStatus,
  summarizeOperationalSla,
} from "@/lib/copilot-operational-actions-sla";
import type { OperationalActionListItem } from "@/lib/copilot-operational-actions-types";

function action(
  partial: Partial<OperationalActionListItem> & Pick<OperationalActionListItem, "id">
): OperationalActionListItem {
  return {
    workspace_company_id: "ws",
    origin: "alert",
    action_type: "follow_up",
    priority: "medium",
    operational_status: "pending",
    owner_id: null,
    assigned_to: null,
    created_by: null,
    related_entity_type: null,
    related_entity_id: null,
    title: "Seguimiento",
    summary: null,
    context: {},
    metadata: {},
    due_at: null,
    resolved_at: null,
    resolution_notes: null,
    created_at: "2026-05-13T12:00:00.000Z",
    updated_at: "2026-05-13T12:00:00.000Z",
    ...partial,
  };
}

describe("getActionSlaStatus", () => {
  const now = new Date("2026-05-13T15:00:00.000Z");

  it("clasifica vencida, hoy, pronto, sin fecha y ok", () => {
    expect(
      getActionSlaStatus(
        action({ id: "1", due_at: "2026-05-12T10:00:00.000Z" }),
        now
      )
    ).toBe("overdue");
    expect(
      getActionSlaStatus(
        action({ id: "2", due_at: "2026-05-13T23:59:00.000Z" }),
        now
      )
    ).toBe("due_today");
    expect(
      getActionSlaStatus(
        action({ id: "3", due_at: "2026-05-18T10:00:00.000Z" }),
        now
      )
    ).toBe("due_soon");
    expect(getActionSlaStatus(action({ id: "4", due_at: null }), now)).toBe(
      "no_due_date"
    );
    expect(
      getActionSlaStatus(
        action({ id: "5", due_at: "2026-05-30T10:00:00.000Z" }),
        now
      )
    ).toBe("ok");
  });

  it("ignora SLA en acciones resueltas", () => {
    expect(
      getActionSlaStatus(
        action({
          id: "6",
          due_at: "2026-05-10T10:00:00.000Z",
          operational_status: "resolved",
        }),
        now
      )
    ).toBe("ok");
  });
});

describe("summarizeOperationalSla", () => {
  it("resume vencidas, hoy, bloqueadas críticas y sin fecha", () => {
    const now = new Date("2026-05-13T15:00:00.000Z");
    const summary = summarizeOperationalSla(
      [
        action({ id: "1", due_at: "2026-05-12T10:00:00.000Z" }),
        action({ id: "2", due_at: "2026-05-13T10:00:00.000Z" }),
        action({
          id: "3",
          operational_status: "blocked",
          priority: "critical",
          due_at: "2026-05-20T10:00:00.000Z",
        }),
        action({ id: "4", due_at: null }),
        action({
          id: "5",
          operational_status: "resolved",
          due_at: "2026-05-10T10:00:00.000Z",
        }),
      ],
      now
    );

    expect(summary).toEqual({
      overdue: 1,
      dueToday: 1,
      dueSoon: 1,
      noDueDate: 1,
      blockedCritical: 1,
    });
  });
});

describe("compareOperationalActionsForQueue", () => {
  it("prioriza vencidas y criticidad", () => {
    const now = new Date("2026-05-13T15:00:00.000Z");
    const sorted = [
      action({ id: "a", priority: "medium", due_at: "2026-05-30T10:00:00.000Z" }),
      action({ id: "b", priority: "critical", due_at: "2026-05-12T10:00:00.000Z" }),
      action({ id: "c", priority: "high", due_at: "2026-05-13T10:00:00.000Z" }),
    ].sort((left, right) => compareOperationalActionsForQueue(left, right, now));

    expect(sorted.map((row) => row.id)).toEqual(["b", "c", "a"]);
  });
});
