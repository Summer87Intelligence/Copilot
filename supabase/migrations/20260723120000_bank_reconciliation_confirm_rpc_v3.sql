-- BANK-MANUAL-CANONICAL-MATCH-SELECTION-001
--
-- Extiende `confirm_bank_reconciliation_v1` (v2, migración 20260722130000)
-- ÚNICAMENTE para poder registrar, de forma auditable, cuándo una
-- confirmación corresponde a una selección MANUAL revisada (cliente/recibo
-- distintos de los propuestos por el motor) en vez de la sugerencia tal cual.
--
-- HALLAZGO DE LA AUDITORÍA (ver docs/architecture/bank-reconciliation-canonical-engine.md,
-- sección "Selección manual revisada — auditoría del contrato"): la RPC YA
-- podía aceptar cualquier `p_receipt_id` del workspace, sin exigir que
-- coincidiera con `proposed_receipt_id` de la sugerencia — esa restricción
-- vivía ÚNICAMENTE en el adapter TypeScript (`confirmCanonicalSuggestion()`),
-- nunca en la RPC ni en el esquema. La RPC tampoco conoce ni valida "cliente"
-- en ningún momento (no recibe `client_id` como parámetro) — el cliente es
-- un concepto de la capa de evidencia/lectura, no de esta RPC financiera.
-- Por lo tanto, NO se necesita una v4 ni una RPC nueva para permitir
-- confirmar un recibo/cliente distinto: eso ya funciona hoy con la v2 sin
-- ningún cambio de SQL. Esta v3 agrega ÚNICAMENTE lo que realmente faltaba:
-- un lugar para registrar la decisión final (modo, selección vs. propuesta,
-- motivo) de forma auditable, sin sobrescribir la propuesta original.
--
-- CAMBIO: un solo parámetro nuevo, ADITIVO con DEFAULT ('{}'::jsonb), así que
-- cualquier llamador existente que no lo pase (el modo "suggested" de hoy)
-- sigue funcionando exactamente igual, byte a byte, sin necesitar esta
-- migración aplicada. Se usa únicamente para poblar `reconciliation_events.metadata`
-- (columna JSONB que YA EXISTE desde 20260719120100 — nunca se usaba en el
-- INSERT de 'reconciliation_confirmed'). No se agregan columnas nuevas a
-- ninguna tabla. `bank_reconciliation_suggestions.proposed_client_id` /
-- `proposed_receipt_id` permanecen INTOCADOS — la propuesta original del
-- motor sigue siendo evidencia inmutable, tal como pide el negocio.
--
-- CORRECCIÓN (BANK-CONFIRM-RPC-V3-MIGRATION-CORRECTION-001, esta migración
-- NUNCA llegó a aplicarse en producción — corregida in place, sin v4):
-- la primera versión de este archivo derivaba
-- `bank_movement_reconciliation_links.method` de `p_metadata->>'mode'`
-- (`'manual_reviewed'` cuando correspondía). Auditado contra el CHECK real de
-- producción (`bank_movement_reconciliation_links_method_check`, que admite
-- ÚNICAMENTE `'manual'|'suggested_confirmed'`): ese valor hubiera violado la
-- constraint apenas se usara `mode='manual_reviewed'` — exactamente el caso
-- que esta fase existe para habilitar. `method` representa el MECANISMO
-- financiero del link (siempre `'suggested_confirmed'` para confirmaciones
-- vía esta RPC con sugerencia/recibo explícito), no el nivel de intervención
-- humana en la UI. La distinción `suggested`/`manual_reviewed` vive
-- EXCLUSIVAMENTE en `reconciliation_events.metadata.mode` — nunca en
-- `method`, nunca afecta movement_id/receipt_id/workspace_id/actor/amount/
-- currency/allocations/suggestion_scope/locks/idempotencia. Sin cambios al
-- CHECK, sin RPC nueva, sin ampliar el esquema.
--
-- SEGURIDAD: mismo contrato que v2 — SECURITY INVOKER, search_path fijo, sin
-- SQL dinámico, EXECUTE solo para `service_role`. ADITIVA (CREATE OR REPLACE,
-- misma firma + 1 parámetro nuevo con DEFAULT al final). NO APLICAR sin
-- autorización explícita para ESTE archivo.

CREATE OR REPLACE FUNCTION public.confirm_bank_reconciliation_v1(
  p_workspace_id   uuid,
  p_movement_id    uuid,
  p_receipt_id     uuid,
  p_suggestion_id  uuid,
  p_allocations    jsonb,           -- [{ "invoice_id": uuid, "amount": numeric }, ...]
  p_applied_amount numeric(14,2) DEFAULT NULL,  -- importe del link (permite saldo sin aplicar)
  p_created_by     uuid DEFAULT NULL,
  p_metadata       jsonb DEFAULT '{}'::jsonb    -- NUEVO: { mode, selectedClientId, selectedReceiptId,
                                                 --          proposedClientId, proposedReceiptId, reason }
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
  v_metadata   jsonb := coalesce(p_metadata, '{}'::jsonb);
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
  IF v_mov.status = 'ignored' THEN RAISE EXCEPTION 'MOVEMENT_NOT_RECONCILABLE'; END IF;
  v_mov_amount := v_mov.amount;

  -- Recibo (opcional): bloquear, validar workspace y moneda. Sin cambios respecto a v2 —
  -- ya aceptaba cualquier recibo del workspace, nunca exigió que coincidiera con una
  -- sugerencia. La selección manual de recibo/cliente se valida en el adapter (TypeScript),
  -- antes de invocar esta RPC, no acá.
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

  -- Sugerencia: debe pertenecer al movimiento/workspace, estar en estado
  -- confirmable, y ser 'operational'. Sin cambios respecto a v2 — la RPC
  -- nunca exigió que p_receipt_id coincidiera con proposed_receipt_id acá.
  IF p_suggestion_id IS NOT NULL THEN
    PERFORM 1 FROM public.bank_reconciliation_suggestions
     WHERE id = p_suggestion_id AND workspace_id = p_workspace_id AND bank_movement_id = p_movement_id
       AND status IN ('generated','pending_review')
       AND suggestion_scope = 'operational';
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

  -- Crear el LINK CANÓNICO (fuente financiera única). `method` representa el
  -- MECANISMO financiero del link (siempre 'suggested_confirmed' cuando pasa
  -- por esta RPC vía sugerencia/recibo explícito), no el nivel de intervención
  -- humana en la UI. CORRECCIÓN (BANK-CONFIRM-RPC-V3-MIGRATION-CORRECTION-001):
  -- la v3 original derivaba `method='manual_reviewed'` de `p_metadata->>'mode'`,
  -- pero ese valor NO pertenece al CHECK real de esta columna
  -- (bank_movement_reconciliation_links_method_check admite únicamente
  -- 'manual'|'suggested_confirmed') — hubiera violado la constraint en cuanto
  -- se usara mode='manual_reviewed'. La distinción suggested/manual_reviewed
  -- vive EXCLUSIVAMENTE en reconciliation_events.metadata.mode (más abajo);
  -- nunca modifica la semántica financiera del link.
  INSERT INTO public.bank_movement_reconciliation_links
    (workspace_id, bank_movement_id, target_type, target_id, applied_amount, currency, direction, method, created_by)
  VALUES (
    p_workspace_id, p_movement_id, 'receipt', p_receipt_id::text, v_link_amt, v_mov.currency, 'inflow',
    'suggested_confirmed',
    p_created_by
  )
  RETURNING id INTO v_link_id;

  -- Aplicaciones a facturas: AGREGADAS por factura (dedup del JSON) y validando
  -- allocations EXISTENTES + NUEVAS ≤ saldo de cada factura (bloqueada).
  IF p_allocations IS NOT NULL AND jsonb_typeof(p_allocations) = 'array' THEN
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
  -- `proposed_client_id`/`proposed_receipt_id` NUNCA se tocan: quedan como evidencia
  -- inmutable de lo que el motor propuso originalmente, aunque la selección final
  -- (registrada en el evento de abajo, vía p_metadata) haya sido otra.
  IF p_suggestion_id IS NOT NULL THEN
    UPDATE public.bank_reconciliation_suggestions
       SET status='confirmed', confirmed_link_id=v_link_id, reviewed_by=p_created_by, reviewed_at=now()
     WHERE id=p_suggestion_id AND workspace_id=p_workspace_id AND status IN ('generated','pending_review');
  END IF;

  -- NUEVO respecto a v2: `metadata` ya no queda en '{}' por defecto — registra
  -- modo (suggested|manual_reviewed), selección final vs. propuesta original y
  -- motivo, sin exponer datos bancarios sensibles ni sobrescribir la sugerencia.
  INSERT INTO public.reconciliation_events (workspace_id, event_type, entity_type, entity_id, new_state, actor_user_id, metadata)
  VALUES (p_workspace_id, 'reconciliation_confirmed', 'link', v_link_id, 'active', p_created_by, v_metadata);

  RETURN jsonb_build_object(
    'linkId', v_link_id, 'idempotent', false,
    'appliedAmount', v_link_amt, 'allocatedAmount', v_alloc_sum, 'unappliedAmount', v_link_amt - v_alloc_sum);
END;
$$;

COMMENT ON FUNCTION public.confirm_bank_reconciliation_v1(uuid,uuid,uuid,uuid,jsonb,numeric,uuid,jsonb) IS
  'Confirma conciliación en UNA transacción (link + allocations agregadas por factura, sumas validadas con locks, idempotente). Acepta cualquier receipt_id del workspace (el "cliente" no es un concepto de esta RPC); p_metadata (nuevo, opcional) registra modo suggested/manual_reviewed + selección final para auditoría en reconciliation_events.metadata, sin sobrescribir la sugerencia original ni afectar bank_movement_reconciliation_links.method (siempre suggested_confirmed vía esta RPC). Solo confirma suggestion_scope=operational. Solo service_role. FASE BANK-MANUAL-CANONICAL-MATCH-SELECTION-001, corregida en BANK-CONFIRM-RPC-V3-MIGRATION-CORRECTION-001.';

-- Permisos: sin cambios (ya eran service_role-only desde v1), se re-declaran por completitud.
REVOKE ALL ON FUNCTION public.confirm_bank_reconciliation_v1(uuid,uuid,uuid,uuid,jsonb,numeric,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_bank_reconciliation_v1(uuid,uuid,uuid,uuid,jsonb,numeric,uuid,jsonb) TO service_role;

-- ROLLBACK CONCEPTUAL (no ejecutar aquí): restaurar el cuerpo de la v2
-- (supabase/migrations/20260722130000_bank_reconciliation_confirm_rpc_v2.sql)
-- vía otro CREATE OR REPLACE FUNCTION con la misma firma (sin p_metadata).
