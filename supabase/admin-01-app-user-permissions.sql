-- admin-01-app-user-permissions.sql
-- Tabla de permisos por módulo por usuario del workspace.
-- workspace_id = app_users.company_id = public.companies.id
-- Idempotente: se puede aplicar varias veces sin error.

-- 1. Agregar columna is_active a app_users (default true, no rompe RBAC actual)
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 2. Tabla de permisos por módulo
CREATE TABLE IF NOT EXISTS public.app_user_permissions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  module_key    text        NOT NULL,
  access_level  text        NOT NULL CHECK (access_level IN ('none','read','write','admin')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_app_user_permissions_workspace_user_module
    UNIQUE (workspace_id, user_id, module_key)
);

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_app_user_permissions_workspace_id
  ON public.app_user_permissions (workspace_id);

CREATE INDEX IF NOT EXISTS idx_app_user_permissions_user_id
  ON public.app_user_permissions (user_id);

-- 4. Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_app_user_permissions_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  new.updated_at := now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_user_permissions_updated_at
  ON public.app_user_permissions;

CREATE TRIGGER trg_app_user_permissions_updated_at
  BEFORE UPDATE ON public.app_user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_app_user_permissions_updated_at();

-- 5. Row Level Security
ALTER TABLE public.app_user_permissions ENABLE ROW LEVEL SECURITY;

-- Usuarios pueden leer sus propios permisos (vía auth.uid())
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'app_user_permissions'
      AND policyname = 'user reads own permissions'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "user reads own permissions"
        ON public.app_user_permissions FOR SELECT
        USING (
          user_id IN (
            SELECT au.id FROM public.app_users au
            WHERE au.auth_user_id = auth.uid()
          )
        )
    $pol$;
  END IF;
END;
$$;

-- Nota: todas las operaciones admin (INSERT/UPDATE/DELETE) se realizan
-- desde rutas Next.js con service_role key, que bypasea RLS.
-- La autorización superadmin se valida en la capa de aplicación.
