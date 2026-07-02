-- helpdesk-002 · Nuevos tipos/estados + columna resolution_note
-- Idempotente: DROP CONSTRAINT IF EXISTS / ADD COLUMN IF NOT EXISTS

-- ─── type: agregar "feature" ──────────────────────────────────────────────────
ALTER TABLE public.helpdesk_tickets
  DROP CONSTRAINT IF EXISTS helpdesk_tickets_type_check;

ALTER TABLE public.helpdesk_tickets
  ADD CONSTRAINT helpdesk_tickets_type_check
  CHECK (type IN ('suggestion','bug','improvement','question','design_change','feature','other'));

-- ─── status: agregar "planned" y "published" ──────────────────────────────────
ALTER TABLE public.helpdesk_tickets
  DROP CONSTRAINT IF EXISTS helpdesk_tickets_status_check;

ALTER TABLE public.helpdesk_tickets
  ADD CONSTRAINT helpdesk_tickets_status_check
  CHECK (status IN ('new','reviewing','approved','planned','in_progress','resolved','published','rejected'));

-- ─── resolution_note: columna nullable ────────────────────────────────────────
ALTER TABLE public.helpdesk_tickets
  ADD COLUMN IF NOT EXISTS resolution_note TEXT;

-- Filas existentes quedan con resolution_note = NULL — válido y sin backfill.
