-- =============================================================================
-- ZETA-08-01 — `proto_invoice_installments` (cuotas pendientes desde Zeta)
-- =============================================================================
-- Propósito:
--   Persistir vencimiento REAL por cuota proveniente de
--   `RESTCuotasV1QueryCliente` (validado live 2026-05-11; ver DIV-CONT-009
--   RESUELTO en `docs/vendors/z/KNOWN-DIVERGENCES.md`).
--
--   Cada fila representa una cuota de una factura cliente:
--     - `zeta_registro_id` → linkea con `proto_invoices.zeta_metadata.zeta_customer_voucher_v1.zeta_registro_id`
--     - `cuota_numero` → 1..N por factura.
--     - `cuota_vencimiento` → fecha REAL emitida por Zeta.
--     - `cuota_saldo` / `cuota_total` → importes.
--     - `currency_code` → "UYU" | "USD" | null (mapeado desde `MonedaCodigo`).
--
-- Idempotente (mismo patrón que el resto de migraciones zeta-*).
--
-- NO toca:
--   - proto_invoices (su `due_date` sintético se migra recién en `zeta-08-02`).
--   - sync existente.
--   - cron.
-- =============================================================================

do $zeta0801$
begin
  if to_regclass('public.proto_invoice_installments') is not null then
    raise notice 'zeta-08-01: public.proto_invoice_installments ya existe; omitido';
    return;
  end if;

  create table public.proto_invoice_installments (
    id uuid primary key default gen_random_uuid(),
    -- Tenant SaaS (alineado con resto de proto_*; trigger fail-closed lo fuerza)
    workspace_company_id uuid not null
      references public.companies (id) on delete restrict,
    -- Linkable a la factura local cuando RegistroId matchea. Nullable: si la
    -- factura aún no fue sincronizada, la cuota queda "huérfana" y se vuelve
    -- a intentar el match en cada corrida del pipeline. NO impide upsertear.
    invoice_id uuid null
      references public.proto_invoices (id) on delete set null,
    -- Identidad estable Zeta (linkea con
    -- `proto_invoices.zeta_metadata.zeta_customer_voucher_v1.zeta_registro_id`
    -- y con la fila de `RESTFacturaClienteV4QuerySaldosPendientes`).
    zeta_registro_id text not null,
    -- Código del cliente Zeta (para auditoría; el invoice_id ya resuelve cliente).
    cliente_codigo text not null,
    -- Número de cuota (1..N). UNIQUE con (workspace, registro_id) abajo.
    cuota_numero integer not null check (cuota_numero >= 1),
    -- Importes con 5 decimales (Zeta a veces emite "678.32000"); se redondean
    -- en lectura UI según necesidad. numeric(18,5) permite saldos altos UYU.
    cuota_total numeric(18, 5) null,
    cuota_saldo numeric(18, 5) null,
    -- Fecha REAL de vencimiento. NOT NULL: el mapper rechaza filas sin fecha.
    cuota_vencimiento date not null,
    -- Numérico Zeta (1=UYU, 2=USD; 0/otros = null). Util para auditoría.
    moneda_codigo integer null,
    -- "UYU" | "USD" | null (consistencia con `proto_invoices.currency_code`).
    currency_code text null check (currency_code in ('UYU', 'USD') or currency_code is null),
    -- "S"/"N" o boolean del payload Zeta; null si Zeta no informa.
    es_entrega_inicial boolean null,
    -- Payload completo de la fila Zeta (auditoría / troubleshooting de mapeo).
    raw_payload jsonb null,
    -- Última corrida que escribió esta fila (telemetría; se actualiza en upsert).
    synced_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  -- UNIQUE: (workspace, registro_id, cuota_numero) garantiza idempotencia del
  -- upsert. NO incluimos `invoice_id` en la clave porque el match puede
  -- demorar (cuota sincronizada antes que la factura).
  alter table public.proto_invoice_installments
    add constraint uq_proto_invoice_installments_ws_registro_cuota
    unique (workspace_company_id, zeta_registro_id, cuota_numero);

  -- Índices
  create index idx_proto_invoice_installments_workspace
    on public.proto_invoice_installments (workspace_company_id);

  create index idx_proto_invoice_installments_invoice
    on public.proto_invoice_installments (invoice_id)
    where invoice_id is not null;

  -- Aging / "Vencimiento de Cuotas" lookup por fecha.
  create index idx_proto_invoice_installments_vencimiento
    on public.proto_invoice_installments (workspace_company_id, cuota_vencimiento);

  -- "Cuotas pendientes" lookup por saldo > 0.
  create index idx_proto_invoice_installments_saldo
    on public.proto_invoice_installments (workspace_company_id, cuota_saldo)
    where cuota_saldo is not null and cuota_saldo > 0;

  -- Lookup directo por registro_id Zeta (resolución de huérfanos en pipeline).
  create index idx_proto_invoice_installments_zeta_registro_id
    on public.proto_invoice_installments (workspace_company_id, zeta_registro_id);

  -- Trigger fail-closed (mismo patrón que sec02-03)
  drop trigger if exists trg_proto_invoice_installments_force_workspace
    on public.proto_invoice_installments;
  create trigger trg_proto_invoice_installments_force_workspace
    before insert or update on public.proto_invoice_installments
    for each row
    execute function public.copilot_proto_row_force_workspace();

  -- Trigger updated_at (idempotente)
  if exists (
    select 1
    from pg_proc
    where proname = 'set_updated_at'
      and pronamespace = 'public'::regnamespace
  ) then
    drop trigger if exists trg_proto_invoice_installments_set_updated_at
      on public.proto_invoice_installments;
    create trigger trg_proto_invoice_installments_set_updated_at
      before update on public.proto_invoice_installments
      for each row
      execute function public.set_updated_at();
  end if;

  -- RLS (mismo patrón que sec02-03 — políticas completas por comando)
  alter table public.proto_invoice_installments enable row level security;

  create policy proto_invoice_installments_tenant_select
    on public.proto_invoice_installments
    for select to authenticated
    using (workspace_company_id = public.copilot_current_workspace_company_id());

  create policy proto_invoice_installments_tenant_insert
    on public.proto_invoice_installments
    for insert to authenticated
    with check (workspace_company_id = public.copilot_current_workspace_company_id());

  create policy proto_invoice_installments_tenant_update
    on public.proto_invoice_installments
    for update to authenticated
    using (workspace_company_id = public.copilot_current_workspace_company_id())
    with check (workspace_company_id = public.copilot_current_workspace_company_id());

  create policy proto_invoice_installments_tenant_delete
    on public.proto_invoice_installments
    for delete to authenticated
    using (workspace_company_id = public.copilot_current_workspace_company_id());

  comment on table public.proto_invoice_installments is
    'Cuotas pendientes por factura cliente desde Zeta (RESTCuotasV1QueryCliente). Una fila por (factura, cuota). Linkea con proto_invoices vía zeta_registro_id. Resuelve due_date real sintético.';

  comment on column public.proto_invoice_installments.zeta_registro_id is
    'RegistroId Zeta de la FACTURA. Linkea con proto_invoices.zeta_metadata.zeta_customer_voucher_v1.zeta_registro_id.';

  comment on column public.proto_invoice_installments.invoice_id is
    'FK a proto_invoices cuando el RegistroId matchea. Nullable: si la factura aún no se sincronizó, la cuota queda huérfana y reintenta el match en cada corrida.';

  comment on column public.proto_invoice_installments.cuota_vencimiento is
    'Fecha REAL de vencimiento emitida por Zeta (no sintético issue_date+30). Fuente: CuotaVencimiento en QueryClienteOut.Response.';
end;
$zeta0801$;
