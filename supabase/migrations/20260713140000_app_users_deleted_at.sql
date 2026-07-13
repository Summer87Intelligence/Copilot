-- USER-ACCOUNT-DEACTIVATE-VS-DELETE-001: soft-delete para eliminación de cuentas
-- sin romper FKs históricas. Desactivar solo usa is_active; eliminar setea deleted_at.

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

COMMENT ON COLUMN public.app_users.deleted_at IS
  'Marca de eliminación lógica (soft delete). NULL = cuenta no eliminada.';

CREATE INDEX IF NOT EXISTS app_users_deleted_at_idx
  ON public.app_users (deleted_at)
  WHERE deleted_at IS NOT NULL;
