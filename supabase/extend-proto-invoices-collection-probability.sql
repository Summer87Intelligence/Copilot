-- Probabilidad de cobro por factura (motor de cobertura en Inicio).
-- Ejecutar en el SQL Editor de Supabase sobre el esquema que ya tenga public.proto_invoices.

alter table public.proto_invoices
  add column if not exists collection_probability numeric(14, 6);

comment on column public.proto_invoices.collection_probability is
  'Probabilidad 0–1 de cobrar el saldo (0–100 también aceptado en app; motor normaliza). Usada en balance × collection_probability.';

-- Valor neutro para filas existentes (coherente con default del motor en código).
update public.proto_invoices
set collection_probability = 0.6
where collection_probability is null
  and coalesce(balance_amount, 0) > 0;
