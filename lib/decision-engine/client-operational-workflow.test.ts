import { describe, expect, it } from "vitest";

import type { OperationalTask } from "@/lib/decision-engine/de-types";
import { resolvePrimaryWorkflow } from "@/lib/decision-engine/client-operational-workflow";

function task(category: OperationalTask["category"]): OperationalTask {
  return {
    id: "t1",
    customer_id: "c1",
    company_name: "X",
    section: "urgent_today",
    category,
    priority: "high",
    impact: "high",
    source: "state_machine",
    title: "x",
    action_label: "x",
    reason: "x",
    priority_score: 50,
    currency_code: "UYU",
    pending_amount: 1,
    oldest_days: 1,
    risk_level: "high",
    machine_state: "follow_up",
    breached_sla: false,
    group_key: null,
    group_label: null,
    due_at: null,
  };
}

describe("resolvePrimaryWorkflow", () => {
  it("mapea CTAs por categoría", () => {
    expect(resolvePrimaryWorkflow(task("call_today")).label).toBe("Llamar ahora");
    expect(resolvePrimaryWorkflow(task("payment_confirmation")).label).toBe("Registrar pago");
    expect(resolvePrimaryWorkflow(task("promise_follow_up")).label).toBe("Registrar promesa");
    expect(resolvePrimaryWorkflow(task("escalation_review")).label).toBe("Escalar caso");
  });
});
