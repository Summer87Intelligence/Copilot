-- FASE BANK-RECONCILIATION-END-TO-END-STABILIZATION-001
-- Extiende access_level con inflow_readonly (solo ingresos, solo lectura).
-- Idempotente.

ALTER TABLE public.app_user_permissions
  DROP CONSTRAINT IF EXISTS app_user_permissions_access_level_check;

ALTER TABLE public.app_user_permissions
  ADD CONSTRAINT app_user_permissions_access_level_check
  CHECK (access_level = ANY (ARRAY[
    'none'::text,
    'inflow_readonly'::text,
    'read'::text,
    'write'::text,
    'admin'::text
  ]));
