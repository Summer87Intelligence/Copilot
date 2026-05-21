-- =============================================================================
-- ZETA-12 — Extensiones recurrentes + anti-duplicación en obligaciones
-- =============================================================================
-- Reutiliza `planned_cash_obligation_templates` como reglas recurrentes.
-- Prerrequisitos: zeta-11-04, zeta-12-01.
-- Idempotente. No destructivo.
-- =============================================================================

alter table public.planned_cash_obligation_templates
  add column if not exists direction text not null default 'expense'
    check (direction in ('income', 'expense'));

alter table public.planned_cash_obligation_templates
  add column if not exists starts_on date;

alter table public.planned_cash_obligation_templates
  add column if not exists ends_on date;

alter table public.planned_cash_obligation_templates
  add column if not exists day_of_month integer
    check (day_of_month is null or (day_of_month >= 1 and day_of_month <= 31));

update public.planned_cash_obligation_templates
set starts_on = coalesce(starts_on, next_occurrence_date)
where starts_on is null;

alter table public.planned_cash_obligations
  add column if not exists recurring_template_id uuid
    references public.planned_cash_obligation_templates (id) on delete set null;

alter table public.planned_cash_obligations
  add column if not exists recurring_instance_key text;

create unique index if not exists idx_planned_cash_obligations_recurring_instance
  on public.planned_cash_obligations (workspace_id, recurring_instance_key)
  where recurring_instance_key is not null;

create index if not exists idx_planned_cash_obligations_recurring_template
  on public.planned_cash_obligations (workspace_id, recurring_template_id)
  where recurring_template_id is not null;

comment on column public.planned_cash_obligation_templates.direction is
  'income = ingreso recurrente; expense = egreso recurrente (Netflix, sueldos, etc.).';

comment on column public.planned_cash_obligations.recurring_instance_key is
  'Clave idempotente `${template_id}:${due_date}` para no duplicar instancias mensuales.';
