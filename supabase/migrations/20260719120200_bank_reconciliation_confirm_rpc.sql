-- BANK-RECONCILIATION-CONFIRM-RPC-001 (FASE BANK-SCHEMA-CORRECTION-001)
-- Endurecida en FASE BANK-MIGRATION-REVIEW-001.
--
-- RPC transaccional para CONFIRMAR una conciliación: crea/reutiliza el LINK
-- CANÓNICO (`bank_movement_reconciliation_links`, FASE E), distribuye a facturas
-- (`payment_allocations`), marca la sugerencia como 'confirmed' y registra eventos —
-- TODO en una transacción, con locks y validación AGREGADA de sumas. Idempotente
-- con detección de conflicto.
--
-- SEGURIDAD (decisión de revisión): SOLO `service_role` puede ejecutar (la app usa
-- un cliente service_role con auth propia por cookie Copilot; ver incidente NO_WORKSPACE).
-- `authenticated`/`anon`/`public` NO tienen EXECUTE → no hay superficie de spoofing de
-- `p_workspace_id`/`p_created_by` desde el navegador. El servidor deriva ambos de la
-- sesión Copilot y la RPC valida `p_created_by` contra app_users del workspace.
-- SECURITY INVOKER (corre como service_role → RLS omitida; la función valida todo).
-- search_path fijo. Sin SQL dinámico. ADITIVA. NO APLICAR sin autorización.

CREATE OR REPLACE FUNCTION public.confirm_bank_reconciliation_v1(
  p_workspace_id   uuid,
  p_movement_id    uuid,
  p_receipt_id     uuid,
  p_suggestion_id  uuid,
  p_allocations    jsonb,           -- [{ "invoice_id": uuid, "amount": numeric }, ...]
  p_applied_amount numeric(14,2) DEFAULT NULL,  -- importe del link (permite saldo sin aplicar)
  p_created_by     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public, pg_temp'
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
  v_existing   record;
  v_inv        record;
  v_inv_row    record;
  v_inv_used   numeric(14,2);
BEGIN
  IF p_workspace_id IS NULL THEN RAISE EXCEPTION 'NO_WORKSPACE' USING errcode='42501'; END IF;
  v_session_ws := public.copilot_current_workspace_company_id();
  IF v_session_ws IS NOT NULL AND v_session_ws <> p_workspace_id THEN
    RAISE EXCEPTION 'WORKSPACE_MISMATCH' USING errcode='42501';
  END IF;

  -- Actor: si viene, debe ser un app_user ACTIVO del workspace (no falsificable desde UI).
  IF p_created_by IS NOT NULL THEN
    PERFORM 1 FROM public.app_users
     WHERE id = p_created_by AND company_id = p_workspace_id AND is_active IS NOT FALSE;
    IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ACTOR' USING errcode='42501'; END IF;
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

  -- Recibo (opcional): bloquear, validar workspace y moneda.
  IF p_receipt_id IS NOT NULL THEN
    SELECT id, workspace_company_id AS ws, amount, coalesce(currency_code, currency) AS currency
      INTO v_receipt FROM public.proto_receipts
     WHERE id = p_receipt_id AND workspace_company_id = p_workspace_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RECEIPT_NOT_FOUND'; END IF;
    IF upper(v_receipt.currency) <> v_mov.currency THEN RAISE EXCEPTION 'CURRENCY_MISMATCH'; END IF;
  END IF;

  -- Σ allocations (agregado por factura más abajo) e importe del LINK.
  IF p_allocations IS NOT NULL AND jsonb_typeof(p_allocations) = 'array' THEN
    SELECT coalesce(sum((elem->>'amount')::numeric(14,2)), 0) INTO v_alloc_sum
      FROM jsonb_array_elements(p_allocations) elem;
  END IF;
  -- Permite SALDO SIN APLICAR: link ≥ Σ allocations (no exige igualdad).
  v_link_amt := coalesce(p_applied_amount, CASE WHEN p_receipt_id IS NOT NULL THEN v_receipt.amount ELSE v_alloc_sum END);
  IF NOT (v_link_amt > 0) THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  IF v_alloc_sum > v_link_amt + 0.01 THEN RAISE EXCEPTION 'ALLOCATIONS_EXCEED_LINK'; END IF;

  -- IDEMPOTENCIA 2 / CONFLICTO: ya existe link activo (movimiento ↔ recibo).
  SELECT id, applied_amount INTO v_existing FROM public.bank_movement_reconciliation_links
   WHERE workspace_id = p_workspace_id AND bank_movement_id = p_movement_id
     AND target_type = 'receipt' AND target_id = p_receipt_id::text AND archived_at IS NULL
   FOR UPDATE;
  IF FOUND THEN
    IF abs(v_existing.applied_amount - v_link_amt) <= 0.01 THEN
      RETURN jsonb_build_object('linkId', v_existing.id, 'idempotent', true, 'status', 'already_linked');
    END IF;
    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';  -- misma clave, importe distinto
  END IF;

  -- Sugerencia: debe pertenecer al movimiento/workspace y estar en estado confirmable.
  IF p_suggestion_id IS NOT NULL THEN
    PERFORM 1 FROM public.bank_reconciliation_suggestions
     WHERE id = p_suggestion_id AND workspace_id = p_workspace_id AND bank_movement_id = p_movement_id
       AND status IN ('generated','pending_review');
    IF NOT FOUND THEN RAISE EXCEPTION 'SUGGESTION_NOT_CONFIRMABLE'; END IF;
  END IF;

  -- Validación de sumas del MOVIMIENTO y RECIBO (transaccional, con locks).
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

  -- Aplicaciones a facturas: AGREGADAS por factura (dedup del JSON) y validando
  -- allocations EXISTENTES + NUEVAS ≤ saldo de cada factura (bloqueada).
  IF p_allocations IS NOT NULL AND jsonb_typeof(p_allocations) = 'array' THEN
    -- ORDER BY invoice_id ASC → orden de locks DETERMINÍSTICO (evita deadlocks entre
    -- confirmaciones concurrentes que envían las facturas en distinto orden en el JSON).
    FOR v_inv IN
      SELECT (elem->>'invoice_id')::uuid AS invoice_id, sum((elem->>'amount')::numeric(14,2)) AS amt
        FROM jsonb_array_elements(p_allocations) elem
       WHERE (elem->>'invoice_id') IS NOT NULL
       GROUP BY 1
       ORDER BY 1
    LOOP
      IF NOT (v_inv.amt > 0) THEN RAISE EXCEPTION 'INVALID_ALLOCATION'; END IF;
      SELECT id, balance_amount, coalesce(currency_code, currency) AS currency
        INTO v_inv_row FROM public.proto_invoices
       WHERE id = v_inv.invoice_id AND workspace_company_id = p_workspace_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND'; END IF;
      IF coalesce(v_inv_row.balance_amount,0) <= 0 THEN RAISE EXCEPTION 'INVOICE_FULLY_PAID'; END IF;
      IF upper(v_inv_row.currency) <> v_mov.currency THEN RAISE EXCEPTION 'CURRENCY_MISMATCH'; END IF;
      SELECT coalesce(sum(applied_amount),0) INTO v_inv_used FROM public.payment_allocations
       WHERE workspace_id = p_workspace_id AND invoice_id = v_inv.invoice_id AND status='active';
      IF v_inv_used + v_inv.amt > coalesce(v_inv_row.balance_amount,0) + 0.01 THEN RAISE EXCEPTION 'OVER_APPLIED_INVOICE'; END IF;
      INSERT INTO public.payment_allocations
        (workspace_id, reconciliation_link_id, invoice_id, applied_amount, currency, status, source, created_by)
      VALUES (p_workspace_id, v_link_id, v_inv.invoice_id, v_inv.amt, v_mov.currency, 'active', 'engine', p_created_by);
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

  RETURN jsonb_build_object(
    'linkId', v_link_id, 'idempotent', false,
    'appliedAmount', v_link_amt, 'allocatedAmount', v_alloc_sum, 'unappliedAmount', v_link_amt - v_alloc_sum);
END;
$$;

COMMENT ON FUNCTION public.confirm_bank_reconciliation_v1(uuid,uuid,uuid,uuid,jsonb,numeric,uuid) IS
  'Confirma conciliación en UNA transacción: crea link canónico + allocations (agregadas por factura), valida sumas (movimiento/recibo/factura) con locks, permite saldo sin aplicar, idempotente con detección de conflicto. Solo service_role. FASE BANK-MIGRATION-REVIEW-001.';

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
SET search_path TO 'public, pg_temp'
AS $$
DECLARE v_link record;
BEGIN
  IF p_workspace_id IS NULL THEN RAISE EXCEPTION 'NO_WORKSPACE' USING errcode='42501'; END IF;
  IF p_actor IS NOT NULL THEN
    PERFORM 1 FROM public.app_users WHERE id = p_actor AND company_id = p_workspace_id AND is_active IS NOT FALSE;
    IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ACTOR' USING errcode='42501'; END IF;
  END IF;

  SELECT id, archived_at INTO v_link FROM public.bank_movement_reconciliation_links
   WHERE id = p_link_id AND workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LINK_NOT_FOUND'; END IF;
  IF v_link.archived_at IS NOT NULL THEN  -- doble reversión = no-op
    RETURN jsonb_build_object('linkId', p_link_id, 'idempotent', true, 'status', 'already_reversed');
  END IF;

  UPDATE public.bank_movement_reconciliation_links SET archived_at = now(), updated_at = now()
   WHERE id = p_link_id AND workspace_id = p_workspace_id;
  UPDATE public.payment_allocations SET status='reversed', updated_at = now()
   WHERE reconciliation_link_id = p_link_id AND workspace_id = p_workspace_id AND status='active';
  -- La sugerencia confirmada pasa a 'reversed' (preserva que SÍ fue confirmada; no vuelve
  -- a 'pending_review' para no borrar historia). Una nueva sugerencia puede generarse luego.
  UPDATE public.bank_reconciliation_suggestions SET status='reversed', confirmed_link_id=NULL
   WHERE confirmed_link_id = p_link_id AND workspace_id = p_workspace_id AND status='confirmed';

  INSERT INTO public.reconciliation_events (workspace_id, event_type, entity_type, entity_id, previous_state, new_state, reason, actor_user_id)
  VALUES (p_workspace_id, 'reconciliation_reversed', 'link', p_link_id, 'active', 'reversed', p_reason, p_actor);

  RETURN jsonb_build_object('linkId', p_link_id, 'idempotent', false, 'status', 'reversed');
END;
$$;

COMMENT ON FUNCTION public.reverse_bank_reconciliation_v1(uuid,uuid,text,uuid) IS
  'Revierte una conciliación: archiva el link canónico (no borra), revierte allocations, marca la sugerencia como reversed. Idempotente. Solo service_role. FASE BANK-MIGRATION-REVIEW-001.';

-- Permisos: SOLO service_role (server-side). Sin anon/public/authenticated.
REVOKE ALL ON FUNCTION public.confirm_bank_reconciliation_v1(uuid,uuid,uuid,uuid,jsonb,numeric,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reverse_bank_reconciliation_v1(uuid,uuid,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_bank_reconciliation_v1(uuid,uuid,uuid,uuid,jsonb,numeric,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_bank_reconciliation_v1(uuid,uuid,text,uuid) TO service_role;

-- ROLLBACK CONCEPTUAL (no ejecutar aquí):
--   DROP FUNCTION IF EXISTS public.confirm_bank_reconciliation_v1(uuid,uuid,uuid,uuid,jsonb,numeric,uuid);
--   DROP FUNCTION IF EXISTS public.reverse_bank_reconciliation_v1(uuid,uuid,text,uuid);
