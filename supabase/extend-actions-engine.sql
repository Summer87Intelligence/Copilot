-- Action Engine: tabla actions (si aún no existe).
-- Ejecutar en el SQL Editor de Supabase.

create table if not exists actions (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references decisions (id) on delete cascade,
  initiative_id uuid not null references initiatives (id) on delete cascade,
  action_type text not null,
  channel text not null,
  execution_status text not null default 'pending',
  action_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists actions_decision_id_uidx on actions (decision_id);

create index if not exists actions_created_at_idx on actions (created_at desc);

comment on table actions is 'Acciones generadas desde decisions (Action Engine).';
