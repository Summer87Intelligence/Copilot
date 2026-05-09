import { describe, it, expect } from "vitest";
import {
  classifyOrphanAction,
  readZetaReconciliationState,
  mergeZetaReconciliationState,
  ORPHAN_AUTO_CLOSE_THRESHOLD,
} from "./zeta-saldos-reconciliation";

// ---------------------------------------------------------------------------
// classifyOrphanAction — pure 3-strike rule
// ---------------------------------------------------------------------------

describe("classifyOrphanAction", () => {
  it("returns warn on first miss (count 1)", () => {
    expect(classifyOrphanAction(1)).toBe("warn");
  });

  it("returns warn on second miss (count 2)", () => {
    expect(classifyOrphanAction(2)).toBe("warn");
  });

  it("returns closed at threshold (count 3)", () => {
    expect(classifyOrphanAction(ORPHAN_AUTO_CLOSE_THRESHOLD)).toBe("closed");
  });

  it("returns closed above threshold (count 4)", () => {
    expect(classifyOrphanAction(4)).toBe("closed");
  });

  it("returns closed at count 10", () => {
    expect(classifyOrphanAction(10)).toBe("closed");
  });

  it("ORPHAN_AUTO_CLOSE_THRESHOLD is 3", () => {
    expect(ORPHAN_AUTO_CLOSE_THRESHOLD).toBe(3);
  });

  it("false positive protection: count 2 is warn, not closed", () => {
    expect(classifyOrphanAction(2)).toBe("warn");
    expect(classifyOrphanAction(2)).not.toBe("closed");
  });

  it("false positive protection: count 1 is warn, not closed", () => {
    expect(classifyOrphanAction(1)).toBe("warn");
    expect(classifyOrphanAction(1)).not.toBe("closed");
  });
});

// ---------------------------------------------------------------------------
// readZetaReconciliationState — metadata parsing
// ---------------------------------------------------------------------------

describe("readZetaReconciliationState", () => {
  it("returns zero defaults for null metadata", () => {
    const s = readZetaReconciliationState(null);
    expect(s.pending_sync_missing_count).toBe(0);
    expect(s.last_seen_in_zeta_at).toBeNull();
    expect(s.last_missing_detected_at).toBeNull();
  });

  it("returns zero defaults for undefined metadata", () => {
    const s = readZetaReconciliationState(undefined);
    expect(s.pending_sync_missing_count).toBe(0);
  });

  it("returns zero defaults for empty object", () => {
    const s = readZetaReconciliationState({});
    expect(s.pending_sync_missing_count).toBe(0);
  });

  it("returns zero defaults when zeta_reconciliation key is absent", () => {
    const s = readZetaReconciliationState({ zeta_customer_voucher_v1: {} });
    expect(s.pending_sync_missing_count).toBe(0);
  });

  it("reads missing_count from nested key", () => {
    const meta = {
      zeta_reconciliation: {
        pending_sync_missing_count: 2,
        last_seen_in_zeta_at: "2026-05-01T00:00:00Z",
        last_missing_detected_at: "2026-05-09T00:00:00Z",
      },
    };
    const s = readZetaReconciliationState(meta);
    expect(s.pending_sync_missing_count).toBe(2);
    expect(s.last_seen_in_zeta_at).toBe("2026-05-01T00:00:00Z");
    expect(s.last_missing_detected_at).toBe("2026-05-09T00:00:00Z");
  });

  it("clamps negative count to 0", () => {
    const meta = { zeta_reconciliation: { pending_sync_missing_count: -1 } };
    const s = readZetaReconciliationState(meta);
    expect(s.pending_sync_missing_count).toBe(0);
  });

  it("returns 0 if count is non-numeric", () => {
    const meta = { zeta_reconciliation: { pending_sync_missing_count: "two" } };
    const s = readZetaReconciliationState(meta);
    expect(s.pending_sync_missing_count).toBe(0);
  });

  it("returns null for non-string last_seen_in_zeta_at", () => {
    const meta = { zeta_reconciliation: { last_seen_in_zeta_at: 12345 } };
    const s = readZetaReconciliationState(meta);
    expect(s.last_seen_in_zeta_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// mergeZetaReconciliationState
// ---------------------------------------------------------------------------

describe("mergeZetaReconciliationState", () => {
  it("creates zeta_reconciliation key from null metadata", () => {
    const merged = mergeZetaReconciliationState(null, { pending_sync_missing_count: 1 });
    expect((merged.zeta_reconciliation as Record<string, unknown>).pending_sync_missing_count).toBe(1);
  });

  it("preserves existing metadata keys", () => {
    const existing = { zeta_customer_voucher_v1: { serie: "A" } };
    const merged = mergeZetaReconciliationState(existing, { pending_sync_missing_count: 2 });
    expect((merged as Record<string, unknown>).zeta_customer_voucher_v1).toEqual({ serie: "A" });
    expect((merged.zeta_reconciliation as Record<string, unknown>).pending_sync_missing_count).toBe(2);
  });

  it("increments missing count correctly", () => {
    const meta = { zeta_reconciliation: { pending_sync_missing_count: 1 } };
    const prev = readZetaReconciliationState(meta);
    const merged = mergeZetaReconciliationState(meta, {
      pending_sync_missing_count: prev.pending_sync_missing_count + 1,
    });
    expect((merged.zeta_reconciliation as Record<string, unknown>).pending_sync_missing_count).toBe(2);
  });

  it("resets count to 0 on re-appearance", () => {
    const meta = {
      zeta_reconciliation: {
        pending_sync_missing_count: 2,
        last_missing_detected_at: "2026-05-07T00:00:00Z",
      },
    };
    const merged = mergeZetaReconciliationState(meta, {
      pending_sync_missing_count: 0,
      last_seen_in_zeta_at: "2026-05-09T00:00:00Z",
    });
    const rec = merged.zeta_reconciliation as Record<string, unknown>;
    expect(rec.pending_sync_missing_count).toBe(0);
    expect(rec.last_seen_in_zeta_at).toBe("2026-05-09T00:00:00Z");
    expect(rec.last_missing_detected_at).toBe("2026-05-07T00:00:00Z");
  });

  it("updates last_missing_detected_at without touching last_seen_in_zeta_at", () => {
    const meta = {
      zeta_reconciliation: {
        pending_sync_missing_count: 1,
        last_seen_in_zeta_at: "2026-05-01T00:00:00Z",
        last_missing_detected_at: "2026-05-08T00:00:00Z",
      },
    };
    const merged = mergeZetaReconciliationState(meta, {
      pending_sync_missing_count: 2,
      last_missing_detected_at: "2026-05-09T00:00:00Z",
    });
    const rec = merged.zeta_reconciliation as Record<string, unknown>;
    expect(rec.last_seen_in_zeta_at).toBe("2026-05-01T00:00:00Z");
    expect(rec.last_missing_detected_at).toBe("2026-05-09T00:00:00Z");
  });
});

// ---------------------------------------------------------------------------
// 3-strike scenario simulations (pure)
// ---------------------------------------------------------------------------

describe("3-strike consecutive miss simulation", () => {
  function simulateOrphan(initialCount: number, reappearsAt?: number): OrphanAction[] {
    const actions: OrphanAction[] = [];
    let count = initialCount;
    for (let run = 1; run <= 5; run++) {
      if (reappearsAt === run) {
        count = 0; // reset on re-appearance
        continue;
      }
      count++;
      actions.push(classifyOrphanAction(count));
    }
    return actions;
  }
  type OrphanAction = "warn" | "closed" | "skipped";

  it("invoice disappears 3 times consecutively → auto-close on 3rd", () => {
    const actions = simulateOrphan(0).slice(0, 3);
    expect(actions[0]).toBe("warn");
    expect(actions[1]).toBe("warn");
    expect(actions[2]).toBe("closed");
  });

  it("invoice disappears 2 times, reappears, then disappears again → restarts counter", () => {
    // Run 1: miss → count=1 warn
    // Run 2: miss → count=2 warn
    // Run 3: SEEN → count reset to 0
    // Run 4: miss → count=1 warn (not closed!)
    let count = 0;
    const actions: OrphanAction[] = [];
    count++; actions.push(classifyOrphanAction(count)); // run1: warn
    count++; actions.push(classifyOrphanAction(count)); // run2: warn
    count = 0; // run3: reappears — reset
    count++; actions.push(classifyOrphanAction(count)); // run4: warn (count=1 again)
    count++; actions.push(classifyOrphanAction(count)); // run5: warn (count=2)
    expect(actions).toEqual(["warn", "warn", "warn", "warn"]);
  });

  it("invoice disappears 1 time only (transient) → no auto-close ever", () => {
    const a1 = classifyOrphanAction(1);
    // After this, it reappears → count=0 → next miss would be count=1 (warn)
    const a2 = classifyOrphanAction(1);
    expect(a1).toBe("warn");
    expect(a2).toBe("warn");
  });

  it("no hard delete: action is never anything other than warn/closed/skipped", () => {
    for (let count = 0; count <= 10; count++) {
      if (count === 0) continue;
      const action = classifyOrphanAction(count);
      expect(["warn", "closed"]).toContain(action);
      expect(action).not.toBe("deleted");
    }
  });
});
