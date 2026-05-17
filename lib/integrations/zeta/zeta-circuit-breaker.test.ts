/**
 * ZETA-16: Tests for zeta-circuit-breaker.
 */

import { describe, expect, it, beforeEach } from "vitest";
import {
  ZetaCircuitBreaker,
  CircuitOpenError,
  getZetaCircuitBreaker,
  resetZetaCircuitBreaker,
} from "@/lib/integrations/zeta/zeta-circuit-breaker";

describe("ZetaCircuitBreaker — initial state", () => {
  it("starts CLOSED", () => {
    const cb = new ZetaCircuitBreaker("test", { failureThreshold: 3 });
    expect(cb.getState()).toBe("CLOSED");
    expect(cb.isOpen()).toBe(false);
  });
});

describe("ZetaCircuitBreaker — success pass-through", () => {
  it("returns value from fn when CLOSED", async () => {
    const cb = new ZetaCircuitBreaker("test");
    const result = await cb.run(() => Promise.resolve(42));
    expect(result).toBe(42);
  });
});

describe("ZetaCircuitBreaker — opens after threshold failures", () => {
  it("opens when failure_threshold is reached", async () => {
    const cb = new ZetaCircuitBreaker("test-open", {
      failureThreshold: 3,
      windowMs: 60_000,
      openDurationMs: 60_000,
    });

    for (let i = 0; i < 3; i++) {
      await cb.run(() => Promise.reject(new Error("fail"))).catch(() => {});
    }

    expect(cb.getState()).toBe("OPEN");
  });

  it("throws CircuitOpenError when OPEN", async () => {
    const cb = new ZetaCircuitBreaker("test-throws", {
      failureThreshold: 2,
      windowMs: 60_000,
      openDurationMs: 60_000,
    });

    for (let i = 0; i < 2; i++) {
      await cb.run(() => Promise.reject(new Error("fail"))).catch(() => {});
    }

    await expect(cb.run(() => Promise.resolve(1))).rejects.toThrow(CircuitOpenError);
  });
});

describe("ZetaCircuitBreaker — reset", () => {
  it("resets to CLOSED", async () => {
    const cb = new ZetaCircuitBreaker("test-reset", {
      failureThreshold: 2,
      windowMs: 60_000,
    });

    for (let i = 0; i < 2; i++) {
      await cb.run(() => Promise.reject(new Error("fail"))).catch(() => {});
    }

    expect(cb.getState()).toBe("OPEN");
    cb.reset();
    expect(cb.getState()).toBe("CLOSED");
  });
});

describe("getZetaCircuitBreaker — singleton registry", () => {
  beforeEach(() => resetZetaCircuitBreaker("registry-test"));

  it("returns same instance for same name", () => {
    const a = getZetaCircuitBreaker("registry-test");
    const b = getZetaCircuitBreaker("registry-test");
    expect(a).toBe(b);
  });
});
