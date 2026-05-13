import { describe, expect, it } from "vitest";

import {
  mapOperationalActionTypeLabel,
  mapOperationalOriginLabel,
  mapOperationalPriorityLabel,
  mapOperationalStatusLabel,
  operationalPriorityTone,
  operationalStatusTone,
} from "@/lib/copilot-operational-actions-format";
import { summarizeOperationalQueue } from "@/lib/copilot-operational-actions-service";
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

describe("summarizeOperationalQueue", () => {
  it("cuenta estados abiertos y resueltas hoy", () => {
    const today = new Date().toISOString();
    const summary = summarizeOperationalQueue([
      action({ id: "1", operational_status: "pending" }),
      action({ id: "2", operational_status: "in_progress" }),
      action({ id: "3", operational_status: "blocked" }),
      action({
        id: "4",
        operational_status: "resolved",
        resolved_at: today,
      }),
      action({
        id: "5",
        operational_status: "resolved",
        resolved_at: "2020-01-01T00:00:00.000Z",
      }),
    ]);

    expect(summary).toEqual({
      pending: 1,
      inProgress: 1,
      blocked: 1,
      resolvedToday: 1,
    });
  });
});

describe("copilot-operational-actions-format", () => {
  it("mapea etiquetas y tonos", () => {
    expect(mapOperationalStatusLabel("in_progress")).toBe("En seguimiento");
    expect(mapOperationalOriginLabel("treasury")).toBe("Tesorería");
    expect(mapOperationalPriorityLabel("critical")).toBe("Crítica");
    expect(mapOperationalActionTypeLabel("review_liquidity")).toBe("Revisar liquidez");
    expect(operationalStatusTone("blocked")).toBe("danger");
    expect(operationalPriorityTone("high")).toBe("warning");
  });
});
