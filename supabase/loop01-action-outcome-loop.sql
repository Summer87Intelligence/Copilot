-- LOOP-01 — Loop mínimo insight → acción → resultado (B2B, multi-tenant).
-- Ejecutar en el SQL Editor de Supabase después de revisar entorno.
-- Extiende `actions` y `outcomes` sin nuevas tablas.

alter table public.actions
  add column if not exists assignee_name text,
  add column if not exists expected_result text,
  add column if not exists before_note text,
  add column if not exists updated_at timestamptz not null default now();

comment on column public.actions.assignee_name is 'Responsable humano (texto libre; LOOP-01).';
comment on column public.actions.expected_result is 'Resultado esperado al cerrar la acción.';
comment on column public.actions.before_note is 'Contexto o lectura “antes” (texto breve).';
comment on column public.actions.updated_at is 'Última actualización de la fila (seguimiento o estado).';

alter table public.outcomes
  add column if not exists after_note text;

comment on column public.outcomes.after_note is 'Lectura “después” al registrar resultado (complementa notes).';
