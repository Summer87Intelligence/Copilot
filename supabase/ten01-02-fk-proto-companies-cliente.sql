-- =============================================================================
-- TEN-01 — Paso 2: integridad referencial cliente proto (company_id → proto_companies)
-- =============================================================================
-- Prerrequisitos: tablas proto_* creadas y pobladas o vacías; public.proto_companies existe.
-- No toca workspace_company_id ni SEC-02.
--
-- Objetivo: evitar company_id “colgado” que no exista en proto_companies.
-- Idempotente: ignora si la FK ya existe (mismo nombre).
-- =============================================================================

do $proto_contacts_fk$
begin
  if to_regclass('public.proto_contacts') is null or to_regclass('public.proto_companies') is null then
    return;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'proto_contacts' and column_name = 'company_id'
  ) then
    return;
  end if;
  if exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'proto_contacts' and c.conname = 'proto_contacts_company_id_fkey'
  ) then
    return;
  end if;
  alter table public.proto_contacts
    add constraint proto_contacts_company_id_fkey
    foreign key (company_id) references public.proto_companies (id) on delete restrict;
exception
  when duplicate_object then null;
end;
$proto_contacts_fk$;

do $proto_invoices_fk$
begin
  if to_regclass('public.proto_invoices') is null or to_regclass('public.proto_companies') is null then
    return;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'proto_invoices' and column_name = 'company_id'
  ) then
    return;
  end if;
  if exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'proto_invoices' and c.conname = 'proto_invoices_company_id_fkey'
  ) then
    return;
  end if;
  alter table public.proto_invoices
    add constraint proto_invoices_company_id_fkey
    foreign key (company_id) references public.proto_companies (id) on delete restrict;
exception
  when duplicate_object then null;
end;
$proto_invoices_fk$;

do $proto_receipts_fk$
begin
  if to_regclass('public.proto_receipts') is null or to_regclass('public.proto_companies') is null then
    return;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'proto_receipts' and column_name = 'company_id'
  ) then
    return;
  end if;
  if exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'proto_receipts' and c.conname = 'proto_receipts_company_id_fkey'
  ) then
    return;
  end if;
  alter table public.proto_receipts
    add constraint proto_receipts_company_id_fkey
    foreign key (company_id) references public.proto_companies (id) on delete restrict;
exception
  when duplicate_object then null;
end;
$proto_receipts_fk$;

do $proto_payments_fk$
begin
  if to_regclass('public.proto_payments') is null or to_regclass('public.proto_companies') is null then
    return;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'proto_payments' and column_name = 'company_id'
  ) then
    return;
  end if;
  if exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'proto_payments' and c.conname = 'proto_payments_company_id_fkey'
  ) then
    return;
  end if;
  alter table public.proto_payments
    add constraint proto_payments_company_id_fkey
    foreign key (company_id) references public.proto_companies (id) on delete restrict;
exception
  when duplicate_object then null;
end;
$proto_payments_fk$;
