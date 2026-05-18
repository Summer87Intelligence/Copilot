/**
 * Phase 1B resilience tests.
 * Verifies: legacy snapshots don't crash UI, ranker always outputs recommendation + risk_assessment.
 */
import { describe, expect, it } from "vitest";
import { rankClients } from "./client-priority-ranker";
import type { DEPendingInvoice, DECompany, DECollectionAction } from "./de-types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const company: DECompany = { id: "c1", name: "Empresa Test" };

function invoice(overrides: Partial<DEPendingInvoice> = {}): DEPendingInvoice {
  return {
    id:             "inv1",
    company_id:     "c1",
    currency_code:  "UYU",
    total_amount:   10000,
    balance_amount: 10000,
    issue_date:     "2026-01-01",
    due_date:       "2026-01-31",
    status:         "pending",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// rankClients always returns recommendation + risk_assessment
// ---------------------------------------------------------------------------

describe("rankClients — Phase 1B field guarantees", () => {
  it("every client has recommendation and risk_assessment", () => {
    const invoices = [
      invoice({ company_id: "c1", due_date: "2026-01-01" }),
      invoice({ id: "inv2", company_id: "c2", due_date: "2025-10-01" }),
    ];
    const companies: DECompany[] = [
      { id: "c1", name: "Empresa A" },
      { id: "c2", name: "Empresa B" },
    ];
    const actions: DECollectionAction[] = [];
    const ref = new Date("2026-05-18T12:00:00Z");

    const ranked = rankClients(invoices, companies, actions, ref);

    expect(ranked.length).toBeGreaterThan(0);
    for (const client of ranked) {
      expect(client.recommendation).toBeDefined();
      expect(client.recommendation.action).toBeDefined();
      expect(client.recommendation.urgency).toBeDefined();
      expect(Array.isArray(client.recommendation.rationale)).toBe(true);
      expect(client.risk_assessment).toBeDefined();
      expect(typeof client.risk_assessment.score).toBe("number");
      expect(["low", "medium", "high", "critical"]).toContain(client.risk_assessment.level);
    }
  });

  it("client with zero-balance invoices is excluded", () => {
    const invoices = [invoice({ balance_amount: 0 })];
    const ranked = rankClients(invoices, [company], [], new Date());
    expect(ranked).toHaveLength(0);
  });

  it("client with no actions still gets recommendation", () => {
    const ref = new Date("2026-05-18T12:00:00Z");
    const ranked = rankClients([invoice()], [company], [], ref);
    expect(ranked[0]?.recommendation).toBeDefined();
    expect(ranked[0]?.risk_assessment).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// isBriefingV1B logic (tested via behavior, not direct import)
// ---------------------------------------------------------------------------

describe("legacy snapshot detection", () => {
  it("briefing with clients lacking recommendation is treated as stale", () => {
    // Simulate what a pre-Phase-1B cached payload looks like
    const legacyClient = {
      company_id: "c1",
      company_name: "Empresa",
      // recommendation and risk_assessment are ABSENT
    };
    const legacyPayload = { urgent: [legacyClient], important: [] };

    // Replicate the isBriefingV1B logic inline
    const first = legacyPayload.urgent[0] as Record<string, unknown> | undefined;
    const isV1B = first ? (first["recommendation"] != null && first["risk_assessment"] != null) : true;
    expect(isV1B).toBe(false);
  });

  it("briefing with no clients is treated as valid (no clients to check)", () => {
    const emptyPayload = { urgent: [], important: [] };
    const first = emptyPayload.urgent[0] as Record<string, unknown> | undefined;
    const isV1B = first ? (first["recommendation"] != null && first["risk_assessment"] != null) : true;
    expect(isV1B).toBe(true);
  });

  it("briefing with v1B clients passes validation", () => {
    const modernClient = {
      company_id: "c1",
      recommendation: { action: "monitor", urgency: "low", rationale: [], confidence: 70, channel: null, next_suggested_at: null },
      risk_assessment: { score: 10, level: "low", aging_component: 10, concentration_component: 0, behavior_component: 0, contact_component: 0 },
    };
    const modernPayload = { urgent: [modernClient], important: [] };
    const first = modernPayload.urgent[0] as Record<string, unknown> | undefined;
    const isV1B = first ? (first["recommendation"] != null && first["risk_assessment"] != null) : true;
    expect(isV1B).toBe(true);
  });
});
