-- Capa fiscal prototipo (proto_tax_*): obligaciones y pagos al Estado.
-- Ejecutar en el SQL Editor de Supabase (proyecto con extensión pgcrypto para gen_random_uuid).

-- -----------------------------------------------------------------------------
-- Función común updated_at
-- -----------------------------------------------------------------------------
create or replace function public.copilot_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- A) Obligaciones fiscales
-- -----------------------------------------------------------------------------
create table if not exists public.proto_tax_obligations (
  id uuid primary key default gen_random_uuid(),
  tax_type text not null,
  period_label text not null,
  due_date date not null,
  estimated_amount numeric(14, 2) not null default 0,
  confirmed_amount numeric(14, 2),
  status text not null default 'scheduled',
  priority text not null default 'medium',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists proto_tax_obligations_due_date_idx
  on public.proto_tax_obligations (due_date);

create index if not exists proto_tax_obligations_status_idx
  on public.proto_tax_obligations (status);

create index if not exists proto_tax_obligations_tax_type_idx
  on public.proto_tax_obligations (tax_type);

drop trigger if exists trg_proto_tax_obligations_updated on public.proto_tax_obligations;
create trigger trg_proto_tax_obligations_updated
  before update on public.proto_tax_obligations
  for each row execute procedure public.copilot_set_updated_at();

comment on table public.proto_tax_obligations is 'Prototipo: obligaciones fiscales (vencimientos, montos, prioridad).';

-- -----------------------------------------------------------------------------
-- B) Pagos fiscales vinculados a obligaciones
-- -----------------------------------------------------------------------------
create table if not exists public.proto_tax_payments (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.proto_tax_obligations (id) on delete cascade,
  payment_date date not null,
  amount numeric(14, 2) not null,
  payment_method text,
  reference text,
  status text not null default 'paid',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists proto_tax_payments_obligation_id_idx
  on public.proto_tax_payments (obligation_id);

create index if not exists proto_tax_payments_payment_date_idx
  on public.proto_tax_payments (payment_date desc);

create index if not exists proto_tax_payments_status_idx
  on public.proto_tax_payments (status);

drop trigger if exists trg_proto_tax_payments_updated on public.proto_tax_payments;
create trigger trg_proto_tax_payments_updated
  before update on public.proto_tax_payments
  for each row execute procedure public.copilot_set_updated_at();

comment on table public.proto_tax_payments is 'Prototipo: pagos asociados a obligaciones fiscales.';

-- -----------------------------------------------------------------------------
-- RLS abierta (prototipo)
-- -----------------------------------------------------------------------------
alter table public.proto_tax_obligations enable row level security;
alter table public.proto_tax_payments enable row level security;

drop policy if exists "proto_tax_obligations_all" on public.proto_tax_obligations;
create policy "proto_tax_obligations_all"
  on public.proto_tax_obligations
  for all
  using (true)
  with check (true);

drop policy if exists "proto_tax_payments_all" on public.proto_tax_payments;
create policy "proto_tax_payments_all"
  on public.proto_tax_payments
  for all
  using (true)
  with check (true);

-- -----------------------------------------------------------------------------
-- Seed ficticio (IDs fijos para referencias de pagos)
-- -----------------------------------------------------------------------------
insert into public.proto_tax_obligations (
  id, tax_type, period_label, due_date, estimated_amount, confirmed_amount, status, priority, notes
) values
  (
    'a0000001-0000-4000-8000-000000000001',
    'iva',
    'Marzo 2026',
    '2026-04-18',
    1280000.00,
    600000.00,
    'pending',
    'high',
    'Declaración jurada presentada. Falta saldar saldo según comprobantes recibidos.'
  ),
  (
    'a0000002-0000-4000-8000-000000000002',
    'bps',
    'Marzo 2026',
    '2026-04-12',
    415000.00,
    null,
    'scheduled',
    'critical',
    'Aporte patronal y laboral — ventana de pago próxima; impacto directo en nómina.'
  ),
  (
    'a0000003-0000-4000-8000-000000000003',
    'irae',
    'Anticipo Q1 2026',
    '2026-05-05',
    305000.00,
    null,
    'scheduled',
    'medium',
    'Anticipo estimado según coeficiente histórico; confirmar con contador.'
  ),
  (
    'a0000004-0000-4000-8000-000000000004',
    'dgi',
    'Régimen general — Feb 2026',
    '2026-02-20',
    890000.00,
    null,
    'overdue',
    'critical',
    'Vencida sin acreditación registrada. Riesgo de recargos e intereses.'
  ),
  (
    'a0000005-0000-4000-8000-000000000005',
    'iva',
    'Enero 2026',
    '2026-02-14',
    975000.00,
    975000.00,
    'paid',
    'low',
    'Obligación cerrada en término. Comprobante de pago archivado.'
  )
on conflict (id) do nothing;

insert into public.proto_tax_payments (
  id, obligation_id, payment_date, amount, payment_method, reference, status, notes
) values
  (
    'b0000001-0000-4000-8000-000000000001',
    'a0000001-0000-4000-8000-000000000001',
    '2026-03-28',
    600000.00,
    'transferencia',
    'TRF-IVA-2026-03-001',
    'paid',
    'Pago parcial aplicado a IVA marzo.'
  ),
  (
    'b0000002-0000-4000-8000-000000000002',
    'a0000005-0000-4000-8000-000000000005',
    '2026-02-13',
    975000.00,
    'débito bancario',
    'DGI-IVA-ENE-2026',
    'paid',
    'Liquidación íntegra IVA enero.'
  )
on conflict (id) do nothing;
