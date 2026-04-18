-- TEN-01 — Paso 1: nomenclatura multiempresa (documentación en catálogo)
-- ---------------------------------------------------------------------------
-- Prerrequisitos: esquema Copilot base + SEC-02 aplicado (RLS / workspace_company_id).
-- Ejecución: manual (SQL Editor). Idempotente: solo COMMENT / extensiones de comentario.
--
-- REGLA CANÓNICA (no contradice SEC-02):
--   - public.companies.id = tenant / workspace SaaS (la empresa de la suscripción).
--   - public.proto_companies.id = cliente u objeto de negocio del dominio proto (AR, caja, etc.).
--   - company_id en tablas operativas Copilot = casi siempre FK a public.companies.id
--       EXCEPTO en familia proto_* operativa, donde company_id = cliente -> proto_companies.id.
--   - workspace_company_id (SEC-02) = tenant real SaaS -> public.companies.id donde SEC-02
--       ya lo definió; no duplicar con otra columna semánticamente igual.
-- ---------------------------------------------------------------------------

comment on table public.companies is
  'TEN-01: tenant/workspace SaaS (suscripción). PK referenciada por app_users.company_id, '
  'dashboard_snapshots.company_id, copilot_insights.company_id y workspace_company_id en motor/proto.';

comment on table public.app_users is
  'TEN-01: membresía usuario ↔ tenant SaaS vía company_id → public.companies.id.';

do $c$
declare
  tbl text;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_users' and column_name = 'company_id'
  ) then
    execute $d$
      comment on column public.app_users.company_id is
        'TEN-01: tenant SaaS obligatorio; FK a public.companies.id.'
    $d$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'dashboard_snapshots' and column_name = 'company_id'
  ) then
    execute $d$
      comment on column public.dashboard_snapshots.company_id is
        'TEN-01: tenant SaaS obligatorio; FK a public.companies.id. Alineado con SEC-02 (RLS + triggers).'
    $d$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'copilot_insights' and column_name = 'company_id'
  ) then
    execute $d$
      comment on column public.copilot_insights.company_id is
        'TEN-01: tenant SaaS obligatorio; FK a public.companies.id. Distinto de proto_companies.id.'
    $d$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'initiatives' and column_name = 'workspace_company_id'
  ) then
    execute $d$
      comment on column public.initiatives.workspace_company_id is
        'TEN-01/SEC-02: tenant SaaS → public.companies.id. No renombrar a company_id para no romper políticas/triggers SEC-02.'
    $d$;
  end if;

  foreach tbl in array array['decisions', 'actions', 'outcomes', 'proto_documents']::text[] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = tbl and column_name = 'workspace_company_id'
    ) then
      execute format(
        $f$comment on column public.%I.workspace_company_id is
          'TEN-01/SEC-02: tenant SaaS → public.companies.id.'$f$,
        tbl
      );
    end if;
  end loop;

  foreach tbl in array array[
    'proto_companies',
    'proto_contacts',
    'proto_invoices',
    'proto_receipts',
    'proto_payments',
    'proto_tax_obligations',
    'proto_tax_payments'
  ]::text[] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = tbl and column_name = 'workspace_company_id'
    ) then
      execute format(
        $f$comment on column public.%I.workspace_company_id is
          'TEN-01/SEC-02: tenant SaaS → public.companies.id. Complementa company_id cuando éste es cliente proto.'$f$,
        tbl
      );
    end if;
  end loop;

  foreach tbl in array array['proto_contacts', 'proto_invoices', 'proto_receipts', 'proto_payments']::text[] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = tbl and column_name = 'company_id'
    ) then
      execute format(
        $f$comment on column public.%I.company_id is
          'TEN-01: cliente proto → public.proto_companies.id (no es el tenant SaaS).'$f$,
        tbl
      );
    end if;
  end loop;
end;
$c$;
