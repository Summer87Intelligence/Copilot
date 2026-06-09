-- =============================================================================
-- treasury_exchange_rates — tipo de cambio manual por workspace
-- =============================================================================
-- Cada workspace puede registrar un TC manual (UYU por 1 USD).
-- Se guarda historial; la fila más reciente por workspace es la vigente.
-- Idempotente: seguro si ya fue aplicada.
-- =============================================================================

create table if not exists public.treasury_exchange_rates (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.companies (id) on delete cascade,
  uyu_per_usd     numeric(14, 6) not null check (uyu_per_usd > 0),
  effective_date  date not null default current_date,
  source          text not null default 'manual'
                    check (source in ('manual', 'zeta', 'bcr', 'config')),
  notes           text,
  created_by      uuid,
  created_at      timestamptz not null default now()
);

comment on table public.treasury_exchange_rates is
  'Historial de tipos de cambio UYU/USD por workspace. La fila más reciente es la vigente.';
comment on column public.treasury_exchange_rates.uyu_per_usd is
  '1 USD = N UYU. Ej: 43.5 significa 1 USD = 43,50 UYU.';
comment on column public.treasury_exchange_rates.source is
  'manual=ingresado manualmente; zeta=sincronizado desde Zeta; bcr=BCU/BCR; config=configuración tenant.';

create index if not exists idx_treasury_exchange_rates_workspace_date
  on public.treasury_exchange_rates (workspace_id, effective_date desc, created_at desc);

alter table public.treasury_exchange_rates enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'treasury_exchange_rates'
      and policyname = 'treasury_exchange_rates_select_workspace'
  ) then
    execute $pol$
      create policy treasury_exchange_rates_select_workspace
        on public.treasury_exchange_rates
        for select
        using (workspace_id = public.copilot_current_workspace_company_id())
    $pol$;
  end if;
end;
$$;
