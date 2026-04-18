-- =============================================================================
-- TEN-01 — Paso 5 (cierre): FK a public.companies(id) si faltara + índices compuestos útiles
-- =============================================================================
-- No modifica SEC-02. No agrega columnas tenant nuevas.
--
-- A) Si existe la columna tenant pero ninguna FK desde esa columna hacia public.companies,
--    agrega CONSTRAINT con nombre estable (entornos con ADD COLUMN sin REFERENCES).
--
-- B) Índices compuestos: tenant + join frecuente (motor y proto cliente). IF NOT EXISTS.
-- =============================================================================

do $fk$
declare
  r record;
  has_fk boolean;
begin
  for r in
    select * from (values
      ('app_users', 'company_id', 'app_users_company_id_companies_fkey'),
      ('dashboard_snapshots', 'company_id', 'dashboard_snapshots_company_id_companies_fkey'),
      ('copilot_insights', 'company_id', 'copilot_insights_company_id_companies_fkey'),
      ('initiatives', 'workspace_company_id', 'initiatives_workspace_company_id_companies_fkey'),
      ('decisions', 'workspace_company_id', 'decisions_workspace_company_id_companies_fkey'),
      ('actions', 'workspace_company_id', 'actions_workspace_company_id_companies_fkey'),
      ('outcomes', 'workspace_company_id', 'outcomes_workspace_company_id_companies_fkey'),
      ('proto_documents', 'workspace_company_id', 'proto_documents_workspace_company_id_companies_fkey'),
      ('proto_companies', 'workspace_company_id', 'proto_companies_workspace_company_id_companies_fkey'),
      ('proto_contacts', 'workspace_company_id', 'proto_contacts_workspace_company_id_companies_fkey'),
      ('proto_invoices', 'workspace_company_id', 'proto_invoices_workspace_company_id_companies_fkey'),
      ('proto_receipts', 'workspace_company_id', 'proto_receipts_workspace_company_id_companies_fkey'),
      ('proto_payments', 'workspace_company_id', 'proto_payments_workspace_company_id_companies_fkey'),
      ('proto_tax_obligations', 'workspace_company_id', 'proto_tax_obligations_workspace_company_id_companies_fkey'),
      ('proto_tax_payments', 'workspace_company_id', 'proto_tax_payments_workspace_company_id_companies_fkey')
    ) as v(tbl, col, cname)
  loop
    if to_regclass(format('public.%I', r.tbl)) is null then
      continue;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = r.tbl and column_name = r.col
    ) then
      continue;
    end if;
    select exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      cross join lateral unnest(c.conkey) as ck(attnum)
      join pg_attribute a on a.attrelid = t.oid and a.attnum = ck.attnum
      where c.contype = 'f'
        and n.nspname = 'public'
        and t.relname = r.tbl
        and a.attname = r.col
        and c.confrelid = 'public.companies'::regclass
    ) into has_fk;
    if has_fk then
      continue;
    end if;
    begin
      execute format(
        'alter table public.%I add constraint %I foreign key (%I) references public.companies (id) on delete restrict',
        r.tbl,
        r.cname,
        r.col
      );
    exception
      when duplicate_object then null;
      when foreign_key_violation then
        raise notice 'ten01-05: FK % omitida (violación FK — revisar huérfanos)', r.cname;
    end;
  end loop;
end;
$fk$;

-- Motor: tenant + initiative (listados por workspace e initiative_id)
do $ix_motor$
begin
  if to_regclass('public.decisions') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'decisions' and column_name = 'workspace_company_id')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'decisions' and column_name = 'initiative_id')
  then
    execute
      'create index if not exists idx_decisions_workspace_company_initiative '
      || 'on public.decisions (workspace_company_id, initiative_id)';
  end if;

  if to_regclass('public.actions') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'actions' and column_name = 'workspace_company_id')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'actions' and column_name = 'initiative_id')
  then
    execute
      'create index if not exists idx_actions_workspace_company_initiative '
      || 'on public.actions (workspace_company_id, initiative_id)';
  end if;

  if to_regclass('public.outcomes') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'outcomes' and column_name = 'workspace_company_id')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'outcomes' and column_name = 'initiative_id')
  then
    execute
      'create index if not exists idx_outcomes_workspace_company_initiative '
      || 'on public.outcomes (workspace_company_id, initiative_id)';
  end if;
end;
$ix_motor$;

-- Proto: tenant SaaS + cliente (company_id → proto_companies)
do $ix_proto$
begin
  if to_regclass('public.proto_contacts') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'proto_contacts' and column_name = 'workspace_company_id')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'proto_contacts' and column_name = 'company_id')
  then
    execute
      'create index if not exists idx_proto_contacts_workspace_company_client '
      || 'on public.proto_contacts (workspace_company_id, company_id)';
  end if;

  if to_regclass('public.proto_invoices') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'proto_invoices' and column_name = 'workspace_company_id')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'proto_invoices' and column_name = 'company_id')
  then
    execute
      'create index if not exists idx_proto_invoices_workspace_company_client '
      || 'on public.proto_invoices (workspace_company_id, company_id)';
  end if;

  if to_regclass('public.proto_receipts') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'proto_receipts' and column_name = 'workspace_company_id')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'proto_receipts' and column_name = 'company_id')
  then
    execute
      'create index if not exists idx_proto_receipts_workspace_company_client '
      || 'on public.proto_receipts (workspace_company_id, company_id)';
  end if;

  if to_regclass('public.proto_payments') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'proto_payments' and column_name = 'workspace_company_id')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'proto_payments' and column_name = 'company_id')
  then
    execute
      'create index if not exists idx_proto_payments_workspace_company_client '
      || 'on public.proto_payments (workspace_company_id, company_id)';
  end if;
end;
$ix_proto$;

-- Documentos: filtro por workspace + vínculo (joins con entidades relacionadas en tenant)
do $ix_proto_docs$
begin
  if to_regclass('public.proto_documents') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'proto_documents' and column_name = 'workspace_company_id')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'proto_documents' and column_name = 'related_table')
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'proto_documents' and column_name = 'related_id')
  then
    execute
      'create index if not exists idx_proto_documents_workspace_related '
      || 'on public.proto_documents (workspace_company_id, related_table, related_id)';
  end if;
end;
$ix_proto_docs$;
