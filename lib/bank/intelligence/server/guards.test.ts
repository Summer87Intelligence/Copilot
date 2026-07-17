import { describe, expect, it } from "vitest";

import {
  FORBIDDEN_SHADOW_RPCS,
  FORBIDDEN_SHADOW_TABLES,
  ShadowGuardError,
  assertShadowRpcForbidden,
  assertShadowWriteAllowed,
  createShadowRpcGuard,
  isAllowedShadowWriteTable,
  isForbiddenShadowTable,
} from "@/lib/bank/intelligence/server/guards";

describe("shadow guards", () => {
  it("marca tablas financieras como prohibidas", () => {
    for (const t of FORBIDDEN_SHADOW_TABLES) {
      expect(isForbiddenShadowTable(t)).toBe(true);
      expect(() => assertShadowWriteAllowed(t, "insert")).toThrow(ShadowGuardError);
      expect(() => assertShadowWriteAllowed(t, "update")).toThrow(ShadowGuardError);
    }
  });

  it("permite solo suggestions + events", () => {
    expect(isAllowedShadowWriteTable("bank_reconciliation_suggestions")).toBe(true);
    expect(isAllowedShadowWriteTable("reconciliation_events")).toBe(true);
    expect(() =>
      assertShadowWriteAllowed("bank_reconciliation_suggestions", "insert")
    ).not.toThrow();
    expect(() => assertShadowWriteAllowed("reconciliation_events", "insert")).not.toThrow();
  });

  it("events son append-only; suggestions no se borran", () => {
    expect(() => assertShadowWriteAllowed("reconciliation_events", "update")).toThrow(
      /append-only/
    );
    expect(() =>
      assertShadowWriteAllowed("bank_reconciliation_suggestions", "delete")
    ).toThrow(/must not delete/);
  });

  it("bloquea RPCs financieras", () => {
    for (const rpc of FORBIDDEN_SHADOW_RPCS) {
      expect(() => assertShadowRpcForbidden(rpc)).toThrow(ShadowGuardError);
    }
    const guard = createShadowRpcGuard();
    expect(() => guard.call("confirm_bank_reconciliation_v1")).toThrow(/never call/);
    expect(() => guard.call("reverse_bank_reconciliation_v1")).toThrow(/never call/);
    expect(guard.attempted).toEqual([
      "confirm_bank_reconciliation_v1",
      "reverse_bank_reconciliation_v1",
    ]);
  });

  it("rechaza tablas desconocidas fuera del allowlist", () => {
    expect(() => assertShadowWriteAllowed("companies", "insert")).toThrow(
      /may only write suggestions/
    );
  });
});
