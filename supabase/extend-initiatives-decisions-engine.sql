-- Decision Engine: columna de pipeline en initiatives y tabla decisions.
-- Ejecutar en el SQL Editor de Supabase si aún no existen.

alter table initiatives
  add column if not exists processing_stage text default 'new';

update initiatives
set processing_stage = 'new'
where processing_stage is null;

comment on column initiatives.processing_stage is
  'Pipeline: new → decision_made (extensible).';

create table if not exists decisions (
  id uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references initiatives (id) on delete cascade,
  decision_type text not null,
  recommended_channel text not null,
  priority_rank int not null,
  confidence_score numeric not null,
  suggested_message text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists decisions_initiative_id_uidx on decisions (initiative_id);
