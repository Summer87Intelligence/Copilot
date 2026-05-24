/**
 * In-memory best-effort throttle for notification generation.
 *
 * Not a security boundary — module-level state resets on serverless cold starts.
 * Purpose: prevent accidental spam (double-click, stuck retry loops) within a
 * single warm instance. Cron and post-sync callers bypass this via isCron flag.
 */

const lastGeneratedAt = new Map<string, number>();

export const DEFAULT_GENERATION_WINDOW_MS = 120_000; // 2 minutes

/**
 * Returns true if the workspace has run generation within the window.
 * Accepts optional nowMs for deterministic testing.
 */
export function shouldThrottleGeneration(
  workspaceCompanyId: string,
  windowMs = DEFAULT_GENERATION_WINDOW_MS,
  nowMs = Date.now()
): boolean {
  const last = lastGeneratedAt.get(workspaceCompanyId);
  if (last === undefined) return false;
  return nowMs - last < windowMs;
}

/**
 * Records a successful generation run timestamp.
 * Accepts optional nowMs for deterministic testing.
 */
export function recordGenerationRun(
  workspaceCompanyId: string,
  nowMs = Date.now()
): void {
  lastGeneratedAt.set(workspaceCompanyId, nowMs);
}

/** Exposed only for testing — clears all throttle state. */
export function _clearThrottleStateForTesting(): void {
  lastGeneratedAt.clear();
}
