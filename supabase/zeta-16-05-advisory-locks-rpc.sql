-- ZETA-16-05: Postgres advisory lock helpers exposed as RPCs.
--
-- These functions wrap pg_try_advisory_lock / pg_advisory_unlock
-- so they can be called from the Supabase JS client via .rpc().
--
-- Lock scope: session-level (must be explicitly released).
-- Callers: zeta-advisory-lock.ts
--
-- Security: SECURITY DEFINER so service_role can call without schema perms.
-- Idempotent: OR REPLACE throughout.

CREATE OR REPLACE FUNCTION zeta_try_advisory_lock(lock_key integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN pg_try_advisory_lock(lock_key::bigint);
END;
$$;

CREATE OR REPLACE FUNCTION zeta_advisory_unlock(lock_key integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN pg_advisory_unlock(lock_key::bigint);
END;
$$;

-- Grant execute to authenticated and service roles
GRANT EXECUTE ON FUNCTION zeta_try_advisory_lock(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION zeta_try_advisory_lock(integer) TO service_role;
GRANT EXECUTE ON FUNCTION zeta_advisory_unlock(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION zeta_advisory_unlock(integer) TO service_role;
