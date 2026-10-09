-- Preparada, NO aplicada. No cambia permisos de usuarios ni datos bancarios.
BEGIN;
ALTER TABLE public.app_user_permissions
  DROP CONSTRAINT IF EXISTS app_user_permissions_access_level_check;
ALTER TABLE public.app_user_permissions
  ADD CONSTRAINT app_user_permissions_access_level_check
  CHECK (access_level IN ('none', 'inflow_readonly', 'inflow_associate', 'read', 'write', 'admin'));
ALTER TABLE public.app_user_permissions
  DROP CONSTRAINT IF EXISTS app_user_permissions_inflow_associate_module_check;
ALTER TABLE public.app_user_permissions
  ADD CONSTRAINT app_user_permissions_inflow_associate_module_check
  CHECK (access_level <> 'inflow_associate' OR module_key = 'bank_movements');
COMMIT;
