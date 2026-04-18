-- =============================================================================
-- TEN-01 — Paso 3: índices compuestos (tenant SaaS + tiempo / tipo)
-- =============================================================================
-- Prerrequisitos: tablas y columnas existentes.
-- Idempotente: CREATE INDEX IF NOT EXISTS.
-- =============================================================================

do $idx$
begin
  if to_regclass('public.dashboard_snapshots') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'dashboard_snapshots' and column_name = 'company_id'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'dashboard_snapshots' and column_name = 'created_at'
     ) then
    execute
      'create index if not exists idx_dashboard_snapshots_company_created '
      || 'on public.dashboard_snapshots (company_id, created_at desc)';
  end if;

  if to_regclass('public.copilot_insights') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'copilot_insights' and column_name = 'company_id'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'copilot_insights' and column_name = 'created_at'
     )
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'copilot_insights' and column_name = 'type'
     ) then
    execute
      'create index if not exists idx_copilot_insights_company_created '
      || 'on public.copilot_insights (company_id, created_at desc)';
    execute
      'create index if not exists idx_copilot_insights_company_type '
      || 'on public.copilot_insights (company_id, type)';
  end if;
end;
$idx$;
