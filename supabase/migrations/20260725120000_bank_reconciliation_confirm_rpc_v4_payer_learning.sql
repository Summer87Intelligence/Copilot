-- BANK-SIMPLE-RECONCILIATION-AND-PAYER-MEMORY-001
--
-- PREPARADA LOCALMENTE. NO APLICAR SIN AUTORIZACIÓN EXPLÍCITA.
--
-- Objetivo: confirmación financiera + reconciliation_event + aprendizaje de
-- pagador (`bank_payer_identities` / `client_payer_links`) en UNA misma
-- transacción. Las tablas ya existen en producción (migración
-- 20260719120000) y están vacías — nunca hubo escritor.
--
-- MISMA FIRMA que v3 (8 parámetros) — evita la sobrecarga ambigua de Postgres
-- vista al aplicar v3. El aprendizaje viaja en `p_metadata` (whitelist del
-- adapter) y, de forma defensiva, el cliente final se toma del recibo
-- confirmado (`proto_receipts.company_id`) cuando existe.
--
-- SCHEMA REAL (producción, auditado 2026-07-21):
--   bank_payer_identities:
--     UNIQUE INDEX bank_payer_identities_ws_hash_uidx (workspace_id, account_hash)
--     status IN (detected|active|inactive|conflicted)
--     fingerprint_strength IN (reference|account|document|bank_account_ref|name|none)
--   client_payer_links:
--     UNIQUE INDEX PARCIAL client_payer_links_active_uidx
--       (workspace_id, payer_identity_id, client_company_id)
--       WHERE status NOT IN (rejected, inactive)
--     status IN (detected|suggested|confirmed|learned|conflicted|inactive|rejected)
--
-- NO se agregan UNIQUE constraints nuevas: un UNIQUE total sobre
-- client_payer_links rompería el histórico rejected/inactive permitido por
-- el índice parcial. ON CONFLICT de identities usa el índice único existente.
--
-- IDEMPOTENCIA: early-return already_confirmed / already_linked NO incrementa
-- movement_count ni confirmations.
--
-- CONFLICTOS: si la misma identidad queda confirmed/learned para más de un
-- cliente activo, ambos vínculos pasan a conflicted (nunca autoselección).
-- Re-confirmar no limpia un status conflicted (queda para corrección humana).
--
-- reverse_bank_reconciliation_v1: SIN CAMBIOS.
-- Grants / SECURITY INVOKER / search_path: iguales a v3.

CREATE OR REPLACE FUNCTION public.confirm_bank_reconciliation_v1(
  p_workspace_id   uuid,
  p_movement_id    uuid,
  p_receipt_id     uuid,
  p_suggestion_id  uuid,
  p_allocations    jsonb,
  p_applied_amount numeric(14,2) DEFAULT NULL,
  p_created_by     uuid DEFAULT NULL,
  p_metadata       jsonb DEFAULT '{}'::jsonb
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
  -- Payer learning (misma transacción):
  v_payer              jsonb;
  v_payer_account_hash text;
  v_payer_client_id    uuid;
  v_payer_identity_id  uuid;
  v_existing_link_id   uuid;
  v_fp_strength        text;
  v_other_active       int;
BEGIN
  IF p_workspace_id IS NULL THEN RAISE EXCEPTION 'NO_WORKSPACE' USING errcode='42501'; END IF;
  v_session_ws := public.copilot_current_workspace_company_id();
  IF v_session_ws IS NOT NULL AND v_session_ws <> p_workspace_id THEN
    RAISE EXCEPTION 'WORKSPACE_MISMATCH' USING errcode='42501';
  END IF;

  IF p_created_by IS NOT NULL THEN
    PERFORM 1 FROM public.app_users
     WHERE id = p_created_by AND company_id = p_workspace_id AND is_active IS NOT FALSE;
    IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ACTOR' USING errcode='42501'; END IF;
  END IF;

  -- IDEMPOTENCIA 1: ya confirmada → sin re-aprender ni re-incrementar.
  IF p_suggestion_id IS NOT NULL THEN
    SELECT confirmed_link_id INTO v_link_id FROM public.bank_reconciliation_suggestions
     WHERE id = p_suggestion_id AND workspace_id = p_workspace_id AND status = 'confirmed';
    IF v_link_id IS NOT NULL THEN
      RETURN jsonb_build_object('linkId', v_link_id, 'idempotent', true, 'status', 'already_confirmed');
    END IF;
  END IF;

  SELECT id, workspace_id, abs(amount) AS amount, currency, direction, status
    INTO v_mov FROM public.bank_movements
   WHERE id = p_movement_id AND workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MOVEMENT_NOT_FOUND'; END IF;
  IF v_mov.direction <> 'inflow' THEN RAISE EXCEPTION 'NON_COMMERCIAL'; END IF;
  IF v_mov.status = 'ignored' THEN RAISE EXCEPTION 'MOVEMENT_NOT_RECONCILABLE'; END IF;
  v_mov_amount := v_mov.amount;

  IF p_receipt_id IS NOT NULL THEN
    SELECT id, workspace_company_id AS ws, amount,
           coalesce(currency_code, currency) AS currency,
           company_id
      INTO v_receipt FROM public.proto_receipts
     WHERE id = p_receipt_id AND workspace_company_id = p_workspace_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'RECEIPT_NOT_FOUND'; END IF;
    IF upper(v_receipt.currency) <> v_mov.currency THEN RAISE EXCEPTION 'CURRENCY_MISMATCH'; END IF;
  END IF;

  IF p_allocations IS NOT NULL AND jsonb_typeof(p_allocations) = 'array' THEN
    SELECT coalesce(sum((elem->>'amount')::numeric(14,2)), 0) INTO v_alloc_sum
      FROM jsonb_array_elements(p_allocations) elem;
  END IF;
  v_link_amt := coalesce(p_applied_amount, CASE WHEN p_receipt_id IS NOT NULL THEN v_receipt.amount ELSE v_alloc_sum END);
  IF NOT (v_link_amt > 0) THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  IF v_alloc_sum > v_link_amt + 0.01 THEN RAISE EXCEPTION 'ALLOCATIONS_EXCEED_LINK'; END IF;

  -- IDEMPOTENCIA 2: link activo idéntico → sin re-aprender ni re-incrementar.
  SELECT id, applied_amount INTO v_existing FROM public.bank_movement_reconciliation_links
   WHERE workspace_id = p_workspace_id AND bank_movement_id = p_movement_id
     AND target_type = 'receipt' AND target_id = p_receipt_id::text AND archived_at IS NULL
   FOR UPDATE;
  IF FOUND THEN
    IF abs(v_existing.applied_amount - v_link_amt) <= 0.01 THEN
      RETURN jsonb_build_object('linkId', v_existing.id, 'idempotent', true, 'status', 'already_linked');
    END IF;
    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';
  END IF;

  IF p_suggestion_id IS NOT NULL THEN
    PERFORM 1 FROM public.bank_reconciliation_suggestions
     WHERE id = p_suggestion_id AND workspace_id = p_workspace_id AND bank_movement_id = p_movement_id
       AND status IN ('generated','pending_review')
       AND suggestion_scope = 'operational';
    IF NOT FOUND THEN RAISE EXCEPTION 'SUGGESTION_NOT_CONFIRMABLE'; END IF;
  END IF;

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

  INSERT INTO public.bank_movement_reconciliation_links
    (workspace_id, bank_movement_id, target_type, target_id, applied_amount, currency, direction, method, created_by)
  VALUES (
    p_workspace_id, p_movement_id, 'receipt', p_receipt_id::text, v_link_amt, v_mov.currency, 'inflow',
    'suggested_confirmed',
    p_created_by
  )
  RETURNING id INTO v_link_id;

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

  IF p_suggestion_id IS NOT NULL THEN
    UPDATE public.bank_reconciliation_suggestions
       SET status='confirmed', confirmed_link_id=v_link_id, reviewed_by=p_created_by, reviewed_at=now()
     WHERE id=p_suggestion_id AND workspace_id=p_workspace_id AND status IN ('generated','pending_review');
  END IF;

  INSERT INTO public.reconciliation_events (workspace_id, event_type, entity_type, entity_id, new_state, actor_user_id, metadata)
  VALUES (p_workspace_id, 'reconciliation_confirmed', 'link', v_link_id, 'active', p_created_by, v_metadata);

  -- ── Aprendizaje de pagador (misma transacción) ─────────────────────────────
  -- Requiere accountHash en p_metadata.payer (derivado en el adapter desde
  -- señales estructuradas del movimiento — NUNCA desde una referencia TT/LR/TR/LE).
  -- Sin hash: no se escribe identidad (gap documentado: confirmación sin señal
  -- de identidad durable). Con hash + cliente del recibo: upsert atómico.
  v_payer := v_metadata->'payer';
  v_payer_account_hash := nullif(v_payer->>'accountHash', '');

  IF v_payer_account_hash IS NOT NULL THEN
    -- Cliente final: recibo confirmado (autoritativo) > selectedClientId > payer.clientCompanyId
    v_payer_client_id := NULL;
    IF p_receipt_id IS NOT NULL AND v_receipt.company_id IS NOT NULL THEN
      v_payer_client_id := v_receipt.company_id;
    ELSE
      BEGIN
        v_payer_client_id := nullif(coalesce(v_metadata->>'selectedClientId', v_payer->>'clientCompanyId'), '')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        v_payer_client_id := NULL;
      END;
    END IF;

    IF v_payer_client_id IS NOT NULL THEN
      PERFORM 1 FROM public.proto_companies
       WHERE id = v_payer_client_id AND workspace_company_id = p_workspace_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'PAYER_CLIENT_NOT_IN_WORKSPACE';
      END IF;
      -- Si hay recibo, el cliente del recibo debe coincidir con el seleccionado.
      IF p_receipt_id IS NOT NULL AND v_receipt.company_id IS NOT NULL
         AND v_receipt.company_id <> v_payer_client_id THEN
        RAISE EXCEPTION 'PAYER_CLIENT_RECEIPT_MISMATCH';
      END IF;
    END IF;

    v_fp_strength := coalesce(nullif(v_payer->>'fingerprintStrength', ''), 'name');
    IF v_fp_strength NOT IN ('reference','account','document','bank_account_ref','name','none') THEN
      v_fp_strength := 'name';
    END IF;

    INSERT INTO public.bank_payer_identities
      (workspace_id, account_hash, masked_account, normalized_name, original_name, bank_name,
       fingerprint_strength, usual_currency, first_seen_at, last_seen_at, movement_count, status)
    VALUES (
      p_workspace_id, v_payer_account_hash,
      nullif(v_payer->>'maskedAccount', ''), nullif(v_payer->>'normalizedName', ''),
      nullif(v_payer->>'originalName', ''), nullif(v_payer->>'bankName', ''),
      v_fp_strength,
      v_mov.currency, now(), now(), 1, 'active'
    )
    ON CONFLICT (workspace_id, account_hash) DO UPDATE SET
      last_seen_at    = now(),
      movement_count  = public.bank_payer_identities.movement_count + 1,
      masked_account  = coalesce(EXCLUDED.masked_account, public.bank_payer_identities.masked_account),
      normalized_name = coalesce(EXCLUDED.normalized_name, public.bank_payer_identities.normalized_name),
      original_name   = coalesce(public.bank_payer_identities.original_name, EXCLUDED.original_name),
      bank_name       = coalesce(public.bank_payer_identities.bank_name, EXCLUDED.bank_name),
      usual_currency  = coalesce(public.bank_payer_identities.usual_currency, EXCLUDED.usual_currency),
      updated_at      = now()
    RETURNING id INTO v_payer_identity_id;

    IF v_payer_client_id IS NOT NULL THEN
      -- Upsert sin UNIQUE total: solo filas activas (índice parcial).
      SELECT id INTO v_existing_link_id
        FROM public.client_payer_links
       WHERE workspace_id = p_workspace_id
         AND payer_identity_id = v_payer_identity_id
         AND client_company_id = v_payer_client_id
         AND status NOT IN ('rejected', 'inactive')
       ORDER BY updated_at DESC
       LIMIT 1
       FOR UPDATE;

      IF v_existing_link_id IS NOT NULL THEN
        UPDATE public.client_payer_links SET
          status = CASE
            WHEN status = 'conflicted' THEN 'conflicted'
            ELSE 'confirmed'
          END,
          confirmations    = confirmations + 1,
          reconciled_count = reconciled_count + 1,
          last_seen_at     = now(),
          confirmed_by     = p_created_by,
          confirmed_at     = now(),
          updated_at       = now()
         WHERE id = v_existing_link_id;
      ELSE
        INSERT INTO public.client_payer_links
          (workspace_id, payer_identity_id, client_company_id, confidence, status, source,
           confirmations, rejections, reconciled_count, first_seen_at, last_seen_at, confirmed_by, confirmed_at)
        VALUES (
          p_workspace_id, v_payer_identity_id, v_payer_client_id, 100, 'confirmed', 'engine',
          1, 0, 1, now(), now(), p_created_by, now()
        );
      END IF;

      SELECT count(*)::int INTO v_other_active
        FROM public.client_payer_links
       WHERE workspace_id = p_workspace_id
         AND payer_identity_id = v_payer_identity_id
         AND client_company_id <> v_payer_client_id
         AND status IN ('confirmed', 'learned', 'conflicted');

      IF v_other_active > 0 THEN
        UPDATE public.client_payer_links
           SET status = 'conflicted', updated_at = now()
         WHERE workspace_id = p_workspace_id
           AND payer_identity_id = v_payer_identity_id
           AND status IN ('confirmed', 'learned', 'conflicted');

        UPDATE public.bank_payer_identities
           SET status = 'conflicted', updated_at = now()
         WHERE id = v_payer_identity_id;

        INSERT INTO public.reconciliation_events
          (workspace_id, event_type, entity_type, entity_id, new_state, actor_user_id, metadata)
        VALUES (
          p_workspace_id, 'payer_link_conflicted', 'payer', v_payer_identity_id, 'conflicted', p_created_by,
          jsonb_build_object('clientCompanyId', v_payer_client_id, 'linkId', v_link_id)
        );
      ELSE
        INSERT INTO public.reconciliation_events
          (workspace_id, event_type, entity_type, entity_id, new_state, actor_user_id, metadata)
        VALUES (
          p_workspace_id, 'payer_link_confirmed', 'payer', v_payer_identity_id, 'confirmed', p_created_by,
          jsonb_build_object('clientCompanyId', v_payer_client_id, 'linkId', v_link_id)
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'linkId', v_link_id, 'idempotent', false,
    'appliedAmount', v_link_amt, 'allocatedAmount', v_alloc_sum, 'unappliedAmount', v_link_amt - v_alloc_sum,
    'payerIdentityId', v_payer_identity_id);
END;
$$;

COMMENT ON FUNCTION public.confirm_bank_reconciliation_v1(uuid,uuid,uuid,uuid,jsonb,numeric,uuid,jsonb) IS
  'Confirma conciliación (link + allocations + evento) y, cuando p_metadata.payer.accountHash está presente, fortalece bank_payer_identities/client_payer_links en la MISMA transacción. Firma idéntica a v3. method siempre suggested_confirmed. Idempotencia no re-incrementa aprendizaje. Conflicto multi-cliente → conflicted sin autoselección. Solo service_role. FASE BANK-SIMPLE-RECONCILIATION-AND-PAYER-MEMORY-001 — PREPARADA, NO APLICADA.';

REVOKE ALL ON FUNCTION public.confirm_bank_reconciliation_v1(uuid,uuid,uuid,uuid,jsonb,numeric,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_bank_reconciliation_v1(uuid,uuid,uuid,uuid,jsonb,numeric,uuid,jsonb) TO service_role;

-- ROLLBACK CONCEPTUAL (no ejecutar aquí): restaurar el cuerpo de la v3
-- (supabase/migrations/20260723120000_bank_reconciliation_confirm_rpc_v3.sql)
-- vía CREATE OR REPLACE FUNCTION con la misma firma.
