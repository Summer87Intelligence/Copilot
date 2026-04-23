-- Validación mínima post import 2026 (tenant actual)
-- Nota: ejecutar con sesión/rol que vea solo el workspace objetivo o agregar filtro explícito.

-- 1) Conteo mensual 2026 en `proto_invoices` para facturas Zeta por cliente
select
  to_char(date_trunc('month', issue_date::date), 'YYYY-MM') as month_ym,
  count(*) as invoices_count
from public.proto_invoices
where category = 'Zeta / comprobantes por cliente'
  and issue_date >= '2026-01-01'
  and issue_date < '2027-01-01'
  and is_active = true
group by 1
order by 1;

-- 2) Muestra operativa de facturas 2026 (número negocio desde `notes`)
-- `notes` del pipeline: zeta_vouchers:{sync_run}|{ComprobanteCodigo}|{Serie}-{Numero}
select
  id,
  issue_date,
  invoice_number,
  split_part(coalesce(notes, ''), '|', 3) as numero_negocio,
  total_amount,
  balance_amount,
  category,
  is_active,
  notes
from public.proto_invoices
where category = 'Zeta / comprobantes por cliente'
  and issue_date >= '2026-01-01'
  and issue_date < '2027-01-01'
  and is_active = true
order by issue_date desc
limit 120;

-- 3) Sanidad de identidad: no debería haber duplicados por invoice_number activo (en el tenant visible)
select
  invoice_number,
  count(*) as qty
from public.proto_invoices
where category = 'Zeta / comprobantes por cliente'
  and issue_date >= '2026-01-01'
  and issue_date < '2027-01-01'
  and is_active = true
group by invoice_number
having count(*) > 1
order by qty desc, invoice_number;

-- 4) (Opcional) Duplicados por número de negocio derivado de notes (`Serie-Numero`)
-- Útil para detectar colisiones lógicas aunque invoice_number técnico sea distinto.
select
  split_part(coalesce(notes, ''), '|', 3) as numero_negocio,
  count(*) as qty
from public.proto_invoices
where category = 'Zeta / comprobantes por cliente'
  and issue_date >= '2026-01-01'
  and issue_date < '2027-01-01'
  and is_active = true
  and split_part(coalesce(notes, ''), '|', 3) <> ''
group by split_part(coalesce(notes, ''), '|', 3)
having count(*) > 1
order by qty desc, numero_negocio;

