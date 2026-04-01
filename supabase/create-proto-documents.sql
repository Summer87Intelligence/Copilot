-- =============================================================================
-- proto_documents — primera capa de respaldo documental (metadatos + URL).
-- =============================================================================
-- EJECUCIÓN MANUAL: pegar en SQL Editor de Supabase y Run.
-- No se ejecuta desde la app.
--
-- Requisitos: extensión pgcrypto (gen_random_uuid).
-- Recomendado: haber corrido antes extend-proto-tax-layer.sql (obligaciones/pagos seed).
-- Las filas de ejemplo para factura/recibo solo se insertan si existen filas en esas tablas.
-- =============================================================================

-- Función updated_at (idempotente con otros scripts Copilot)
create or replace function public.copilot_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tabla
-- -----------------------------------------------------------------------------
create table if not exists public.proto_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null,
  related_table text not null,
  related_id uuid not null,
  file_name text,
  file_url text,
  mime_type text,
  reference text,
  issue_date date,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.proto_documents is
  'Respaldo documental: metadatos y URL de archivo vinculados a filas de otras tablas.';

comment on column public.proto_documents.document_type is
  'Tipo lógico: factura_pdf, recibo, comprobante_pago_fiscal, dj_fiscal, etc.';

comment on column public.proto_documents.related_table is
  'Tabla referenciada: proto_invoices, proto_receipts, proto_tax_payments, proto_tax_obligations, …';

comment on column public.proto_documents.related_id is
  'UUID de la fila en related_table.';

comment on column public.proto_documents.file_url is
  'URL pública o firmada; la subida de archivos no forma parte de este script.';

comment on column public.proto_documents.status is
  'Estado del registro documental (ej. active, archived).';

-- Índices
create index if not exists proto_documents_related_idx
  on public.proto_documents (related_table, related_id);

create index if not exists proto_documents_type_idx
  on public.proto_documents (document_type);

create index if not exists proto_documents_issue_date_idx
  on public.proto_documents (issue_date desc nulls last);

create index if not exists proto_documents_status_idx
  on public.proto_documents (status);

-- Trigger updated_at
drop trigger if exists trg_proto_documents_updated on public.proto_documents;
create trigger trg_proto_documents_updated
  before update on public.proto_documents
  for each row execute function public.copilot_set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS prototipo (abierta)
-- -----------------------------------------------------------------------------
alter table public.proto_documents enable row level security;

drop policy if exists "proto_documents_all" on public.proto_documents;
create policy "proto_documents_all"
  on public.proto_documents
  for all
  using (true)
  with check (true);

-- -----------------------------------------------------------------------------
-- Seed ficticio (IDs fijos de documentos; ON CONFLICT no duplica)
-- -----------------------------------------------------------------------------
-- 1) Factura PDF → primera proto_invoices por fecha de creación (si existe)
insert into public.proto_documents (
  id,
  document_type,
  related_table,
  related_id,
  file_name,
  file_url,
  mime_type,
  reference,
  issue_date,
  status,
  notes
)
select
  'c0000001-0000-4000-8000-000000000001'::uuid,
  'factura_pdf',
  'proto_invoices',
  i.id,
  'Factura venta prototipo.pdf',
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
  'application/pdf',
  'FAC-PROTO-001',
  (current_date - 10),
  'active',
  'Ejemplo seed: PDF vinculado a una factura existente.'
from public.proto_invoices i
order by i.id desc
limit 1
on conflict (id) do nothing;

-- 2) Recibo → primera proto_receipts (si existe)
insert into public.proto_documents (
  id,
  document_type,
  related_table,
  related_id,
  file_name,
  file_url,
  mime_type,
  reference,
  issue_date,
  status,
  notes
)
select
  'c0000002-0000-4000-8000-000000000002'::uuid,
  'recibo_cobro',
  'proto_receipts',
  r.id,
  'Recibo de cobro prototipo.pdf',
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
  'application/pdf',
  'REC-PROTO-001',
  (current_date - 3),
  'active',
  'Ejemplo seed: comprobante de cobro vinculado a un recibo existente.'
from public.proto_receipts r
order by r.id desc
limit 1
on conflict (id) do nothing;

-- 3) Comprobante de pago fiscal → mismo id que seed extend-proto-tax-layer (pago parcial IVA)
insert into public.proto_documents (
  id,
  document_type,
  related_table,
  related_id,
  file_name,
  file_url,
  mime_type,
  reference,
  issue_date,
  status,
  notes
) values (
  'c0000003-0000-4000-8000-000000000003'::uuid,
  'comprobante_pago_fiscal',
  'proto_tax_payments',
  'b0000001-0000-4000-8000-000000000001'::uuid,
  'Comprobante transferencia IVA marzo.pdf',
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
  'application/pdf',
  'TRF-IVA-2026-03-001',
  '2026-03-28',
  'active',
  'Ejemplo seed: soporte del pago fiscal (alineado a proto_tax_payments seed).'
)
on conflict (id) do nothing;

-- 4) DJ / soporte → obligación IVA marzo (mismo id seed tax layer)
insert into public.proto_documents (
  id,
  document_type,
  related_table,
  related_id,
  file_name,
  file_url,
  mime_type,
  reference,
  issue_date,
  status,
  notes
) values (
  'c0000004-0000-4000-8000-000000000004'::uuid,
  'dj_fiscal',
  'proto_tax_obligations',
  'a0000001-0000-4000-8000-000000000001'::uuid,
  'Declaración jurada IVA marzo (soporte).pdf',
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
  'application/pdf',
  'DJ-IVA-2026-03',
  '2026-04-01',
  'active',
  'Ejemplo seed: soporte presentación vinculado a proto_tax_obligations.'
)
on conflict (id) do nothing;
