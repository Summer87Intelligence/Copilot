import { describe, it, expect, vi } from "vitest";
import { isTransientZetaError, withZetaRetry } from "./zeta-retry";

// ── isTransientZetaError ──────────────────────────────────────────────────────

describe("isTransientZetaError", () => {
  it("devuelve true para fetch failed", () => {
    expect(isTransientZetaError(new Error("fetch failed: network error"))).toBe(true);
  });

  it("devuelve true para ECONNREFUSED", () => {
    expect(isTransientZetaError(new Error("ECONNREFUSED: connection refused"))).toBe(true);
  });

  it("devuelve true para ETIMEDOUT", () => {
    expect(isTransientZetaError(new Error("ETIMEDOUT: operation timed out"))).toBe(true);
  });

  it("devuelve true para timeout genérico", () => {
    expect(isTransientZetaError(new Error("request timeout after 30s"))).toBe(true);
  });

  it("devuelve true para 429 Too Many Requests", () => {
    expect(isTransientZetaError(new Error("HTTP 429: Too Many Requests"))).toBe(true);
  });

  it("devuelve true para rate limit", () => {
    expect(isTransientZetaError(new Error("rate limit exceeded"))).toBe(true);
  });

  it("devuelve true para 500 Internal Server Error", () => {
    expect(isTransientZetaError(new Error("500 Internal Server Error"))).toBe(true);
  });

  it("devuelve true para 503 Service Unavailable", () => {
    expect(isTransientZetaError(new Error("503 Service Unavailable"))).toBe(true);
  });

  it("devuelve false para 400 Bad Request (no transitorio)", () => {
    expect(isTransientZetaError(new Error("400 Bad Request: invalid params"))).toBe(false);
  });

  it("devuelve false para 401 Unauthorized (no transitorio)", () => {
    expect(isTransientZetaError(new Error("401 Unauthorized"))).toBe(false);
  });

  it("devuelve false para 404 Not Found (no transitorio)", () => {
    expect(isTransientZetaError(new Error("404 Not Found"))).toBe(false);
  });

  it("devuelve false para string (no es Error)", () => {
    expect(isTransientZetaError("error de string")).toBe(false);
  });

  it("devuelve false para null", () => {
    expect(isTransientZetaError(null)).toBe(false);
  });

  it("devuelve false para undefined", () => {
    expect(isTransientZetaError(undefined)).toBe(false);
  });

  it("devuelve false para objeto plano (no es Error)", () => {
    expect(isTransientZetaError({ code: "ECONNREFUSED" })).toBe(false);
  });
});

// ── withZetaRetry ─────────────────────────────────────────────────────────────

describe("withZetaRetry", () => {
  it("devuelve el resultado en el primer intento si tiene éxito", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withZetaRetry(fn, { baseDelayMs: 0 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("reintenta en error transitorio y tiene éxito", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValue("ok");
    const result = await withZetaRetry(fn, { baseDelayMs: 0 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("reintenta hasta maxRetries y luego lanza el error", async () => {
    const transient = new Error("fetch failed: network unreachable");
    const fn = vi.fn().mockRejectedValue(transient);
    await expect(
      withZetaRetry(fn, { maxRetries: 3, baseDelayMs: 0 })
    ).rejects.toThrow("fetch failed");
    // inicial + 3 reintentos = 4 llamadas totales
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("NO reintenta errores no transitorios", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("400 Bad Request"));
    await expect(withZetaRetry(fn, { baseDelayMs: 0 })).rejects.toThrow("400 Bad Request");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("llama onRetry con attempt y delayMs correctos", async () => {
    const onRetry = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("503 Service Unavailable"))
      .mockResolvedValue("recovered");

    await withZetaRetry(fn, { baseDelayMs: 0, onRetry });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1, 0);
  });

  it("respeta isTransient personalizado", async () => {
    const customTransient = (err: unknown) =>
      err instanceof Error && err.message.includes("custom_transient");

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("custom_transient"))
      .mockResolvedValue("ok");

    const result = await withZetaRetry(fn, { baseDelayMs: 0, isTransient: customTransient });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("NO reintenta con isTransient personalizado que devuelve false", async () => {
    const neverRetry = () => false;
    const fn = vi.fn().mockRejectedValue(new Error("fetch failed"));
    await expect(
      withZetaRetry(fn, { baseDelayMs: 0, isTransient: neverRetry })
    ).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("propaga el último error cuando todos los reintentos fallan", async () => {
    const errors = [
      new Error("fetch failed: attempt 1"),
      new Error("fetch failed: attempt 2"),
      new Error("fetch failed: attempt 3"),
      new Error("fetch failed: attempt 4"),
    ];
    let call = 0;
    const fn = vi.fn().mockImplementation(() => {
      throw errors[call++];
    });

    await expect(
      withZetaRetry(fn, { maxRetries: 3, baseDelayMs: 0 })
    ).rejects.toThrow("fetch failed: attempt 4");
  });

  it("exponential backoff: delay se dobla en cada intento", async () => {
    const delays: number[] = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValue("ok");

    await withZetaRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 10,
      maxDelayMs: 10_000,
      onRetry: (_err, _attempt, delayMs) => delays.push(delayMs),
    });

    // attempt 0 → delay = 10 * 2^0 = 10
    // attempt 1 → delay = 10 * 2^1 = 20
    expect(delays).toEqual([10, 20]);
  });

  it("cap en maxDelayMs", async () => {
    const delays: number[] = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockRejectedValueOnce(new Error("timeout"))
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValue("ok");

    await withZetaRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 10,
      maxDelayMs: 15,
      onRetry: (_err, _attempt, delayMs) => delays.push(delayMs),
    });

    // attempt 0 → min(10 * 1, 15) = 10
    // attempt 1 → min(10 * 2, 15) = 15
    // attempt 2 → min(10 * 4, 15) = 15
    expect(delays).toEqual([10, 15, 15]);
  });
});
