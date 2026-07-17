-- BANK-RECONCILIATION-CONFIRM-RPC-001 (FASE BANK-SCHEMA-CORRECTION-001)
--
-- RPC transaccional para CONFIRMAR una conciliación: crea/reutiliza el LINK
-- CANÓNICO (`bank_movement_reconciliation_links`, FASE E), distribuye a facturas
-- (`payment_allocations`), marca la sugerencia como 'confirmed' y registra eventos —
-- TODO en una transacción, con locks y validación de sumas. Idempotente.
--
-- SECURITY INVOKER: la app usa cliente service_role (auth propia por cookie); el
-- workspace lo aporta el SERVIDOR (p_workspace_id, nunca el navegador). search_path
-- fijo. RLS aplica para authenticated; service_role la valida en la propia función.
-- Sin SQL dinámico. ADITIVA. NO APLICAR sin autorización.

CREATE OR REPLACE FUNCTION public.confirm_bank_reconciliation_v1(
  p_workspace_id  uuid,
  p_movement_id   uuid,
  p_receipt_id    uuid,
  p_suggestion_id uuid,
  p_allocations   jsonb,          -- [{ "invoice_id": uuid, "amount": numeric }, ...]
  p_created_by    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_session_ws uuid;
  v_mov        record;
  v_receipt    record;
  v_mov_amount numeric(14,2);
  v_mov_used   numeric(14,2);
  v_rec_used   numeric(14,2);
  v_link_amt   numeric(14,2);
  v_alloc_sum  numeric(14,2) := 0;
  v_link_id    uuid;
  v_alloc      jsonb;
  v_inv        record;
  v_inv_id     uuid;
  v_inv_amt    numeric(14,2);
BEGIN
  IF p_workspace_id IS NULL THEN RAISE EXCEPTION 'NO_WORKSPACE' USING errcode='42501'; END IF;
  v_session_ws := public.copilot_current_workspace_company_id();
  IF v_session_ws IS NOT NULL AND v_session_ws <> p_workspace_id THEN
    RAISE EXCEPTION 'WORKSPACE_MISMATCH' USING errcode='42501';
  END IF;

  -- IDEMPOTENCIA 1: sugerencia ya confirmada → devolver su link sin duplicar.
  IF p_suggestion_id IS NOT NULL THEN
    SELECT confirmed_link_id INTO v_link_id FROM public.bank_reconciliation_suggestions
     WHERE id = p_suggestion_id AND workspace_id = p_workspace_id AND status = 'confirmed';
    IF v_link_id IS NOT NULL THEN
      RETURN jsonb_build_object('linkId', v_link_id, 'idempotent', true, 'status', 'already_confirmed');
    END IF;
  END IF;

  -- Bloquear el movimiento y validar.
  SELECT id, workspace_id, abs(amount) AS amount, currency, direction, status
    INTO v_mov FROM public.bank_movements
   WHERE id = p_movement_id AND workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MOVEMENT_NOT_FOUND'; END IF;
  IF v_mov.direction <> 'inflow' THEN RAISE EXCEPTION 'NON_COMMERCIAL'; END IF;
  IF v_mov.status IN ('ignored','reversed') THEN RAISE EXCEPTION 'MOVEMENT_NOT_RECONCILABLE'; END IF;
  v_mov_amount := v_mov.amount;

  -- IDEMPOTENCIA 2: ya existe link activo (movimiento ↔ este recibo) → devolverlo.
  SELECT id INTO v_link_id FROM public.bank_movement_reconciliation_links
   WHERE workspace_id = p_workspace_id AND bank_movement_id = p_movement_id
     AND target_type = 'receipt' AND target_id = p_receipt_id::text AND archived_at IS NULL;
  IF v_link_id IS NOT NULL THEN
    RETURN jsonb_build_object('linkId', v_link_id, 'idempotent', true, 'status', 'already_linked');
  END IF;

  -- Recibo (opcional): bloquear, validar workspace y moneda.
  IF p_receipt_id IS NOT NULL THEN
    SELECT id, workspace_company_id AS ws, amount, coalesce(currency_code, currency) AS currency
      INTO v_receipt FROM public.proto_receipts
     WHERE id = p_receipt_id AND workspace_company_id = p_workspace_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RECEIPT_NOT_FOUND'; END IF;
    IF upper(v_receipt.currency) <> v_mov.currency THEN RAISE EXCEPTION 'CURRENCY_MISMATCH'; END IF;
  END IF;

  -- Sumar aplicaciones propuestas (o usar el importe del recibo si no hay allocations).
  IF p_allocations IS NOT NULL AND jsonb_typeof(p_allocations) = 'array' THEN
    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
      v_alloc_sum := v_alloc_sum + coalesce((v_alloc->>'amount')::numeric(14,2), 0);
    END LOOP;
  END IF;
  v_link_amt := CASE WHEN v_alloc_sum > 0 THEN v_alloc_sum
                     WHEN p_receipt_id IS NOT NULL THEN v_receipt.amount
                     ELSE 0 END;
  IF NOT (v_link_amt > 0) THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;

  -- Validación de sumas (transaccional, con los locks tomados).
  SELECT coalesce(sum(applied_amount),0) INTO v_mov_used FROM public.bank_movement_reconciliation_links
   WHERE workspace_id = p_workspace_id AND bank_movement_id = p_movement_id
     AND archived_at IS NULL AND target_type <> 'ignored';
  IF v_mov_used + v_link_amt > v_mov_amount + 0.01 THEN RAISE EXCEPTION 'OVER_APPLIED_MOVEMENT'; END IF;

  IF p_receipt_id IS NOT NULL THEN
    SELECT coalesce(sum(applied_amount),0) INTO v_rec_used FROM public.bank_movement_reconciliation_links
     WHERE workspace_id = p_workspace_id AND target_type = 'receipt' AND target_id = p_receipt_id::text
       AND archived_at IS NULL;
    IF v_rec_used + v_link_amt > v_receipt.amount + 0.01 THEN RAISE EXCEPTION 'OVER_APPLIED_RECEIPT'; END IF;
  END IF;

  -- Crear el LINK CANÓNICO (fuente financiera única).
  INSERT INTO public.bank_movement_reconciliation_links
    (workspace_id, bank_movement_id, target_type, target_id, applied_amount, currency, direction, method, created_by)
  VALUES (p_workspace_id, p_movement_id, 'receipt', p_receipt_id::text, v_link_amt, v_mov.currency, 'inflow', 'suggested_confirmed', p_created_by)
  RETURNING id INTO v_link_id;

  -- Aplicaciones a facturas (validando saldo de cada factura, bloqueada).
  IF p_allocations IS NOT NULL AND jsonb_typeof(p_allocations) = 'array' THEN
    FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
      v_inv_id  := (v_alloc->>'invoice_id')::uuid;
      v_inv_amt := (v_alloc->>'amount')::numeric(14,2);
      IF NOT (v_inv_amt > 0) THEN RAISE EXCEPTION 'INVALID_ALLOCATION'; END IF;
      SELECT id, balance_amount, coalesce(currency_code, currency) AS currency
        INTO v_inv FROM public.proto_invoices
       WHERE id = v_inv_id AND workspace_company_id = p_workspace_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;
      IF upper(v_inv.currency) <> v_mov.currency THEN RAISE EXCEPTION 'CURRENCY_MISMATCH'; END IF;
      IF v_inv_amt > coalesce(v_inv.balance_amount,0) + 0.01 THEN RAISE EXCEPTION 'OVER_APPLIED_INVOICE'; END IF;
      INSERT INTO public.payment_allocations
        (workspace_id, reconciliation_link_id, invoice_id, applied_amount, currency, status, source, created_by)
      VALUES (p_workspace_id, v_link_id, v_inv_id, v_inv_amt, v_mov.currency, 'active', 'engine', p_created_by);
      INSERT INTO public.reconciliation_events (workspace_id, event_type, entity_type, entity_id, new_state, actor_user_id)
      VALUES (p_workspace_id, 'allocation_created', 'allocation', v_link_id, 'active', p_created_by);
    END LOOP;
  END IF;

  -- Confirmar la sugerencia (apuntando al link canónico) — anti-drift por CHECK.
  IF p_suggestion_id IS NOT NULL THEN
    UPDATE public.bank_reconciliation_suggestions
       SET status='confirmed', confirmed_link_id=v_link_id, reviewed_by=p_created_by, reviewed_at=now()
     WHERE id=p_suggestion_id AND workspace_id=p_workspace_id AND status IN ('generated','pending_review');
  END IF;

  INSERT INTO public.reconciliation_events (workspace_id, event_type, entity_type, entity_id, new_state, actor_user_id)
  VALUES (p_workspace_id, 'reconciliation_confirmed', 'link', v_link_id, 'active', p_created_by);

  RETURN jsonb_build_object('linkId', v_link_id, 'idempotent', false, 'appliedAmount', v_link_amt, 'allocations', coalesce(jsonb_array_length(p_allocations),0));
END;
$$;

COMMENT ON FUNCTION public.confirm_bank_reconciliation_v1(uuid,uuid,uuid,uuid,jsonb,uuid) IS
  'Confirma conciliación en UNA transacción: crea link canónico + allocations, marca sugerencia confirmada, valida sumas (movimiento/recibo/factura) con locks, idempotente. FASE BANK-SCHEMA-CORRECTION-001.';

-- ── Reversión atómica ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reverse_bank_reconciliation_v1(
  p_workspace_id uuid,
  p_link_id      uuid,
  p_reason       text DEFAULT NULL,
  p_actor        uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE v_link record;
BEGIN
  IF p_workspace_id IS NULL THEN RAISE EXCEPTION 'NO_WORKSPACE' USING errcode='42501'; END IF;

  SELECT id, archived_at INTO v_link FROM public.bank_movement_reconciliation_links
   WHERE id = p_link_id AND workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LINK_NOT_FOUND'; END IF;
  -- Idempotente: doble reversión → no-op.
  IF v_link.archived_at IS NOT NULL THEN
    RETURN jsonb_build_object('linkId', p_link_id, 'idempotent', true, 'status', 'already_reversed');
  END IF;

  -- Archivar el link (no borra: preserva historial financiero).
  UPDATE public.bank_movement_reconciliation_links SET archived_at = now(), updated_at = now()
   WHERE id = p_link_id AND workspace_id = p_workspace_id;
  -- Revertir las aplicaciones activas (no borra).
  UPDATE public.payment_allocations SET status='reversed', updated_at = now()
   WHERE reconciliation_link_id = p_link_id AND workspace_id = p_workspace_id AND status='active';
  -- La sugerencia confirmada vuelve a revisión (si existía).
  UPDATE public.bank_reconciliation_suggestions SET status='pending_review', confirmed_link_id=NULL
   WHERE confirmed_link_id = p_link_id AND workspace_id = p_workspace_id AND status='confirmed';

  INSERT INTO public.reconciliation_events (workspace_id, event_type, entity_type, entity_id, previous_state, new_state, reason, actor_user_id)
  VALUES (p_workspace_id, 'reconciliation_reversed', 'link', p_link_id, 'active', 'reversed', p_reason, p_actor);

  RETURN jsonb_build_object('linkId', p_link_id, 'idempotent', false, 'status', 'reversed');
END;
$$;

COMMENT ON FUNCTION public.reverse_bank_reconciliation_v1(uuid,uuid,text,uuid) IS
  'Revierte una conciliación: archiva el link canónico (no borra), revierte allocations, reabre la sugerencia, registra evento. Idempotente. FASE BANK-SCHEMA-CORRECTION-001.';

-- Permisos mínimos: authenticated + service_role (la app), sin anon/public.
REVOKE ALL ON FUNCTION public.confirm_bank_reconciliation_v1(uuid,uuid,uuid,uuid,jsonb,uuid) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_bank_reconciliation_v1(uuid,uuid,text,uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_bank_reconciliation_v1(uuid,uuid,uuid,uuid,jsonb,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_bank_reconciliation_v1(uuid,uuid,text,uuid) TO authenticated, service_role;

-- ROLLBACK CONCEPTUAL (no ejecutar aquí):
--   DROP FUNCTION IF EXISTS public.confirm_bank_reconciliation_v1(uuid,uuid,uuid,uuid,jsonb,uuid);
--   DROP FUNCTION IF EXISTS public.reverse_bank_reconciliation_v1(uuid,uuid,text,uuid);
