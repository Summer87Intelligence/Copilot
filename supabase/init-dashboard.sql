-- Summer87 Copilot: dashboard_snapshots
-- Ejecutar en Supabase SQL Editor (no se ejecuta desde el repo).

create table if not exists public.dashboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  scenario text not null,
  cash_available numeric,
  monthly_sales numeric,
  pending_collections numeric,
  monthly_expenses numeric,
  cash_risk_days numeric,
  top_clients_concentration numeric,
  expenses_growth_percent numeric,
  created_at timestamp not null default now()
);

alter table public.dashboard_snapshots enable row level security;

create policy "Allow read access"
  on public.dashboard_snapshots
  for select
  using (true);

insert into public.dashboard_snapshots (
  scenario,
  cash_available,
  monthly_sales,
  pending_collections,
  monthly_expenses,
  cash_risk_days,
  top_clients_concentration,
  expenses_growth_percent
)
values
  ('risk', 120000, 500000, 200000, 450000, 10, 70, 20),
  ('stable', 400000, 600000, 80000, 300000, 45, 40, 8),
  ('growth', 300000, 620000, 235000, 350000, 25, 50, 12);
