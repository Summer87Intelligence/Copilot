import { describe, expect, it } from "vitest";

import {
  checkLoginRateLimit,
  resetLoginRateLimitStoreForTests,
} from "@/lib/security/login-rate-limit";

describe("login-rate-limit", () => {
  it("allows up to maxAttempts within window", () => {
    resetLoginRateLimitStoreForTests();
    const cfg = { windowMs: 60_000, maxAttempts: 3 };
    const t0 = 1_000_000;
    expect(checkLoginRateLimit("k1", t0, cfg).allowed).toBe(true);
    expect(checkLoginRateLimit("k1", t0 + 1, cfg).allowed).toBe(true);
    expect(checkLoginRateLimit("k1", t0 + 2, cfg).allowed).toBe(true);
    const last = checkLoginRateLimit("k1", t0 + 3, cfg);
    expect(last.allowed).toBe(false);
    expect(last.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets window after windowMs elapsed", () => {
    resetLoginRateLimitStoreForTests();
    const cfg = { windowMs: 1_000, maxAttempts: 1 };
    expect(checkLoginRateLimit("k2", 0, cfg).allowed).toBe(true);
    expect(checkLoginRateLimit("k2", 100, cfg).allowed).toBe(false);
    expect(checkLoginRateLimit("k2", 2_000, cfg).allowed).toBe(true);
  });
});
