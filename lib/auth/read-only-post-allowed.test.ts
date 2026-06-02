import { describe, expect, it } from "vitest";

import {
  isReadOnlyPostAllowedPath,
  READ_ONLY_ALLOWED_POST_PATHS,
  shouldBlockReadOnlyApiMutation,
} from "@/lib/auth/read-only-post-allowed";

describe("read-only POST allowlist", () => {
  it("solo incluye parse e import preview de Santander", () => {
    expect(READ_ONLY_ALLOWED_POST_PATHS).toEqual([
      "/api/copilot/treasury/bank-reconciliation-movements/parse",
      "/api/copilot/treasury/bank-reconciliation-movements/import",
    ]);
  });

  it("permite parse e import en allowlist", () => {
    expect(
      isReadOnlyPostAllowedPath("/api/copilot/treasury/bank-reconciliation-movements/parse")
    ).toBe(true);
    expect(
      isReadOnlyPostAllowedPath("/api/copilot/treasury/bank-reconciliation-movements/import")
    ).toBe(true);
  });

  it("no permite zeta ni manual cash", () => {
    expect(shouldBlockReadOnlyApiMutation("/api/zeta/sync-contacts", "POST")).toBe(true);
    expect(
      shouldBlockReadOnlyApiMutation("/api/copilot/treasury/manual-cash-movements", "POST")
    ).toBe(true);
    expect(
      shouldBlockReadOnlyApiMutation("/api/copilot/treasury/planned-cash-obligations", "POST")
    ).toBe(true);
  });

  it("no bloquea GET", () => {
    expect(
      shouldBlockReadOnlyApiMutation(
        "/api/copilot/treasury/bank-reconciliation-movements",
        "GET"
      )
    ).toBe(false);
  });

  it("no bloquea POST allowlisted para read-only", () => {
    expect(
      shouldBlockReadOnlyApiMutation(
        "/api/copilot/treasury/bank-reconciliation-movements/parse",
        "POST"
      )
    ).toBe(false);
    expect(
      shouldBlockReadOnlyApiMutation(
        "/api/copilot/treasury/bank-reconciliation-movements/import",
        "POST"
      )
    ).toBe(false);
  });

  it("bloquea PATCH/DELETE en rutas treasury", () => {
    expect(
      shouldBlockReadOnlyApiMutation(
        "/api/copilot/treasury/manual-cash-movements/abc",
        "PATCH"
      )
    ).toBe(true);
    expect(
      shouldBlockReadOnlyApiMutation(
        "/api/copilot/treasury/bank-reconciliation-movements/abc",
        "DELETE"
      )
    ).toBe(true);
  });
});
