/**
 * ZETA-16: Simple in-process circuit breaker for Zeta API calls.
 *
 * States:
 *   CLOSED  — normal operation, requests pass through.
 *   OPEN    — Zeta is failing; requests are rejected immediately.
 *   HALF_OPEN — probe state; one request allowed to test recovery.
 *
 * Transitions:
 *   CLOSED  → OPEN      when failure_count >= FAILURE_THRESHOLD in the window.
 *   OPEN    → HALF_OPEN after OPEN_DURATION_MS.
 *   HALF_OPEN → CLOSED  on success.
 *   HALF_OPEN → OPEN    on failure.
 *
 * Scope: per-process (in-memory). For multi-instance setups, persist state
 * in zeta_sync_metrics using the `circuit_open` metric (already checked
 * in zeta-health-score.ts).
 *
 * Usage:
 *   const cb = getZetaCircuitBreaker("zeta-api");
 *   const result = await cb.run(() => zetaPostJson(...));
 */

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker [${name}] is OPEN — Zeta API temporarily suspended.`);
    this.name = "CircuitOpenError";
  }
}

export type CircuitBreakerConfig = {
  /** Number of failures in the window before opening. Default: 5. */
  failureThreshold?: number;
  /** Time window for failure counting (ms). Default: 60_000 (1 min). */
  windowMs?: number;
  /** How long to stay OPEN before allowing a probe. Default: 120_000 (2 min). */
  openDurationMs?: number;
};

export class ZetaCircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures: number[] = []; // timestamps of recent failures
  private openedAt: number | null = null;

  private readonly failureThreshold: number;
  private readonly windowMs: number;
  private readonly openDurationMs: number;

  constructor(
    readonly name: string,
    config: CircuitBreakerConfig = {}
  ) {
    this.failureThreshold = config.failureThreshold ?? 5;
    this.windowMs = config.windowMs ?? 60_000;
    this.openDurationMs = config.openDurationMs ?? 120_000;
  }

  getState(): CircuitState {
    this.transitionIfNeeded();
    return this.state;
  }

  isOpen(): boolean {
    return this.getState() === "OPEN";
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    this.transitionIfNeeded();

    if (this.state === "OPEN") {
      throw new CircuitOpenError(this.name);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (e) {
      this.onFailure();
      throw e;
    }
  }

  private transitionIfNeeded(): void {
    const now = Date.now();

    if (this.state === "OPEN" && this.openedAt !== null) {
      if (now - this.openedAt >= this.openDurationMs) {
        this.state = "HALF_OPEN";
        console.info(
          JSON.stringify({ source: "zeta-circuit-breaker", kind: "half_open", name: this.name })
        );
      }
    }

    // Evict old failures outside the window
    this.failures = this.failures.filter((t) => now - t <= this.windowMs);
  }

  private onSuccess(): void {
    if (this.state === "HALF_OPEN") {
      this.state = "CLOSED";
      this.failures = [];
      this.openedAt = null;
      console.info(
        JSON.stringify({ source: "zeta-circuit-breaker", kind: "closed", name: this.name })
      );
    }
  }

  private onFailure(): void {
    const now = Date.now();
    this.failures.push(now);
    // Evict old
    this.failures = this.failures.filter((t) => now - t <= this.windowMs);

    if (this.state === "HALF_OPEN" || this.failures.length >= this.failureThreshold) {
      this.state = "OPEN";
      this.openedAt = now;
      console.warn(
        JSON.stringify({
          source: "zeta-circuit-breaker",
          kind: "opened",
          name: this.name,
          failure_count: this.failures.length,
        })
      );
    }
  }

  reset(): void {
    this.state = "CLOSED";
    this.failures = [];
    this.openedAt = null;
  }
}

// ── Global registry (singleton per name) ─────────────────────────────────────

const registry = new Map<string, ZetaCircuitBreaker>();

export function getZetaCircuitBreaker(
  name: string,
  config?: CircuitBreakerConfig
): ZetaCircuitBreaker {
  if (!registry.has(name)) {
    registry.set(name, new ZetaCircuitBreaker(name, config));
  }
  return registry.get(name)!;
}

export function resetZetaCircuitBreaker(name: string): void {
  registry.get(name)?.reset();
}
