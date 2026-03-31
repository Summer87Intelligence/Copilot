-- Summer87 Copilot: snapshots históricos adicionales (tendencias reales)
-- Prerrequisito: filas vigentes en dashboard_snapshots para risk y stable
--   (seed-dashboard-snapshots.sql u otra carga) con company_id de summer87-demo.
-- Ejecutar en Supabase SQL Editor. Idempotente: solo inserta si hay exactamente 1 fila por escenario.
--
-- La fecha del histórico queda 7 días antes del created_at más antiguo de ese
-- escenario, así el vigente sigue siendo el más reciente en ORDER BY created_at DESC.

-- Riesgo: pasado “mejor” (más ventas, más caja, menos gastos, más días de margen)
--        vs el snapshot actual del seed (peor situación actual).
insert into public.dashboard_snapshots (
  company_id,
  scenario,
  cash_available,
  monthly_sales,
  pending_collections,
  monthly_expenses,
  cash_risk_days,
  top_clients_concentration,
  expenses_growth_percent,
  created_at
)
select
  c.id,
  'risk'::text,
  5500::numeric,
  18000::numeric,
  4200::numeric,
  12000::numeric,
  24::numeric,
  52::numeric,
  7::numeric,
  (select min(ds.created_at) - interval '7 days'
   from public.dashboard_snapshots ds
   where ds.company_id = c.id
     and ds.scenario = 'risk')
from public.companies c
where c.slug = 'summer87-demo'
  and (select count(*)::int
       from public.dashboard_snapshots ds0
       where ds0.company_id = c.id
         and ds0.scenario = 'risk') = 1;

-- Estable: pasado un poco más débil; el vigente del seed muestra mejora
insert into public.dashboard_snapshots (
  company_id,
  scenario,
  cash_available,
  monthly_sales,
  pending_collections,
  monthly_expenses,
  cash_risk_days,
  top_clients_concentration,
  expenses_growth_percent,
  created_at
)
select
  c.id,
  'stable'::text,
  5200::numeric,
  16800::numeric,
  4200::numeric,
  11800::numeric,
  46::numeric,
  38::numeric,
  5::numeric,
  (select min(ds.created_at) - interval '7 days'
   from public.dashboard_snapshots ds
   where ds.company_id = c.id
     and ds.scenario = 'stable')
from public.companies c
where c.slug = 'summer87-demo'
  and (select count(*)::int
       from public.dashboard_snapshots ds0
       where ds0.company_id = c.id
         and ds0.scenario = 'stable') = 1;
