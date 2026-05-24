import { afterEach, describe, expect, it } from "vitest";

import {
  _clearThrottleStateForTesting,
  DEFAULT_GENERATION_WINDOW_MS,
  recordGenerationRun,
  shouldThrottleGeneration,
} from "@/lib/copilot-notifications/generation-throttle";

const WS = "workspace-test-001";

afterEach(() => {
  _clearThrottleStateForTesting();
});

describe("shouldThrottleGeneration", () => {
  it("no throttle si nunca se registró un run", () => {
    expect(shouldThrottleGeneration(WS)).toBe(false);
  });

  it("throttle inmediato tras recordGenerationRun", () => {
    const now = Date.now();
    recordGenerationRun(WS, now);
    expect(shouldThrottleGeneration(WS, DEFAULT_GENERATION_WINDOW_MS, now + 1000)).toBe(true);
  });

  it("no throttle si ya pasó la ventana", () => {
    const now = Date.now();
    recordGenerationRun(WS, now);
    expect(
      shouldThrottleGeneration(WS, DEFAULT_GENERATION_WINDOW_MS, now + DEFAULT_GENERATION_WINDOW_MS + 1)
    ).toBe(false);
  });

  it("throttle con ventana custom", () => {
    const now = Date.now();
    recordGenerationRun(WS, now);
    expect(shouldThrottleGeneration(WS, 60_000, now + 30_000)).toBe(true);
    expect(shouldThrottleGeneration(WS, 60_000, now + 60_001)).toBe(false);
  });

  it("workspaces distintos se aíslan entre sí", () => {
    const now = Date.now();
    recordGenerationRun("ws-a", now);
    expect(shouldThrottleGeneration("ws-a", DEFAULT_GENERATION_WINDOW_MS, now + 1000)).toBe(true);
    expect(shouldThrottleGeneration("ws-b", DEFAULT_GENERATION_WINDOW_MS, now + 1000)).toBe(false);
  });

  it("exactamente en el borde de la ventana no throttle", () => {
    const now = Date.now();
    recordGenerationRun(WS, now);
    // now - last === windowMs → NOT throttled (strict <)
    expect(shouldThrottleGeneration(WS, DEFAULT_GENERATION_WINDOW_MS, now + DEFAULT_GENERATION_WINDOW_MS)).toBe(false);
  });
});

describe("recordGenerationRun", () => {
  it("sobreescribe timestamp anterior", () => {
    const t1 = Date.now();
    recordGenerationRun(WS, t1);
    const t2 = t1 + DEFAULT_GENERATION_WINDOW_MS + 1;
    recordGenerationRun(WS, t2);
    // Recorded t2, so within window from t2
    expect(shouldThrottleGeneration(WS, DEFAULT_GENERATION_WINDOW_MS, t2 + 1000)).toBe(true);
  });
});

describe("_clearThrottleStateForTesting", () => {
  it("limpiar estado elimina throttle", () => {
    const now = Date.now();
    recordGenerationRun(WS, now);
    _clearThrottleStateForTesting();
    expect(shouldThrottleGeneration(WS, DEFAULT_GENERATION_WINDOW_MS, now + 1000)).toBe(false);
  });
});
