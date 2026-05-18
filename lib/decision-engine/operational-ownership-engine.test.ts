import { describe, expect, it } from "vitest";

import {
  DEFAULT_MAX_ACTIVE_CRITICAL,
  pickAutoAssignee,
  planAutoAssignments,
  type AutoAssignCandidate,
} from "@/lib/decision-engine/operational-ownership-engine";
import type { OperationalOwnershipOperatorStats } from "@/lib/decision-engine/de-types";

const operators: OperationalOwnershipOperatorStats[] = [
  {
    user_id: "u1",
    display_name: "Ana",
    total_assigned: 4,
    critical_assigned: 2,
    overdue_assigned: 0,
  },
  {
    user_id: "u2",
    display_name: "Luis",
    total_assigned: 2,
    critical_assigned: 1,
    overdue_assigned: 1,
  },
];

function candidate(overrides: Partial<AutoAssignCandidate> = {}): AutoAssignCandidate {
  return {
    customer_id: "c1",
    current_risk: "high",
    machine_state: "follow_up",
    breached_sla: false,
    existing_owner_id: null,
    ...overrides,
  };
}

describe("operational-ownership-engine", () => {
  it("asigna crítico al operador con menor carga crítica", () => {
    const decision = pickAutoAssignee(operators, candidate({ current_risk: "critical" }));
    expect(decision?.assigned_user_id).toBe("u2");
    expect(decision?.reason).toMatch(/critical|balance/i);
  });

  it("mantiene sticky owner si ya tenía responsable", () => {
    const decision = pickAutoAssignee(
      operators,
      candidate({ existing_owner_id: "u1", current_risk: "high" })
    );
    expect(decision?.assigned_user_id).toBe("u1");
    expect(decision?.reason).toBe("sticky_owner");
  });

  it("prioriza SLA breach en planAutoAssignments", () => {
    const decisions = planAutoAssignments(operators, [
      candidate({ customer_id: "low", current_risk: "low" }),
      candidate({ customer_id: "sla", breached_sla: true, current_risk: "critical" }),
    ]);
    expect(decisions[0]?.customer_id).toBe("sla");
  });

  it("evita sobrecarga crítica por operador", () => {
    const overloaded: OperationalOwnershipOperatorStats[] = [
      {
        user_id: "u1",
        display_name: "Ana",
        total_assigned: 10,
        critical_assigned: DEFAULT_MAX_ACTIVE_CRITICAL,
        overdue_assigned: 0,
      },
      {
        user_id: "u2",
        display_name: "Luis",
        total_assigned: 1,
        critical_assigned: 0,
        overdue_assigned: 0,
      },
    ];
    const decision = pickAutoAssignee(
      overloaded,
      candidate({ current_risk: "critical", machine_state: "critical" })
    );
    expect(decision?.assigned_user_id).toBe("u2");
  });
});
