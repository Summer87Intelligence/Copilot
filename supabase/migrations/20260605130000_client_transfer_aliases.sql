-- =============================================================================
-- client_transfer_aliases — formas de transferencia por cliente (Santander / búsqueda)
-- =============================================================================
-- Idempotente: seguro si la tabla ya fue aplicada manualmente en producción.
-- Writes vía API Next.js (service role); RLS SELECT por workspace del JWT.
-- =============================================================================

create table if not exists public.client_transfer_aliases (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.companies (id) on delete cascade,
  company_id    uuid not null references public.proto_companies (id) on delete cascade,
  label         text not null,
  notes         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint client_transfer_aliases_label_not_empty
    check (length(btrim(label)) > 0)
);

comment on table public.client_transfer_aliases is
  'Aliases de texto para matchear transferencias bancarias y búsqueda en Clientes. Soft-delete vía is_active.';

create index if not exists idx_client_transfer_aliases_workspace_id
  on public.client_transfer_aliases (workspace_id);

create index if not exists idx_client_transfer_aliases_company_id
  on public.client_transfer_aliases (company_id);

create index if not exists idx_client_transfer_aliases_workspace_company_active
  on public.client_transfer_aliases (workspace_id, company_id, is_active);

-- Un label activo único por cliente dentro del workspace (case-insensitive, trim)
create unique index if not exists idx_client_transfer_aliases_uniq
  on public.client_transfer_aliases (workspace_id, company_id, lower(btrim(label)))
  where is_active = true;

create or replace function public.client_transfer_aliases_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_client_transfer_aliases_updated_at
  on public.client_transfer_aliases;

create trigger trg_client_transfer_aliases_updated_at
  before update on public.client_transfer_aliases
  for each row
  execute function public.client_transfer_aliases_set_updated_at();

alter table public.client_transfer_aliases enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'client_transfer_aliases'
      and policyname = 'client_transfer_aliases_select_workspace'
  ) then
    execute $pol$
      create policy client_transfer_aliases_select_workspace
        on public.client_transfer_aliases
        for select
        using (workspace_id = public.copilot_current_workspace_company_id())
    $pol$;
  end if;
end;
$$;

comment on index public.idx_client_transfer_aliases_uniq is
  'Un alias activo por label normalizado (lower+trim) por cliente y workspace.';
