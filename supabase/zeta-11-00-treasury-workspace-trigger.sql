-- =============================================================================
-- ZETA-11 — Trigger tenant para tablas treasury (`workspace_id`)
-- =============================================================================
-- Nomenclatura (ZETA-11):
--   - `workspace_id` = tenant SaaS (`public.companies.id`), mismo UUID que
--     `app_users.company_id` / `copilot_current_workspace_company_id()`.
--   - `company_id` (text, nullable) = identificador ERP/Zeta futuro; NO es el tenant.
--
-- No reutiliza `copilot_proto_row_force_workspace()` (fija `workspace_company_id`).
-- Idempotente.
-- =============================================================================

create or replace function public.copilot_treasury_row_force_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  wid uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     or session_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if auth.uid() is null then
    raise exception
      'copilot_treasury_row: operación tenant sin auth.uid() y sin bypass permitido (zeta-11)'
      using errcode = '42501';
  end if;

  wid := public.copilot_current_workspace_company_id();
  if wid is null then
    raise exception 'copilot_treasury_row: sin workspace (app_users sin fila para este JWT)'
      using errcode = '42501';
  end if;

  new.workspace_id := wid;
  return new;
end;
$$;

comment on function public.copilot_treasury_row_force_workspace() is
  'ZETA-11: fuerza workspace_id en tablas treasury para sesión autenticada. '
  'Bypass solo service_role o session_user postgres/supabase_admin.';
