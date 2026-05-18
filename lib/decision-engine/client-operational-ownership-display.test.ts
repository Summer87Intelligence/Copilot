import { describe, expect, it } from "vitest";

import {
  assigneeInitials,
  buildOwnershipHydrated,
} from "@/lib/decision-engine/client-operational-ownership-display";
import type { ClientOperationalHydrationRecord } from "@/lib/decision-engine/de-types";

const NOW = new Date("2026-05-18T14:00:00.000Z");

function record(overrides: Partial<ClientOperationalHydrationRecord> = {}): ClientOperationalHydrationRecord {
  return {
    customer_id: "c1",
    machine_state: "critical",
    previous_state: null,
    transitioned_at: null,
    transition_reason: null,
    breached_sla: true,
    next_follow_up_at: null,
    pending_follow_up_id: null,
    pending_follow_up_reason: null,
    last_action_at: null,
    last_action_type: null,
    last_action_summary: null,
    timeline_preview: [],
    assigned_user_id: "u1",
    assigned_at: "2026-05-18T10:00:00.000Z",
    assigned_by: "u2",
    assignment_note: null,
    assignee_display_name: "Ana López",
    ...overrides,
  };
}

describe("client-operational-ownership-display", () => {
  it("marca MÍO y SLA ownership overdue", () => {
    const hydrated = buildOwnershipHydrated(record(), "u1", NOW);
    expect(hydrated.is_mine).toBe(true);
    expect(hydrated.ownership_overdue).toBe(true);
    expect(hydrated.ownership_status_label).toBe("Asignado a mí");
  });

  it("sin asignar en crítico", () => {
    const hydrated = buildOwnershipHydrated(
      record({ assigned_user_id: null, assignee_display_name: null }),
      "u1",
      NOW
    );
    expect(hydrated.is_unassigned).toBe(true);
    expect(hydrated.ownership_status_label).toBe("Crítico sin dueño");
  });

  it("iniciales del responsable", () => {
    expect(assigneeInitials("Ana López")).toBe("AL");
    expect(assigneeInitials("Solo")).toBe("SO");
  });
});
