/**
 * SECURITY-02: rate limit in-memory (dev / single-instance).
 * En Vercel multi-instancia cada instancia tiene su propio contador (best-effort).
 */

export type LoginRateLimitConfig = {
  windowMs: number;
  maxAttempts: number;
};

type Bucket = {
  windowStartMs: number;
  count: number;
};

const buckets = new Map<string, Bucket>();

export function resolveLoginRateLimitWindowMs(): number {
  const raw = process.env.LOGIN_RATE_LIMIT_WINDOW_MS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(n) && n >= 10_000) return n;
  return 900_000;
}

export function resolveLoginRateLimitMaxIp(): number {
  const raw = process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS_IP?.trim();
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(n) && n >= 1) return n;
  return 40;
}

export function resolveLoginRateLimitMaxUser(): number {
  const raw = process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS_USER?.trim();
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(n) && n >= 1) return n;
  return 12;
}

function pruneEmptyWindows(nowMs: number, windowMs: number): void {
  for (const [k, b] of buckets) {
    if (nowMs - b.windowStartMs > windowMs * 2) {
      buckets.delete(k);
    }
  }
}

/**
 * @returns `allowed: true` si bajo el tope; si no, `allowed: false`.
 */
export function checkLoginRateLimit(
  key: string,
  nowMs: number,
  config: LoginRateLimitConfig
): { allowed: boolean; retryAfterMs: number } {
  pruneEmptyWindows(nowMs, config.windowMs);
  const existing = buckets.get(key);
  if (!existing || nowMs - existing.windowStartMs >= config.windowMs) {
    buckets.set(key, { windowStartMs: nowMs, count: 1 });
    return { allowed: true, retryAfterMs: 0 };
  }
  existing.count += 1;
  if (existing.count > config.maxAttempts) {
    const retryAfterMs = Math.max(
      0,
      config.windowMs - (nowMs - existing.windowStartMs)
    );
    return { allowed: false, retryAfterMs };
  }
  return { allowed: true, retryAfterMs: 0 };
}

/** Solo tests: limpia estado global. */
export function resetLoginRateLimitStoreForTests(): void {
  buckets.clear();
}
