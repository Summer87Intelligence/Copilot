-- =============================================================================
-- proto_companies — columnas alineadas a Zeta (RESTContactosV3Query → Empresa)
-- + zeta_metadata (jsonb) + RPC de introspección de columnas para import controlado.
-- Idempotente: IF NOT EXISTS / CREATE OR REPLACE.
-- =============================================================================

alter table public.proto_companies
  add column if not exists "Codigo" text,
  add column if not exists "RazonSocial" text,
  add column if not exists "Nombre" text,
  add column if not exists "RUT" text,
  add column if not exists "Documento" text,
  add column if not exists "DocumentoSigla" text,
  add column if not exists "DocumentoTipo" text,
  add column if not exists "Email1" text,
  add column if not exists "Telefono" text,
  add column if not exists "Celular" text,
  add column if not exists "Direccion" text,
  add column if not exists "DireccionCompleta" text,
  add column if not exists "Localidad" text,
  add column if not exists "GiroNombre" text,
  add column if not exists "ContactoActivo" text,
  add column if not exists zeta_metadata jsonb default '{}'::jsonb;

comment on column public.proto_companies."Codigo" is
  'Código cliente Zeta (RESTContactosV3Query); clave de deduplicación en import inicial.';
comment on column public.proto_companies.zeta_metadata is
  'Campos extendidos Zeta y snapshot (Grupo, Zona, Origen, etc.) no mapeados a columnas dedicadas.';

create unique index if not exists uq_proto_companies_workspace_codigo
  on public.proto_companies (workspace_company_id, ("Codigo"))
  where "Codigo" is not null and btrim("Codigo") <> '';

-- Lista de nombres de columnas en public.proto_companies (para import sin inventar campos).
create or replace function public.copilot_proto_companies_column_names()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    array_agg(a.attname::text order by a.attnum),
    '{}'::text[]
  )
  from pg_attribute a
  join pg_class c on a.attrelid = c.oid
  join pg_namespace n on c.relnamespace = n.oid
  where n.nspname = 'public'
    and c.relname = 'proto_companies'
    and a.attnum > 0
    and not a.attisdropped;
$$;

comment on function public.copilot_proto_companies_column_names() is
  'Devuelve nombres de columnas de public.proto_companies (introspección para import Zeta).';

revoke all on function public.copilot_proto_companies_column_names() from public;
grant execute on function public.copilot_proto_companies_column_names() to authenticated;
grant execute on function public.copilot_proto_companies_column_names() to service_role;
