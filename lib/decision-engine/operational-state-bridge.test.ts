import { describe, expect, it } from "vitest";

import {
  followUpStateToMachineState,
  machineStateToFollowUpState,
  normalizeMachineState,
} from "@/lib/decision-engine/operational-state-bridge";

describe("operational-state-bridge", () => {
  it("maps legacy DB values to machine states", () => {
    expect(normalizeMachineState("monitor")).toBe("monitoring");
    expect(normalizeMachineState("awaiting_promise")).toBe("payment_promised");
    expect(normalizeMachineState("escalated_active")).toBe("escalated");
  });

  it("round-trips machine → legacy → machine for escalated", () => {
    const legacy = machineStateToFollowUpState("escalated");
    expect(legacy).toBe("escalated_active");
    expect(followUpStateToMachineState(legacy)).toBe("escalated");
  });
});
