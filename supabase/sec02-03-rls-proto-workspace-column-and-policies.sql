-- =============================================================================
-- SEC-02 — Paso 3: columna tenant `workspace_company_id` en familia proto_* + RLS
-- =============================================================================
-- Nomenclatura:
--   - `company_id` en proto_invoices / proto_receipts / … = cliente (proto_companies.id).
--   - `workspace_company_id` = tenant SaaS (`public.companies.id`), alineado con `app_users.company_id`.
--
-- Prerrequisitos: sec02-01 y sec02-02 ejecutados; tablas `proto_*` creadas.
--
-- ORDEN POR TABLA (anti-frágil; evita NOT NULL con filas sin tenant):
--   1) `ADD COLUMN` nullable + FK
--   2) índice btree en `workspace_company_id` (soporta RLS y joins)
--   3) trigger BEFORE INSERT/UPDATE (fail-closed; ver función)
--   4) backfill determinístico donde hay cadena a `proto_companies` / padres
--   5) validación explícita: cero NULL antes de NOT NULL
--   6) `SET NOT NULL`
--   7) RLS: políticas separadas SELECT / INSERT / UPDATE / DELETE
--
-- BACKFILLS “FALLBACK” (primer `companies.id` por `created_at`):
--   ╔══════════════════════════════════════════════════════════════════════════╗
--   ║  PELIGRO / SOLO BASE VACÍA O SINGLE-TENANT INICIAL                       ║
--   ║  NO ejecutar en entornos multi-tenant ya poblados sin revisar datos.   ║
--   ║  Asignaría todas las filas huérfanas al mismo workspace erróneamente.  ║
--   ╚══════════════════════════════════════════════════════════════════════════╝
--
-- TRIGGER fail-closed (`public.copilot_proto_row_force_workspace`):
--   - Sesión final: exige `auth.uid()` no nulo + `copilot_current_workspace_company_id()` no nulo;
--     fuerza `NEW.workspace_company_id` al workspace del JWT (SEC-01: email en JWT ↔ app_users).
--   - BYPASS documentado (mantenimiento / migraciones vía SQL Editor o service key):
--       JWT `role` = `service_role`, o `session_user` ∈ (`postgres`, `supabase_admin`).
--     En bypass NO se sobrescribe `NEW` (confiar en valores ya seteados por el script).
--
-- DEUDA FUTURA (identidad): ver comentarios en sec02-01 (`auth_user_id` / `auth.uid()`).
--
-- Idempotente: IF NOT EXISTS / DROP IF EXISTS donde aplica.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) Función trigger compartida (fail-closed)
-- ---------------------------------------------------------------------------
create or replace function public.copilot_proto_row_force_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  wid uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     or session_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  if auth.uid() is null then
    raise exception
      'copilot_proto_row: operación tenant sin auth.uid() y sin bypass permitido (sec02-03)'
      using errcode = '42501';
  end if;

  wid := public.copilot_current_workspace_company_id();
  if wid is null then
    raise exception 'copilot_proto_row: sin workspace (app_users sin fila para este JWT)'
      using errcode = '42501';
  end if;

  new.workspace_company_id := wid;
  return new;
end;
$$;

comment on function public.copilot_proto_row_force_workspace() is
  'SEC-02: fuerza workspace_company_id en proto_* para sesión autenticada. '
  'Bypass solo service_role o session_user postgres/supabase_admin (documentado en sec02-03).';

-- ---------------------------------------------------------------------------
-- B) Migración por tabla: columna → índice → trigger → backfill → validar → NOT NULL
-- ---------------------------------------------------------------------------
do $$
begin
  -- -------------------------
  -- proto_companies
  -- -------------------------
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'proto_companies'
  ) then
    alter table public.proto_companies
      add column if not exists workspace_company_id uuid
        references public.companies (id) on delete restrict;

    create index if not exists idx_proto_companies_workspace_company_id
      on public.proto_companies (workspace_company_id);

    drop trigger if exists trg_proto_companies_force_workspace on public.proto_companies;
    create trigger trg_proto_companies_force_workspace
      before insert or update on public.proto_companies
      for each row
      execute function public.copilot_proto_row_force_workspace();

    -- Backfill: no existe FK natural a `public.companies` en el modelo proto típico;
    -- el único camino automático aquí es el fallback “primer tenant” (PELIGRO multi-tenant).
    update public.proto_companies pc
    set workspace_company_id = sub.cid
    from (select id as cid from public.companies order by created_at asc limit 1) sub
    where pc.workspace_company_id is null;
    -- ^ PELIGRO: ver comentario de banner “SOLO BASE VACÍA / SINGLE-TENANT”.

    if exists (select 1 from public.proto_companies where workspace_company_id is null) then
      raise exception
        'sec02-03 proto_companies: quedaron filas con workspace_company_id NULL; revisar backfill antes de NOT NULL'
        using errcode = '23514';
    end if;

    alter table public.proto_companies
      alter column workspace_company_id set not null;
  end if;

  -- -------------------------
  -- proto_contacts
  -- -------------------------
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'proto_contacts'
  ) then
    alter table public.proto_contacts
      add column if not exists workspace_company_id uuid
        references public.companies (id) on delete restrict;

    create index if not exists idx_proto_contacts_workspace_company_id
      on public.proto_contacts (workspace_company_id);

    drop trigger if exists trg_proto_contacts_force_workspace on public.proto_contacts;
    create trigger trg_proto_contacts_force_workspace
      before insert or update on public.proto_contacts
      for each row
      execute function public.copilot_proto_row_force_workspace();

    update public.proto_contacts t
    set workspace_company_id = c.workspace_company_id
    from public.proto_companies c
    where c.id = t.company_id
      and t.workspace_company_id is null;

    update public.proto_contacts t
    set workspace_company_id = sub.cid
    from (select id as cid from public.companies order by created_at asc limit 1) sub
    where t.workspace_company_id is null;
    -- ^ PELIGRO: solo base vacía / single-tenant.

    if exists (select 1 from public.proto_contacts where workspace_company_id is null) then
      raise exception
        'sec02-03 proto_contacts: NULLs restantes; abortar (revisar multi-tenant / FK cliente)'
        using errcode = '23514';
    end if;

    alter table public.proto_contacts
      alter column workspace_company_id set not null;
  end if;

  -- -------------------------
  -- proto_invoices
  -- -------------------------
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'proto_invoices'
  ) then
    alter table public.proto_invoices
      add column if not exists workspace_company_id uuid
        references public.companies (id) on delete restrict;

    create index if not exists idx_proto_invoices_workspace_company_id
      on public.proto_invoices (workspace_company_id);

    drop trigger if exists trg_proto_invoices_force_workspace on public.proto_invoices;
    create trigger trg_proto_invoices_force_workspace
      before insert or update on public.proto_invoices
      for each row
      execute function public.copilot_proto_row_force_workspace();

    update public.proto_invoices t
    set workspace_company_id = c.workspace_company_id
    from public.proto_companies c
    where c.id = t.company_id
      and t.workspace_company_id is null;

    update public.proto_invoices t
    set workspace_company_id = sub.cid
    from (select id as cid from public.companies order by created_at asc limit 1) sub
    where t.workspace_company_id is null;
    -- ^ PELIGRO: solo base vacía / single-tenant.

    if exists (select 1 from public.proto_invoices where workspace_company_id is null) then
      raise exception 'sec02-03 proto_invoices: NULLs restantes; abortar'
        using errcode = '23514';
    end if;

    alter table public.proto_invoices
      alter column workspace_company_id set not null;
  end if;

  -- -------------------------
  -- proto_receipts
  -- -------------------------
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'proto_receipts'
  ) then
    alter table public.proto_receipts
      add column if not exists workspace_company_id uuid
        references public.companies (id) on delete restrict;

    create index if not exists idx_proto_receipts_workspace_company_id
      on public.proto_receipts (workspace_company_id);

    drop trigger if exists trg_proto_receipts_force_workspace on public.proto_receipts;
    create trigger trg_proto_receipts_force_workspace
      before insert or update on public.proto_receipts
      for each row
      execute function public.copilot_proto_row_force_workspace();

    update public.proto_receipts t
    set workspace_company_id = c.workspace_company_id
    from public.proto_companies c
    where c.id = t.company_id
      and t.workspace_company_id is null;

    update public.proto_receipts t
    set workspace_company_id = i.workspace_company_id
    from public.proto_invoices i
    where t.invoice_id = i.id
      and t.workspace_company_id is null;

    update public.proto_receipts t
    set workspace_company_id = sub.cid
    from (select id as cid from public.companies order by created_at asc limit 1) sub
    where t.workspace_company_id is null;
    -- ^ PELIGRO: solo base vacía / single-tenant.

    if exists (select 1 from public.proto_receipts where workspace_company_id is null) then
      raise exception 'sec02-03 proto_receipts: NULLs restantes; abortar'
        using errcode = '23514';
    end if;

    alter table public.proto_receipts
      alter column workspace_company_id set not null;
  end if;

  -- -------------------------
  -- proto_payments
  -- -------------------------
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'proto_payments'
  ) then
    alter table public.proto_payments
      add column if not exists workspace_company_id uuid
        references public.companies (id) on delete restrict;

    create index if not exists idx_proto_payments_workspace_company_id
      on public.proto_payments (workspace_company_id);

    drop trigger if exists trg_proto_payments_force_workspace on public.proto_payments;
    create trigger trg_proto_payments_force_workspace
      before insert or update on public.proto_payments
      for each row
      execute function public.copilot_proto_row_force_workspace();

    update public.proto_payments t
    set workspace_company_id = c.workspace_company_id
    from public.proto_companies c
    where c.id = t.company_id
      and t.workspace_company_id is null;

    update public.proto_payments t
    set workspace_company_id = sub.cid
    from (select id as cid from public.companies order by created_at asc limit 1) sub
    where t.workspace_company_id is null;
    -- ^ PELIGRO: solo base vacía / single-tenant.

    if exists (select 1 from public.proto_payments where workspace_company_id is null) then
      raise exception 'sec02-03 proto_payments: NULLs restantes; abortar'
        using errcode = '23514';
    end if;

    alter table public.proto_payments
      alter column workspace_company_id set not null;
  end if;

  -- -------------------------
  -- proto_tax_obligations (sin FK directa a cliente operativo)
  -- -------------------------
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'proto_tax_obligations'
  ) then
    alter table public.proto_tax_obligations
      add column if not exists workspace_company_id uuid
        references public.companies (id) on delete restrict;

    create index if not exists idx_proto_tax_obligations_workspace_company_id
      on public.proto_tax_obligations (workspace_company_id);

    drop trigger if exists trg_proto_tax_obligations_force_workspace on public.proto_tax_obligations;
    create trigger trg_proto_tax_obligations_force_workspace
      before insert or update on public.proto_tax_obligations
      for each row
      execute function public.copilot_proto_row_force_workspace();

    update public.proto_tax_obligations t
    set workspace_company_id = sub.cid
    from (select id as cid from public.companies order by created_at asc limit 1) sub
    where t.workspace_company_id is null;
    -- ^ PELIGRO: solo base vacía / single-tenant (no hay join natural a proto_companies).

    if exists (select 1 from public.proto_tax_obligations where workspace_company_id is null) then
      raise exception 'sec02-03 proto_tax_obligations: NULLs restantes; abortar'
        using errcode = '23514';
    end if;

    alter table public.proto_tax_obligations
      alter column workspace_company_id set not null;
  end if;

  -- -------------------------
  -- proto_tax_payments
  -- -------------------------
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'proto_tax_payments'
  ) then
    alter table public.proto_tax_payments
      add column if not exists workspace_company_id uuid
        references public.companies (id) on delete restrict;

    create index if not exists idx_proto_tax_payments_workspace_company_id
      on public.proto_tax_payments (workspace_company_id);

    drop trigger if exists trg_proto_tax_payments_force_workspace on public.proto_tax_payments;
    create trigger trg_proto_tax_payments_force_workspace
      before insert or update on public.proto_tax_payments
      for each row
      execute function public.copilot_proto_row_force_workspace();

    update public.proto_tax_payments p
    set workspace_company_id = o.workspace_company_id
    from public.proto_tax_obligations o
    where o.id = p.obligation_id
      and p.workspace_company_id is null;

    update public.proto_tax_payments p
    set workspace_company_id = sub.cid
    from (select id as cid from public.companies order by created_at asc limit 1) sub
    where p.workspace_company_id is null;
    -- ^ PELIGRO: solo base vacía / single-tenant.

    if exists (select 1 from public.proto_tax_payments where workspace_company_id is null) then
      raise exception 'sec02-03 proto_tax_payments: NULLs restantes; abortar'
        using errcode = '23514';
    end if;

    alter table public.proto_tax_payments
      alter column workspace_company_id set not null;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- C) RLS: aislamiento por workspace (políticas completas por comando)
-- ---------------------------------------------------------------------------
do $$
declare
  tbl text;
  tlist text[] := array[
    'proto_companies',
    'proto_contacts',
    'proto_invoices',
    'proto_receipts',
    'proto_payments',
    'proto_tax_obligations',
    'proto_tax_payments'
  ];
  pol record;
begin
  foreach tbl in array tlist loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = tbl
    ) then
      execute format('alter table public.%I enable row level security', tbl);

      for pol in
        select policyname from pg_policies where schemaname = 'public' and tablename = tbl
      loop
        execute format('drop policy if exists %I on public.%I', pol.policyname, tbl);
      end loop;

      execute format(
        $f$
        create policy %I on public.%I
          for select to authenticated
          using (workspace_company_id = public.copilot_current_workspace_company_id())
        $f$,
        tbl || '_tenant_select',
        tbl
      );

      execute format(
        $f$
        create policy %I on public.%I
          for insert to authenticated
          with check (workspace_company_id = public.copilot_current_workspace_company_id())
        $f$,
        tbl || '_tenant_insert',
        tbl
      );

      execute format(
        $f$
        create policy %I on public.%I
          for update to authenticated
          using (workspace_company_id = public.copilot_current_workspace_company_id())
          with check (workspace_company_id = public.copilot_current_workspace_company_id())
        $f$,
        tbl || '_tenant_update',
        tbl
      );

      execute format(
        $f$
        create policy %I on public.%I
          for delete to authenticated
          using (workspace_company_id = public.copilot_current_workspace_company_id())
        $f$,
        tbl || '_tenant_delete',
        tbl
      );
    end if;
  end loop;
end;
$$;
