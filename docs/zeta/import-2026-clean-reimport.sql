-- Limpieza segura + reimport recomendado para corregir fechas 2026 mal parseadas en facturas Zeta
-- Alcance: SOLO `category = 'Zeta / comprobantes por cliente'` y issue_date en 2026.
-- No toca empresas/contactos ni otros pipelines.

begin;

-- 0) Preview de impacto
select
  count(*) as rows_target_2026
from public.proto_invoices
where category = 'Zeta / comprobantes por cliente'
  and issue_date >= '2026-01-01'
  and issue_date < '2027-01-01';

-- 1) Si hay recibos enlazados a estas facturas, desvincular para evitar bloqueo por FK
update public.proto_receipts r
set invoice_id = null
where r.invoice_id in (
  select i.id
  from public.proto_invoices i
  where i.category = 'Zeta / comprobantes por cliente'
    and i.issue_date >= '2026-01-01'
    and i.issue_date < '2027-01-01'
);

-- 2) Borrar SOLO facturas Zeta 2026 (para reimportarlas con fecha correcta)
delete from public.proto_invoices i
where i.category = 'Zeta / comprobantes por cliente'
  and i.issue_date >= '2026-01-01'
  and i.issue_date < '2027-01-01';

commit;

-- Reimport recomendado luego del fix:
-- npm run zeta:import-2026

