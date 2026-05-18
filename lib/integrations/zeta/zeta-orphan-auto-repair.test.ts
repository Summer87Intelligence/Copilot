import { describe, expect, it } from "vitest";

import {
  buildOrphanResolvedMetadataPatch,
  classifyStaleOrphanRepairReason,
  isActiveOrphanWarning,
  isStaleOrphanMetadata,
  ORPHAN_RESOLVED_REASONS,
} from "@/lib/integrations/zeta/zeta-orphan-auto-repair";
import { readZetaReconciliationState } from "@/lib/integrations/zeta/zeta-saldos-reconciliation";

describe("zeta-orphan-auto-repair", () => {
  it("active warning requires open balance and missing_count", () => {
    expect(
      isActiveOrphanWarning({
        reconciliation_missing_count: 2,
        balance_amount: 100,
        status: "open",
      })
    ).toBe(true);
    expect(
      isActiveOrphanWarning({
        reconciliation_missing_count: 3,
        balance_amount: 0,
        status: "paid",
      })
    ).toBe(false);
    expect(
      isActiveOrphanWarning({
        reconciliation_missing_count: 1,
        balance_amount: 50,
        status: "paid",
      })
    ).toBe(false);
  });

  it("stale metadata when missing_count remains after auto-close", () => {
    const stale = {
      reconciliation_missing_count: 3,
      balance_amount: 0,
      status: "paid",
    };
    expect(isStaleOrphanMetadata(stale)).toBe(true);
    expect(isActiveOrphanWarning(stale)).toBe(false);
  });

  it("clears missing_count and records resolved audit fields", () => {
    const merged = buildOrphanResolvedMetadataPatch(
      {
        zeta_reconciliation: {
          pending_sync_missing_count: 3,
          last_missing_detected_at: "2026-05-10T00:00:00Z",
        },
      },
      ORPHAN_RESOLVED_REASONS.ALREADY_PAID,
      "2026-05-18T12:00:00.000Z"
    );
    const rec = readZetaReconciliationState(merged);
    expect(rec.pending_sync_missing_count).toBe(0);
    expect(rec.resolved_at).toBe("2026-05-18T12:00:00.000Z");
    expect(rec.resolved_reason).toBe(ORPHAN_RESOLVED_REASONS.ALREADY_PAID);
    expect(rec.resolved_automatically).toBe(true);
  });

  it("classifies repair reason from balance and status", () => {
    expect(classifyStaleOrphanRepairReason(0, "paid")).toBe(
      ORPHAN_RESOLVED_REASONS.ALREADY_PAID
    );
    expect(classifyStaleOrphanRepairReason(0, "open")).toBe(
      ORPHAN_RESOLVED_REASONS.BALANCE_ZERO
    );
  });
});
