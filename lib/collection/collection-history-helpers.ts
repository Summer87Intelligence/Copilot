import type { CollectionAction, CollectionStatus } from "@/lib/copilot-collection-types";

export type UiOutcome =
  | "contacted"
  | "promised_payment"
  | "no_response"
  | "wrong_contact"
  | "disputed"
  | "needs_followup";

const VALID_UI_OUTCOMES: readonly UiOutcome[] = [
  "contacted",
  "promised_payment",
  "no_response",
  "wrong_contact",
  "disputed",
  "needs_followup",
] as const;

export function outcomeToStatus(outcome: UiOutcome): CollectionStatus {
  switch (outcome) {
    case "contacted": return "contacted";
    case "promised_payment": return "promised_payment";
    case "disputed": return "disputed";
    case "needs_followup": return "pending_review";
    default: return "paused";
  }
}

export function actionToUiOutcome(action: CollectionAction): UiOutcome {
  const uiOutcome = (action.metadata as Record<string, unknown> | null)?.ui_outcome;
  if (typeof uiOutcome === "string" && (VALID_UI_OUTCOMES as readonly string[]).includes(uiOutcome)) {
    return uiOutcome as UiOutcome;
  }
  switch (action.status) {
    case "contacted": return "contacted";
    case "promised_payment": return "promised_payment";
    case "disputed": return "disputed";
    case "pending_review": return "needs_followup";
    default: return "no_response";
  }
}
