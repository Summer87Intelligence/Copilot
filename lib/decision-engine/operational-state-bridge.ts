/**
 * Bridge Phase 1C FollowUpState ↔ Phase 2A OperationalMachineState.
 */

import type { FollowUpState, OperationalMachineState } from "@/lib/decision-engine/de-types";

const LEGACY_TO_MACHINE: Record<FollowUpState, OperationalMachineState> = {
  monitor:            "monitoring",
  awaiting_promise:   "payment_promised",
  retry_call:         "follow_up",
  retry_email:        "follow_up",
  payment_cleared:    "recovered",
  escalated_active:   "escalated",
  overdue_no_contact: "critical",
};

const MACHINE_TO_LEGACY: Record<OperationalMachineState, FollowUpState> = {
  new_risk:          "monitor",
  monitoring:        "monitor",
  follow_up:         "retry_call",
  payment_promised:  "awaiting_promise",
  escalated:         "escalated_active",
  critical:          "overdue_no_contact",
  recovered:         "payment_cleared",
  paused:            "monitor",
  legal_review:      "escalated_active",
};

const LEGACY_DB_VALUES = new Set([
  "monitor",
  "awaiting_promise",
  "retry_call",
  "retry_email",
  "payment_cleared",
  "escalated_active",
  "overdue_no_contact",
]);

export function followUpStateToMachineState(state: FollowUpState): OperationalMachineState {
  return LEGACY_TO_MACHINE[state];
}

export function machineStateToFollowUpState(state: OperationalMachineState): FollowUpState {
  return MACHINE_TO_LEGACY[state];
}

export function normalizeMachineState(raw: string | null | undefined): OperationalMachineState {
  if (!raw) return "monitoring";
  if (LEGACY_DB_VALUES.has(raw)) {
    return followUpStateToMachineState(raw as FollowUpState);
  }
  const machine = raw as OperationalMachineState;
  if (machine in MACHINE_TO_LEGACY) return machine;
  return "monitoring";
}
