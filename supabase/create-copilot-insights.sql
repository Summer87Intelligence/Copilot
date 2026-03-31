-- Summer87 Copilot: persistencia de insights generados por el engine
-- Prerrequisito: public.companies y public.dashboard_snapshots.
-- Ejecutar en Supabase SQL Editor.

create table if not exists public.copilot_insights (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  snapshot_id uuid references public.dashboard_snapshots (id) on delete set null,
  type text not null,
  title text not null,
  description text not null,
  priority text not null,
  insight_hash text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_copilot_insights_insight_hash
  on public.copilot_insights (insight_hash);

create index if not exists idx_copilot_insights_company_id
  on public.copilot_insights (company_id);

create index if not exists idx_copilot_insights_snapshot_id
  on public.copilot_insights (snapshot_id);

-- RLS: no habilitado en esta versión. En producción, habilitar row level security
-- y definir políticas por company_id / auth.uid() según el modelo de acceso.
