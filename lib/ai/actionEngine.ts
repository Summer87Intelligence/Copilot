/**
 * Action Engine — genera acciones ejecutables a partir de decisiones.
 */

import type { ActionPayloadJson } from "@/lib/ai/action-types";

export type DecisionInputForAction = {
  id: string;
  initiative_id: string;
  decision_type: string;
  suggested_message: string;
};

export type GeneratedActionInsert = {
  decision_id: string;
  initiative_id: string;
  action_type: string;
  channel: string;
  execution_status: "pending";
  action_payload: ActionPayloadJson;
};

function mapDecisionToAction(
  d: DecisionInputForAction
): Omit<GeneratedActionInsert, "decision_id" | "initiative_id" | "action_payload"> & {
  action_payload: ActionPayloadJson;
} {
  const suggested_message = d.suggested_message?.trim() || "";

  switch (d.decision_type) {
    case "high_priority_outreach":
      return {
        action_type: "send_whatsapp",
        channel: "whatsapp",
        execution_status: "pending",
        action_payload: { suggested_message },
      };
    case "linkedin_contact":
      return {
        action_type: "send_linkedin_message",
        channel: "linkedin",
        execution_status: "pending",
        action_payload: { suggested_message },
      };
    case "low_priority_nurture":
      return {
        action_type: "send_email",
        channel: "email",
        execution_status: "pending",
        action_payload: { suggested_message },
      };
    default:
      return {
        action_type: "send_email",
        channel: "email",
        execution_status: "pending",
        action_payload: { suggested_message },
      };
  }
}

/**
 * Genera filas listas para insertar en `actions` (sin persistir).
 */
export function generateActionsFromDecisions(
  decisions: DecisionInputForAction[]
): GeneratedActionInsert[] {
  return decisions.map((d) => {
    const mapped = mapDecisionToAction(d);
    return {
      decision_id: d.id,
      initiative_id: d.initiative_id,
      ...mapped,
    };
  });
}
