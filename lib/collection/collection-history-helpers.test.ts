import { describe, expect, it } from "vitest";
import type { CollectionAction } from "@/lib/copilot-collection-types";
import { actionToUiOutcome, outcomeToStatus } from "./collection-history-helpers";

const BASE_ACTION: CollectionAction = {
  id: "act-1",
  workspaceCompanyId: "ws-1",
  companyId: "co-1",
  status: "contacted",
  actionType: "whatsapp",
  priority: "medium",
  assignedTo: null,
  createdBy: null,
  dueDate: null,
  contactDate: null,
  nextActionDate: null,
  promiseDate: null,
  promiseAmount: null,
  promiseCurrency: null,
  notes: null,
  metadata: null,
  isActive: true,
  archivedAt: null,
  createdAt: "2026-06-01T10:00:00Z",
  updatedAt: "2026-06-01T10:00:00Z",
};

describe("outcomeToStatus", () => {
  it("contacted → contacted", () => {
    expect(outcomeToStatus("contacted")).toBe("contacted");
  });

  it("promised_payment → promised_payment", () => {
    expect(outcomeToStatus("promised_payment")).toBe("promised_payment");
  });

  it("no_response → paused", () => {
    expect(outcomeToStatus("no_response")).toBe("paused");
  });

  it("wrong_contact → paused", () => {
    expect(outcomeToStatus("wrong_contact")).toBe("paused");
  });

  it("needs_followup → pending_review", () => {
    expect(outcomeToStatus("needs_followup")).toBe("pending_review");
  });

  it("disputed → disputed", () => {
    expect(outcomeToStatus("disputed")).toBe("disputed");
  });
});

describe("actionToUiOutcome", () => {
  it("uses metadata.ui_outcome when valid", () => {
    const action: CollectionAction = {
      ...BASE_ACTION,
      status: "paused",
      metadata: { ui_outcome: "no_response" },
    };
    expect(actionToUiOutcome(action)).toBe("no_response");
  });

  it("falls back to status when metadata is null", () => {
    expect(actionToUiOutcome({ ...BASE_ACTION, status: "contacted", metadata: null })).toBe("contacted");
  });

  it("falls back to status when metadata.ui_outcome is not a valid UiOutcome", () => {
    const action: CollectionAction = {
      ...BASE_ACTION,
      status: "promised_payment",
      metadata: { ui_outcome: "not_valid" },
    };
    expect(actionToUiOutcome(action)).toBe("promised_payment");
  });

  it("maps paused status → no_response when no metadata", () => {
    expect(actionToUiOutcome({ ...BASE_ACTION, status: "paused", metadata: null })).toBe("no_response");
  });

  it("maps pending_review → needs_followup when no metadata", () => {
    expect(actionToUiOutcome({ ...BASE_ACTION, status: "pending_review", metadata: null })).toBe("needs_followup");
  });
});
