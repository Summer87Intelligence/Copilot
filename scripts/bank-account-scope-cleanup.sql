-- BANK-ACCOUNT-SCOPE-EASY-ONLY-001 — Limpieza de movimientos de cuentas bloqueadas
-- ============================================================================
-- ⚠️  NO EJECUTAR SIN APROBACIÓN EXPLÍCITA. Esto BORRA datos de producción.
--     Correr primero SOLO la Sección A (read-only) y validar los conteos.
--     Recién con OK, correr la Sección B dentro de la transacción.
-- ============================================================================
--
-- Contexto: se importó por error un Excel consolidado de la cuenta PERSONAL de
-- Daniel (Santander 005205831977 USD, 471 movimientos). Banco solo debe conservar
-- cuentas de EASY (1211749, 5101107711). Los movimientos bloqueados están todos
-- en status 'pending' (0 conciliados, 0 sugerencias, 0 tareas). La única FK
-- (bank_movement_match_suggestions.bank_movement_id) es ON DELETE CASCADE.
--
-- Cuentas bloqueadas (con y sin ceros iniciales):
--   005205831977 / 5205831977
--   001205667098 / 1205667098

-- ─────────────────────────────────────────────────────────────────────────────
-- SECCIÓN A — PREVIEW READ-ONLY (correr y validar ANTES de borrar)
-- ─────────────────────────────────────────────────────────────────────────────

-- A1. Conteo de movimientos bloqueados.
select count(*) as blocked_movements
from public.bank_movements
where account_label ilike '%005205831977%'
   or account_label ilike '%001205667098%'
   or account_label ilike '%5205831977%'
   or account_label ilike '%1205667098%'
   or metadata::text ilike '%005205831977%'
   or metadata::text ilike '%001205667098%'
   or metadata::text ilike '%5205831977%'
   or metadata::text ilike '%1205667098%';

-- A2. Detalle de los movimientos a borrar.
select id, import_id, movement_date, account_label, description, amount, currency,
       direction, status, metadata
from public.bank_movements
where account_label ilike '%005205831977%'
   or account_label ilike '%001205667098%'
   or account_label ilike '%5205831977%'
   or account_label ilike '%1205667098%'
   or metadata::text ilike '%005205831977%'
   or metadata::text ilike '%001205667098%'
   or metadata::text ilike '%5205831977%'
   or metadata::text ilike '%1205667098%'
order by movement_date desc;

-- A3. Imports afectados: ¿son 100% bloqueados o mixtos?
--     Solo se borran los imports que quedan con 0 movimientos (100% bloqueados).
select
  bm.import_id,
  si.file_name,
  si.account_label as import_account_label,
  count(*) as total_movements,
  count(*) filter (
    where bm.account_label ilike '%005205831977%'
       or bm.account_label ilike '%001205667098%'
       or bm.account_label ilike '%5205831977%'
       or bm.account_label ilike '%1205667098%'
       or bm.metadata::text ilike '%005205831977%'
       or bm.metadata::text ilike '%001205667098%'
  ) as blocked_movements
from public.bank_movements bm
left join public.bank_statement_imports si on si.id = bm.import_id
group by bm.import_id, si.file_name, si.account_label
order by blocked_movements desc;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECCIÓN B — BORRADO (solo tras aprobar los conteos de la Sección A)
-- Ejecutar TODO junto. Si algún conteo no cuadra, hacer ROLLBACK.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- B1. Borrar movimientos de cuentas bloqueadas.
--     Cascade elimina automáticamente sus filas en bank_movement_match_suggestions.
DELETE FROM public.bank_movements
where account_label ilike '%005205831977%'
   or account_label ilike '%001205667098%'
   or account_label ilike '%5205831977%'
   or account_label ilike '%1205667098%'
   or metadata::text ilike '%005205831977%'
   or metadata::text ilike '%001205667098%'
   or metadata::text ilike '%5205831977%'
   or metadata::text ilike '%1205667098%';

-- B2. Borrar imports que quedaron SIN movimientos (eran 100% cuenta bloqueada).
--     Los imports mixtos con movimientos EASY restantes NO se tocan.
DELETE FROM public.bank_statement_imports si
where not exists (
  select 1 from public.bank_movements bm where bm.import_id = si.id
)
and (
  si.account_label ilike '%005205831977%'
  or si.account_label ilike '%001205667098%'
  or si.account_label ilike '%5205831977%'
  or si.account_label ilike '%1205667098%'
  or si.metadata::text ilike '%005205831977%'
  or si.metadata::text ilike '%001205667098%'
);

-- B3. Verificación post-borrado (debe dar 0). Revisar antes del COMMIT.
select count(*) as remaining_blocked
from public.bank_movements
where account_label ilike '%005205831977%'
   or account_label ilike '%001205667098%'
   or account_label ilike '%5205831977%'
   or account_label ilike '%1205667098%';

-- Si remaining_blocked = 0 y el resto luce bien:
COMMIT;
-- En caso de duda:
-- ROLLBACK;
