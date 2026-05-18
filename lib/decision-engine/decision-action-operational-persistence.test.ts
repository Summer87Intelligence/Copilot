import { describe, expect, it } from "vitest";

import { collectionActionToDE } from "@/lib/decision-engine/decision-action-operational-persistence";
import type { CollectionAction } from "@/lib/copilot-collection-types";

const BASE_ACTION: CollectionAction = {
  id: "act-1",
  workspaceCompanyId: "ws-1",
  companyId: "c1",
  status: "contacted",
  actionType: "call",
  priority: "high",
  assignedTo: null,
  createdBy: null,
  dueDate: null,
  contactDate: "2026-05-18",
  nextActionDate: null,
  promiseDate: null,
  promiseAmount: null,
  promiseCurrency: null,
  notes: null,
  metadata: null,
  isActive: true,
  archivedAt: null,
  createdAt: "2026-05-18T12:00:00.000Z",
  updatedAt: "2026-05-18T12:00:00.000Z",
};

describe("collectionActionToDE", () => {
  it("maps collection action fields to DE shape", () => {
    const mapped = collectionActionToDE(BASE_ACTION);
    expect(mapped).toEqual({
      id: "act-1",
      company_id: "c1",
      action_type: "call",
      status: "contacted",
      priority: "high",
      notes: null,
      promise_date: null,
      promise_amount: null,
      promise_currency: null,
      contact_date: "2026-05-18",
      created_at: "2026-05-18T12:00:00.000Z",
    });
  });
});
