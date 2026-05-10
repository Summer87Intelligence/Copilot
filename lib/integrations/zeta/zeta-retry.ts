/**
 * Retry conservador para llamadas Zeta.
 * Solo reintenta errores transitorios (red, timeout, 5xx, 429).
 * NO reintenta errores de negocio (4xx, validación).
 */

export type RetryOptions = {
  /** Número máximo de reintentos (default 3). */
  maxRetries?: number;
  /** Delay base en ms; se dobla en cada intento (default 1000). 0 en tests. */
  baseDelayMs?: number;
  /** Cap de delay en ms (default 30_000). */
  maxDelayMs?: number;
  /** Override de detección transitoria (default: isTransientZetaError). */
  isTransient?: (err: unknown) => boolean;
  /** Callback por cada retry; útil para logging. */
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
};

/**
 * Detecta errores transitorios: red, timeout, 5xx, 429.
 * Los errores de negocio (4xx no-429) no son transitorios.
 */
export function isTransientZetaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();

  // Errores de red / transporte
  if (
    msg.includes("fetch failed") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("network") ||
    msg.includes("socket") ||
    msg.includes("aborted")
  )
    return true;

  // Timeout genérico
  if (msg.includes("timeout")) return true;

  // Rate limit / demasiadas solicitudes
  if (msg.includes("429") || msg.includes("rate limit") || msg.includes("too many")) return true;

  // HTTP 5xx (server error)
  if (/\b5\d{2}\b/.test(msg)) return true;

  return false;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Ejecuta `fn` con retry conservador exponential backoff.
 * - Reintentos: max 3 (configurable)
 * - Backoff: baseDelayMs * 2^attempt (cap maxDelayMs)
 * - Solo reintenta si `isTransient(err)` devuelve true
 */
export async function withZetaRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1_000;
  const maxDelayMs = options.maxDelayMs ?? 30_000;
  const isTransient = options.isTransient ?? isTransientZetaError;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      const isLastAttempt = attempt === maxRetries;
      if (isLastAttempt || !isTransient(err)) {
        throw err;
      }

      const delayMs = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      options.onRetry?.(err, attempt + 1, delayMs);
      await sleep(delayMs);
    }
  }

  // Nunca llega aquí, pero satisface el type-checker
  throw lastError;
}
