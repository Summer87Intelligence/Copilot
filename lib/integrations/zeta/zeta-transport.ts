export type ZetaRetryPolicy = "no_retry" | "retry_with_backoff";

export type ZetaHttpClassification = {
  policy: ZetaRetryPolicy;
  /** Milisegundos a esperar antes del próximo intento (429 / Retry-After). */
  delayMs?: number;
  /** Etiqueta estable para logs (no incluye body). */
  reason: string;
};

/**
 * Clasifica respuestas HTTP para política de reintento.
 * - 400: payload inválido / request mal armada → sin retry.
 * - 401/403: credenciales / permisos → sin retry.
 * - 429: rate limit → retry respetando Retry-After o backoff.
 * - 408, 5xx, red: transitorio → retry con backoff.
 */
export function classifyZetaHttpResponse(
  status: number,
  headers: Headers
): ZetaHttpClassification {
  if (status === 400) {
    return { policy: "no_retry", reason: "http_400_bad_request" };
  }
  if (status === 401 || status === 403) {
    return { policy: "no_retry", reason: `http_${status}_auth` };
  }
  if (status === 429) {
    const delayMs = parseRetryAfterMs(headers.get("retry-after"));
    return {
      policy: "retry_with_backoff",
      delayMs: delayMs ?? undefined,
      reason: "http_429_rate_limit",
    };
  }
  if (status === 408 || status === 502 || status === 503 || status === 504) {
    return { policy: "retry_with_backoff", reason: `http_${status}_transient` };
  }
  if (status >= 500) {
    return { policy: "retry_with_backoff", reason: "http_5xx" };
  }
  if (status >= 200 && status < 300) {
    return { policy: "no_retry", reason: "http_success" };
  }
  return { policy: "no_retry", reason: `http_${status}_no_retry` };
}

export function classifyZetaNetworkError(err: unknown): ZetaHttpClassification {
  const msg = err instanceof Error ? err.message : String(err);
  const combined = msg.toLowerCase();
  if (
    combined.includes("aborterror") ||
    combined.includes("abort") ||
    combined.includes("network") ||
    combined.includes("fetch failed") ||
    combined.includes("econnreset") ||
    combined.includes("etimedout")
  ) {
    return { policy: "retry_with_backoff", reason: "network_error" };
  }
  return { policy: "no_retry", reason: "network_non_retryable" };
}

/** Parsea `Retry-After` en segundos o fecha HTTP; devuelve ms o null. */
export function parseRetryAfterMs(header: string | null): number | null {
  if (!header?.trim()) return null;
  const v = header.trim();
  const asInt = Number(v);
  if (Number.isFinite(asInt) && asInt >= 0) return asInt * 1000;
  const t = Date.parse(v);
  if (!Number.isNaN(t)) {
    const delta = t - Date.now();
    return delta > 0 ? delta : 0;
  }
  return null;
}

export function computeBackoffMs(attempt: number): number {
  const base = 400;
  const cap = 8000;
  const exp = Math.min(cap, base * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * 250);
  return exp + jitter;
}
