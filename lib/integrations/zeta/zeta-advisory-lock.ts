/**
 * ZETA-16: Postgres advisory locks for Zeta sync concurrency protection.
 *
 * Prevents double-execution of the same sync scope (tenant + entity + scope).
 * Uses pg_try_advisory_xact_lock (transaction-scoped) via Supabase RPC.
 *
 * Lock key derivation:
 *   bigint = hash(workspace_company_id + entity + scope) mod 2^62
 *
 * Usage:
 *   const acquired = await tryAcquireAdvisoryLock(supabase, workspaceId, entity, scope);
 *   if (!acquired) {
 *     // another process holds the lock — skip this run
 *     return { skipped: true };
 *   }
 *   // lock held for transaction duration
 *
 * Note: pg_try_advisory_xact_lock is released automatically at transaction end.
 * For session locks, use pg_try_advisory_lock / pg_advisory_unlock.
 * We use xact variant since Supabase client auto-commits after each query.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Deterministically converts a string key to a positive bigint-safe integer.
 * Uses a djb2-inspired hash to avoid crypto dependency.
 */
function hashToLockKey(key: string): number {
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = (Math.imul(h, 33) ^ key.charCodeAt(i)) >>> 0;
  }
  // Map to positive i32 range (advisory lock accepts int4 or int8 pair)
  return h & 0x7fffffff;
}

function buildLockKey(workspaceId: string, entity: string, scope: string): number {
  return hashToLockKey(`${workspaceId}::${entity}::${scope}`);
}

/**
 * Attempts to acquire a session-level advisory lock.
 * Returns true if acquired, false if already held by another session.
 *
 * Note: must be released with releaseAdvisoryLock when done.
 */
export async function tryAcquireAdvisoryLock(
  supabase: SupabaseClient,
  workspaceId: string,
  entity: string,
  scope: string
): Promise<boolean> {
  const lockKey = buildLockKey(workspaceId, entity, scope);

  try {
    const { data, error } = await supabase.rpc("zeta_try_advisory_lock", { lock_key: lockKey });
    if (error) {
      // RPC may not exist yet — log and allow execution (fail open, not fail closed)
      console.warn(
        JSON.stringify({
          source: "zeta-advisory-lock",
          kind: "rpc_error",
          error: error.message,
          lock_key: lockKey,
          fallback: "allowing_execution",
        })
      );
      return true;
    }
    return data === true;
  } catch (e) {
    console.warn(
      JSON.stringify({
        source: "zeta-advisory-lock",
        kind: "acquire_failed",
        error: String(e),
        lock_key: lockKey,
        fallback: "allowing_execution",
      })
    );
    return true; // fail open — don't block sync on lock infrastructure failure
  }
}

/**
 * Releases a previously acquired session-level advisory lock.
 */
export async function releaseAdvisoryLock(
  supabase: SupabaseClient,
  workspaceId: string,
  entity: string,
  scope: string
): Promise<void> {
  const lockKey = buildLockKey(workspaceId, entity, scope);

  try {
    await supabase.rpc("zeta_advisory_unlock", { lock_key: lockKey });
  } catch (e) {
    console.warn(
      JSON.stringify({
        source: "zeta-advisory-lock",
        kind: "release_failed",
        error: String(e),
        lock_key: lockKey,
      })
    );
  }
}
