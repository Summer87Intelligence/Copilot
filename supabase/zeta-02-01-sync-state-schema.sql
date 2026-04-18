-- =============================================================================
-- ZETA-02 — Paso 1: esquema (tablas, FKs, índices, constraints)
-- =============================================================================
-- Prerrequisitos: `public.companies` existe (TEN/SEC).
-- Orden manual recomendado:
--   1) Este archivo (zeta-02-01-sync-state-schema.sql)
--   2) zeta-02-02-sync-state-rls.sql
--   3) Opcional: re-ejecutar sec02-05-grants-revoke-anon.sql (incluye ya estas tablas)
--
-- Modelo: corrida (`zeta_sync_runs`), estado por recurso (`zeta_sync_state`),
-- staging raw por corrida (`zeta_sync_raw_payloads`). Tenant = `company_id`
-- → `public.companies.id` (mismo criterio que `dashboard_snapshots`).
-- Sin secretos en columnas; `payload_json` solo datos de respuesta Zeta (no API keys).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) Corridas de sincronización (trazabilidad por `id` = sync_run_id)
-- ---------------------------------------------------------------------------
create table if not exists public.zeta_sync_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  resource_flow text not null,
  sync_mode text not null,
  status text not null default 'pending',
  overlap_from timestamptz,
  overlap_to timestamptz,
  records_fetched integer,
  records_processed integer,
  error_summary text,
  error_code text,
  idempotency_key text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint zeta_sync_runs_resource_flow_nonempty
    check (char_length(trim(both from resource_flow)) between 1 and 200),
  constraint zeta_sync_runs_sync_mode_chk
    check (sync_mode in ('bootstrap', 'incremental')),
  constraint zeta_sync_runs_status_chk
    check (status in ('pending', 'running', 'succeeded', 'failed', 'partial', 'cancelled')),
  constraint zeta_sync_runs_records_fetched_nonneg
    check (records_fetched is null or records_fetched >= 0),
  constraint zeta_sync_runs_records_processed_nonneg
    check (records_processed is null or records_processed >= 0),
  constraint zeta_sync_runs_overlap_window_chk
    check (
      (overlap_from is null and overlap_to is null)
      or (overlap_from is not null and overlap_to is not null and overlap_to >= overlap_from)
    )
);

create index if not exists idx_zeta_sync_runs_company_resource_started
  on public.zeta_sync_runs (company_id, resource_flow, started_at desc);

create index if not exists idx_zeta_sync_runs_company_status_started
  on public.zeta_sync_runs (company_id, status, started_at desc);

create unique index if not exists idx_zeta_sync_runs_idempotency
  on public.zeta_sync_runs (company_id, resource_flow, idempotency_key)
  where idempotency_key is not null;

comment on table public.zeta_sync_runs is
  'ZETA-02: corrida de sync Zeta por tenant y recurso; trazabilidad vía id (sync_run_id).';
comment on column public.zeta_sync_runs.resource_flow is
  'Identificador estable del flujo/recurso (ej. factura_cliente_saldos_pendientes).';
comment on column public.zeta_sync_runs.overlap_from is
  'Ventana incremental con solapamiento: inicio inclusive (si aplica).';
comment on column public.zeta_sync_runs.overlap_to is
  'Ventana incremental con solapamiento: fin inclusive (si aplica).';

-- ---------------------------------------------------------------------------
-- B) Estado actual por recurso (watermark, última sync OK, bootstrap)
-- ---------------------------------------------------------------------------
create table if not exists public.zeta_sync_state (
  company_id uuid not null references public.companies (id) on delete cascade,
  resource_flow text not null,
  watermark text not null default '',
  watermark_type text not null default 'opaque',
  overlap_seconds integer,
  bootstrap_completed boolean not null default false,
  last_success_at timestamptz,
  last_success_run_id uuid references public.zeta_sync_runs (id) on delete set null,
  last_run_id uuid references public.zeta_sync_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, resource_flow),
  constraint zeta_sync_state_resource_flow_nonempty
    check (char_length(trim(both from resource_flow)) between 1 and 200),
  constraint zeta_sync_state_watermark_type_chk
    check (watermark_type in ('opaque', 'cursor', 'timestamp', 'page')),
  constraint zeta_sync_state_overlap_seconds_nonneg
    check (overlap_seconds is null or overlap_seconds >= 0)
);

create index if not exists idx_zeta_sync_state_company_updated
  on public.zeta_sync_state (company_id, updated_at desc);

comment on table public.zeta_sync_state is
  'ZETA-02: una fila por (tenant, resource_flow); watermark y última corrida exitosa.';
comment on column public.zeta_sync_state.watermark is
  'Cursor opaco para incremental (no mezclar secretos; serialización acordada por recurso).';

-- ---------------------------------------------------------------------------
-- C) Staging raw por corrida (troubleshooting, no data lake)
-- ---------------------------------------------------------------------------
create table if not exists public.zeta_sync_raw_payloads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  sync_run_id uuid not null references public.zeta_sync_runs (id) on delete cascade,
  resource_flow text not null,
  chunk_index integer not null default 0,
  zeta_operation text not null,
  http_status integer,
  payload_json jsonb not null,
  request_fingerprint text,
  received_at timestamptz not null default now(),
  constraint zeta_sync_raw_resource_flow_nonempty
    check (char_length(trim(both from resource_flow)) between 1 and 200),
  constraint zeta_sync_raw_chunk_index_nonneg check (chunk_index >= 0),
  constraint zeta_sync_raw_zeta_operation_nonempty
    check (char_length(trim(both from zeta_operation)) between 1 and 200),
  constraint zeta_sync_raw_unique_chunk unique (sync_run_id, chunk_index, zeta_operation)
);

create index if not exists idx_zeta_sync_raw_company_received
  on public.zeta_sync_raw_payloads (company_id, received_at desc);

create index if not exists idx_zeta_sync_raw_run
  on public.zeta_sync_raw_payloads (sync_run_id);

comment on table public.zeta_sync_raw_payloads is
  'ZETA-02: chunk de respuesta Zeta ligado a sync_run_id; dedupe por (run, chunk, operation).';
comment on column public.zeta_sync_raw_payloads.request_fingerprint is
  'Hash o id estable del request (sin tokens); opcional para diagnóstico.';
