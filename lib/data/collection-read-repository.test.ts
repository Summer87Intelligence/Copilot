import { describe, it, expect } from "vitest";

import {
  deriveClientCollectionSummary,
  buildClientCollectionTimeline,
  rankClientsByCollectionPriority,
} from "@/lib/data/collection-read-repository";
import type { CollectionAction, ClientCollectionSummary } from "@/lib/copilot-collection-types";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeAction(overrides: Partial<CollectionAction> = {}): CollectionAction {
  return {
    id: "action-1",
    workspaceCompanyId: "ws-1",
    companyId: "company-1",
    status: "contacted",
    actionType: "call",
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
    createdAt: "2026-03-01T10:00:00Z",
    updatedAt: "2026-03-01T10:00:00Z",
    ...overrides,
  };
}

function makeSummary(overrides: Partial<ClientCollectionSummary> = {}): ClientCollectionSummary {
  return {
    companyId: "company-1",
    latestAction: null,
    collectionStatus: "no_action",
    priority: null,
    nextActionDate: null,
    lastContactDate: null,
    hasOverduePromise: false,
    isStale: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// deriveClientCollectionSummary
// ---------------------------------------------------------------------------

describe("deriveClientCollectionSummary", () => {
  it("returns no_action when no actions", () => {
    const result = deriveClientCollectionSummary("c1", []);
    expect(result.collectionStatus).toBe("no_action");
    expect(result.latestAction).toBeNull();
    expect(result.priority).toBeNull();
  });

  it("returns no_action when all actions are archived", () => {
    const actions = [makeAction({ isActive: false })];
    const result = deriveClientCollectionSummary("c1", actions);
    expect(result.collectionStatus).toBe("no_action");
  });

  it("excludes pre-2026 actions", () => {
    const actions = [makeAction({ createdAt: "2025-12-31T23:59:59Z" })];
    const result = deriveClientCollectionSummary("c1", actions);
    expect(result.collectionStatus).toBe("no_action");
  });

  it("returns status from latest active 2026+ action", () => {
    const actions = [
      makeAction({ id: "a1", status: "contacted", createdAt: "2026-02-01T10:00:00Z" }),
      makeAction({ id: "a2", status: "promised_payment", createdAt: "2026-03-01T10:00:00Z" }),
    ];
    const result = deriveClientCollectionSummary("c1", actions);
    expect(result.collectionStatus).toBe("promised_payment");
    expect(result.latestAction?.id).toBe("a2");
  });

  it("detects overdue promise when promiseDate is in the past and status !== paid", () => {
    const past = new Date(Date.now() - 86400000 * 2).toISOString();
    const actions = [makeAction({ status: "promised_payment", promiseDate: past })];
    const now = new Date();
    const result = deriveClientCollectionSummary("c1", actions, now);
    expect(result.hasOverduePromise).toBe(true);
  });

  it("does not flag overdue promise when status is paid", () => {
    const past = new Date(Date.now() - 86400000 * 2).toISOString();
    const actions = [makeAction({ status: "paid", promiseDate: past })];
    const result = deriveClientCollectionSummary("c1", actions);
    expect(result.hasOverduePromise).toBe(false);
  });

  it("does not flag overdue promise when promiseDate is in the future", () => {
    const future = new Date(Date.now() + 86400000 * 5).toISOString();
    const actions = [makeAction({ status: "promised_payment", promiseDate: future })];
    const result = deriveClientCollectionSummary("c1", actions);
    expect(result.hasOverduePromise).toBe(false);
  });

  it("marks isStale when last contact was more than 30 days ago", () => {
    const old = new Date(Date.now() - 86400000 * 35).toISOString();
    const actions = [makeAction({ contactDate: old })];
    const result = deriveClientCollectionSummary("c1", actions);
    expect(result.isStale).toBe(true);
  });

  it("does not mark isStale when last contact was recent", () => {
    const recent = new Date(Date.now() - 86400000 * 5).toISOString();
    const actions = [makeAction({ contactDate: recent })];
    const result = deriveClientCollectionSummary("c1", actions);
    expect(result.isStale).toBe(false);
  });

  it("does not mark isStale when there is no contact date", () => {
    const actions = [makeAction({ contactDate: null })];
    const result = deriveClientCollectionSummary("c1", actions);
    // No contact = isStale is true (stale days = Infinity > 30)
    expect(result.isStale).toBe(true);
  });

  it("returns priority from latest action", () => {
    const actions = [makeAction({ priority: "urgent" })];
    const result = deriveClientCollectionSummary("c1", actions);
    expect(result.priority).toBe("urgent");
  });

  it("returns nextActionDate from latest action", () => {
    const date = "2026-04-15T09:00:00Z";
    const actions = [makeAction({ nextActionDate: date })];
    const result = deriveClientCollectionSummary("c1", actions);
    expect(result.nextActionDate).toBe(date);
  });
});

// ---------------------------------------------------------------------------
// buildClientCollectionTimeline
// ---------------------------------------------------------------------------

describe("buildClientCollectionTimeline", () => {
  it("returns empty timeline when no actions", () => {
    const result = buildClientCollectionTimeline("c1", []);
    expect(result.actions).toHaveLength(0);
  });

  it("excludes archived actions", () => {
    const actions = [makeAction({ isActive: false })];
    const result = buildClientCollectionTimeline("c1", actions);
    expect(result.actions).toHaveLength(0);
  });

  it("excludes pre-2026 actions", () => {
    const actions = [makeAction({ createdAt: "2025-06-01T00:00:00Z" })];
    const result = buildClientCollectionTimeline("c1", actions);
    expect(result.actions).toHaveLength(0);
  });

  it("orders actions by created_at descending", () => {
    const actions = [
      makeAction({ id: "a1", createdAt: "2026-01-01T00:00:00Z" }),
      makeAction({ id: "a3", createdAt: "2026-03-01T00:00:00Z" }),
      makeAction({ id: "a2", createdAt: "2026-02-01T00:00:00Z" }),
    ];
    const result = buildClientCollectionTimeline("c1", actions);
    expect(result.actions.map((a) => a.id)).toEqual(["a3", "a2", "a1"]);
  });
});

// ---------------------------------------------------------------------------
// rankClientsByCollectionPriority
// ---------------------------------------------------------------------------

describe("rankClientsByCollectionPriority", () => {
  it("overdue promise ranks first", () => {
    const summaries = [
      makeSummary({ companyId: "c1", hasOverduePromise: false, priority: "urgent" }),
      makeSummary({ companyId: "c2", hasOverduePromise: true, priority: "low" }),
    ];
    const ranked = rankClientsByCollectionPriority(summaries);
    expect(ranked[0].companyId).toBe("c2");
  });

  it("escalated ranks before high priority non-escalated", () => {
    const summaries = [
      makeSummary({ companyId: "c1", collectionStatus: "contacted", priority: "high" }),
      makeSummary({ companyId: "c2", collectionStatus: "escalated", priority: "medium" }),
    ];
    const ranked = rankClientsByCollectionPriority(summaries);
    expect(ranked[0].companyId).toBe("c2");
  });

  it("urgent priority ranks before high among same escalation", () => {
    const summaries = [
      makeSummary({ companyId: "c1", priority: "high", collectionStatus: "contacted" }),
      makeSummary({ companyId: "c2", priority: "urgent", collectionStatus: "contacted" }),
    ];
    const ranked = rankClientsByCollectionPriority(summaries);
    expect(ranked[0].companyId).toBe("c2");
  });

  it("stale clients rank before non-stale with same priority", () => {
    const summaries = [
      makeSummary({ companyId: "c1", priority: "medium", isStale: false }),
      makeSummary({ companyId: "c2", priority: "medium", isStale: true }),
    ];
    const ranked = rankClientsByCollectionPriority(summaries);
    expect(ranked[0].companyId).toBe("c2");
  });

  it("no_action clients rank last", () => {
    const summaries = [
      makeSummary({ companyId: "c1", collectionStatus: "no_action" }),
      makeSummary({ companyId: "c2", collectionStatus: "paused", priority: "low" }),
    ];
    const ranked = rankClientsByCollectionPriority(summaries);
    expect(ranked[ranked.length - 1].companyId).toBe("c1");
  });

  it("returns empty array for empty input", () => {
    expect(rankClientsByCollectionPriority([])).toHaveLength(0);
  });
});
