-- Outcomes: resultado por acción (una fila por action_id).
-- Ejecutar en el SQL Editor de Supabase.

create table if not exists outcomes (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references actions (id) on delete cascade,
  initiative_id uuid not null references initiatives (id) on delete cascade,
  outcome_type text not null,
  outcome_category text not null,
  revenue_amount numeric(18, 2),
  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists outcomes_action_id_uidx on outcomes (action_id);

create index if not exists outcomes_initiative_id_idx on outcomes (initiative_id);

comment on table outcomes is 'Resultado registrado por acción (cierre de loop Copilot).';
