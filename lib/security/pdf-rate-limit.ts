import { NextRequest, NextResponse } from "next/server";

import { checkLoginRateLimit } from "@/lib/security/login-rate-limit";
import { getRequestClientMeta } from "@/lib/security/request-client-meta";

export const PDF_RATE_LIMIT_MESSAGE =
  "Demasiadas descargas. Esperá unos segundos e intentá de nuevo.";

export function resolvePdfRateLimitWindowMs(): number {
  const raw = process.env.PDF_RATE_LIMIT_WINDOW_MS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(n) && n >= 1000) return n;
  return 60_000;
}

export function resolvePdfRateLimitMaxPerWindow(): number {
  const raw = process.env.PDF_RATE_LIMIT_MAX_REQUESTS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(n) && n >= 1) return n;
  return 5;
}

/**
 * Best-effort in-memory limiter (misma estrategia que login-rate-limit).
 * Clave: endpoint + usuario autenticado, o IP si no hay user id.
 *
 * Env opcionales:
 * - PDF_RATE_LIMIT_WINDOW_MS (default 60000)
 * - PDF_RATE_LIMIT_MAX_REQUESTS (default 5)
 */
export function enforcePdfRateLimit(
  request: NextRequest,
  endpoint: string,
  userId: string | null | undefined
): NextResponse | null {
  const windowMs = resolvePdfRateLimitWindowMs();
  const maxAttempts = resolvePdfRateLimitMaxPerWindow();
  const nowMs = Date.now();
  const { ip } = getRequestClientMeta(request);
  const identity = userId?.trim() || `ip:${ip ?? "unknown"}`;
  const key = `pdf:${endpoint}:${identity}`;
  const result = checkLoginRateLimit(key, nowMs, { windowMs, maxAttempts });
  if (result.allowed) return null;

  return NextResponse.json(
    { ok: false, code: "RATE_LIMITED", error: PDF_RATE_LIMIT_MESSAGE },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))),
      },
    }
  );
}
