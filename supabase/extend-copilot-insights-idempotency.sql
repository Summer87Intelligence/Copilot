-- Summer87 Copilot: idempotencia en copilot_insights (evitar duplicados al re-ejecutar persistencia)
-- Prerrequisito: public.copilot_insights creada (create-copilot-insights.sql).
-- Ejecutar en Supabase SQL Editor.

alter table public.copilot_insights
  add column if not exists insight_hash text;

-- Filas previas sin hash: clave estable única por id para no bloquear el NOT NULL.
update public.copilot_insights
set insight_hash = 'legacy_' || id::text
where insight_hash is null;

alter table public.copilot_insights
  alter column insight_hash set not null;

create unique index if not exists uq_copilot_insights_insight_hash
  on public.copilot_insights (insight_hash);
