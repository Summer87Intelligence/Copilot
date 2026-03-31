-- Summer87 Copilot: snapshots por empresa demo (dashboard multi-tenant)
-- Prerrequisito: public.companies con slug 'summer87-demo' y tabla dashboard_snapshots
--   con company_id (extend-multi-tenant.sql + init-dashboard.sql).
-- Ejecutar en Supabase SQL Editor.
--
-- Nota: el frontend usa escenarios en inglés: 'risk', 'stable', 'growth'
-- (equivalente a riesgo / estable en negocio).

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
  v.scenario,
  v.cash_available,
  v.monthly_sales,
  v.pending_collections,
  v.monthly_expenses,
  v.cash_risk_days,
  v.top_clients_concentration,
  v.expenses_growth_percent,
  now()
from public.companies c
cross join lateral (
  values
    -- Riesgo: revenue 12k, expenses 15k, cash 2k (resto coherente con el modelo del dashboard)
    (
      'risk'::text,
      2000::numeric,
      12000::numeric,
      6500::numeric,
      15000::numeric,
      10::numeric,
      72::numeric,
      19::numeric
    ),
    -- Estable: revenue 20k, expenses 12k, cash 8k
    (
      'stable'::text,
      8000::numeric,
      20000::numeric,
      3500::numeric,
      12000::numeric,
      55::numeric,
      30::numeric,
      4::numeric
    )
) as v (
  scenario,
  cash_available,
  monthly_sales,
  pending_collections,
  monthly_expenses,
  cash_risk_days,
  top_clients_concentration,
  expenses_growth_percent
)
where c.slug = 'summer87-demo'
  and not exists (
    select 1
    from public.dashboard_snapshots ds
    where ds.company_id = c.id
      and ds.scenario = v.scenario
  );
