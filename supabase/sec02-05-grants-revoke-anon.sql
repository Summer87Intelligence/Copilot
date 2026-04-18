-- =============================================================================
-- SEC-02 — Paso 5: grants — quitar acceso `anon` y fijar privilegios `authenticated`
-- =============================================================================
-- Ejecución: manual, después de sec02-01 … sec02-04.
-- Idempotente: solo actúa si la tabla existe (proyectos en distinto orden de creación).
-- Rollback orientativo: si hubo error previo, revisar primero políticas/triggers (sec02-02…04)
-- antes de reintentar grants; este archivo no altera esquema, solo privilegios a roles.
--
-- Criterio conservador:
--   - `app_users` / `companies`: solo SELECT vía JWT (mutaciones vía service_role / flujos admin).
--   - Resto operativo Copilot: SELECT + escritura para `authenticated`.
-- =============================================================================

do $$
declare
  t text;
  operational text[] := array[
    'dashboard_snapshots',
    'copilot_insights',
    'proto_companies',
    'proto_contacts',
    'proto_invoices',
    'proto_receipts',
    'proto_payments',
    'proto_tax_obligations',
    'proto_tax_payments',
    'proto_documents',
    'zeta_sync_runs',
    'zeta_sync_state',
    'zeta_sync_raw_payloads',
    'initiatives',
    'decisions',
    'actions',
    'outcomes'
  ];
  readonly text[] := array['app_users', 'companies'];
begin
  foreach t in array readonly loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
      execute format('revoke all on table public.%I from anon', t);
      execute format('revoke all on table public.%I from authenticated', t);
      execute format('grant select on table public.%I to authenticated', t);
    end if;
  end loop;

  foreach t in array operational loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
      execute format('revoke all on table public.%I from anon', t);
      execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    end if;
  end loop;
end;
$$;
