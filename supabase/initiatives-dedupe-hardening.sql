-- Idempotencia fuerte: columna de día local + limpieza histórica + índice único.
-- Ejecutar en el SQL Editor de Supabase (proyecto con tabla public.initiatives ya creada).

-- -----------------------------------------------------------------------------
-- A) Columna: día calendario Montevideo para deduplicación (materializado)
-- -----------------------------------------------------------------------------
alter table public.initiatives
  add column if not exists dedupe_local_date date;

comment on column public.initiatives.dedupe_local_date is
  'Día civil en America/Montevideo derivado de created_at (backfill) o fijado en inserción; parte de la clave única lógica.';

-- -----------------------------------------------------------------------------
-- B) Backfill desde created_at → fecha local Montevideo
-- -----------------------------------------------------------------------------
update public.initiatives
set dedupe_local_date = (created_at at time zone 'America/Montevideo')::date
where dedupe_local_date is null;

-- Si alguna fila no tuviera created_at (no debería), evitar NULL antes del NOT NULL:
update public.initiatives
set dedupe_local_date = (now() at time zone 'America/Montevideo')::date
where dedupe_local_date is null;

-- -----------------------------------------------------------------------------
-- C) Duplicados históricos: conservar una sola fila por (company_name, source, trigger, dedupe_local_date)
-- Regla explícita: se mantiene la fila con menor id (orden lexicográfico de uuid: b.id < a.id).
-- (NOT IN (subquery vacío) borraría todo; EXISTS evita ese caso.)
-- -----------------------------------------------------------------------------
delete from public.initiatives a
where exists (
  select 1
  from public.initiatives b
  where b.company_name = a.company_name
    and b.source = a.source
    and b.trigger = a.trigger
    and b.dedupe_local_date = a.dedupe_local_date
    and b.id < a.id
);

-- -----------------------------------------------------------------------------
-- Integridad: dedupe_local_date obligatorio para el índice único
-- -----------------------------------------------------------------------------
alter table public.initiatives
  alter column dedupe_local_date set not null;

-- -----------------------------------------------------------------------------
-- D) Restricción única real (concurrencia + consistencia con app)
-- -----------------------------------------------------------------------------
create unique index if not exists initiatives_company_source_trigger_dedupe_day_uniq
  on public.initiatives (company_name, source, trigger, dedupe_local_date);
