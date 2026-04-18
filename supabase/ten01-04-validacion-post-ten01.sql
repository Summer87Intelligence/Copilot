-- =============================================================================
-- TEN-01 — Validación post-migración (solo lectura; ejecutar tras TEN-01 y SEC-02)
-- =============================================================================

-- 1) Columnas NOT NULL en tenant SaaS (ajustar lista si omitiste alguna tabla)
select table_name, column_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'dashboard_snapshots' and column_name = 'company_id')
    or (table_name = 'copilot_insights' and column_name = 'company_id')
    or (table_name = 'app_users' and column_name = 'company_id')
    or (column_name = 'workspace_company_id' and table_name in (
      'initiatives', 'decisions', 'actions', 'outcomes', 'proto_documents',
      'proto_companies', 'proto_contacts', 'proto_invoices', 'proto_receipts',
      'proto_payments', 'proto_tax_obligations', 'proto_tax_payments'
    ))
  )
order by table_name, column_name;

-- 2) FKs hacia public.companies (tenant SaaS)
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as def
from pg_constraint
where contype = 'f'
  and confrelid = 'public.companies'::regclass
order by 1, 2;

-- 3) FKs hacia public.proto_companies (cliente proto)
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as def
from pg_constraint
where contype = 'f'
  and confrelid = 'public.proto_companies'::regclass
order by 1, 2;

-- 4) Índices en columnas tenant (nombre contiene company o workspace_company)
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and (
    indexdef ilike '%workspace_company_id%'
    or (indexdef ilike '%company_id%' and tablename in (
      'dashboard_snapshots', 'copilot_insights', 'app_users',
      'proto_contacts', 'proto_invoices', 'proto_receipts', 'proto_payments'
    ))
  )
order by tablename, indexname;

-- 5) NULLs residuales en tenant SaaS (debe devolver 0 filas por tabla crítica)
select 'dashboard_snapshots' as tbl, count(*) as null_tenant
from public.dashboard_snapshots where company_id is null
union all
select 'copilot_insights', count(*) from public.copilot_insights where company_id is null
union all
select 'app_users', count(*) from public.app_users where company_id is null
union all
select 'initiatives', count(*) from public.initiatives where workspace_company_id is null
union all
select 'decisions', count(*) from public.decisions where workspace_company_id is null
union all
select 'actions', count(*) from public.actions where workspace_company_id is null
union all
select 'outcomes', count(*) from public.outcomes where workspace_company_id is null
union all
select 'proto_documents', count(*) from public.proto_documents where workspace_company_id is null;

-- 6) Huérfanos: insights apuntan a snapshot de otra empresa (debe ser 0)
select ci.id, ci.company_id as insight_company, ds.company_id as snapshot_company
from public.copilot_insights ci
join public.dashboard_snapshots ds on ds.id = ci.snapshot_id
where ci.snapshot_id is not null
  and ci.company_id is distinct from ds.company_id;

-- 7) Huérfanos: company_id proto sin fila en proto_companies (debe ser 0 tras TEN-01-02)
select 'proto_contacts' as tbl, c.id
from public.proto_contacts c
where not exists (select 1 from public.proto_companies pc where pc.id = c.company_id)
union all
select 'proto_invoices', i.id from public.proto_invoices i
where not exists (select 1 from public.proto_companies pc where pc.id = i.company_id)
union all
select 'proto_receipts', r.id from public.proto_receipts r
where not exists (select 1 from public.proto_companies pc where pc.id = r.company_id)
union all
select 'proto_payments', p.id from public.proto_payments p
where not exists (select 1 from public.proto_companies pc where pc.id = p.company_id);
