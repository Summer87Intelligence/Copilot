-- BANK-HISTORICAL-REVIEW-ACTIONS-001
--
-- Acciones humanas NO financieras sobre sugerencias de revisión bancaria:
--   marcar revisada (historical_review) · agregar nota (op/hist) · rechazar (op/hist).
--
-- Contrato de ciclo de vida (Modelo A): "revisada" NO agrega status nuevo — usa
-- `reviewed_at`/`reviewed_by` (columnas existentes). `status` permanece 'generated'.
-- "rechazada" usa `status='rejected'` (ya en el dominio). Eventos append-only.
--
-- ADITIVA e INMUTABLE. NO aplicar sin autorización. No borra ni reclasifica filas.
-- No toca movimientos/recibos/facturas. No reutiliza confirm/reverse financieras.
-- No crea links ni allocations. RPC transaccionales (suggestion + event atómicos).

-- ── 1. Ampliar dominio de event_type (aditivo) ───────────────────────────────
ALTER TABLE public.reconciliation_events
  DROP CONSTRAINT IF EXISTS reconciliation_events_event_type_check;
ALTER TABLE public.reconciliation_events
  ADD CONSTRAINT reconciliation_events_event_type_check
  CHECK (event_type IN (
    'movement_imported','duplicate_detected','suggestion_created','suggestion_changed',
    'suggestion_superseded','suggestion_reviewed','suggestion_note_added','suggestion_rejected',
    'reconciliation_confirmed','reconciliation_rejected','allocation_created','allocation_changed',
    'reconciliation_reversed','payer_link_confirmed','payer_link_rejected','payer_link_conflicted'
  ));

-- Índice para el contador "pendientes" (activo + sin revisar) por ámbito.
CREATE INDEX IF NOT EXISTS brs_ws_scope_reviewed_idx
  ON public.bank_reconciliation_suggestions (workspace_id, suggestion_scope, reviewed_at)
  WHERE status IN ('generated','pending_review');

-- Helper de validación de actor (app_user activo del workspace).
CREATE OR REPLACE FUNCTION public.bank_review_assert_actor(p_workspace_id uuid, p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public, pg_temp' AS $$
BEGIN
  IF p_workspace_id IS NULL THEN RAISE EXCEPTION 'NO_WORKSPACE'; END IF;
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_users WHERE id = p_actor AND company_id = p_workspace_id AND is_active IS NOT FALSE
  ) THEN
    RAISE EXCEPTION 'INVALID_ACTOR';
  END IF;
END $$;

-- ── 2. Marcar revisada (SOLO historical_review) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.review_bank_suggestion_v1(
  p_workspace_id uuid, p_suggestion_id uuid, p_actor uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public, pg_temp' AS $$
DECLARE v_row public.bank_reconciliation_suggestions;
BEGIN
  PERFORM public.bank_review_assert_actor(p_workspace_id, p_actor);
  SELECT * INTO v_row FROM public.bank_reconciliation_suggestions
    WHERE id = p_suggestion_id AND workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SUGGESTION_NOT_FOUND'; END IF;
  IF v_row.suggestion_scope <> 'historical_review' THEN RAISE EXCEPTION 'SCOPE_NOT_ALLOWED'; END IF;
  IF v_row.status NOT IN ('generated','pending_review') THEN RAISE EXCEPTION 'SUGGESTION_NOT_ACTIVE'; END IF;
  IF v_row.reviewed_at IS NOT NULL THEN
    RETURN jsonb_build_object('status','already_reviewed','reviewedAt', v_row.reviewed_at);
  END IF;

  UPDATE public.bank_reconciliation_suggestions
    SET reviewed_at = now(), reviewed_by = p_actor
    WHERE id = p_suggestion_id AND workspace_id = p_workspace_id
      AND reviewed_at IS NULL AND status IN ('generated','pending_review');
  IF NOT FOUND THEN RAISE EXCEPTION 'CONCURRENT_UPDATE'; END IF;

  INSERT INTO public.reconciliation_events
    (workspace_id, event_type, entity_type, entity_id, previous_state, new_state, reason, actor_user_id, metadata)
  VALUES (p_workspace_id, 'suggestion_reviewed', 'suggestion', p_suggestion_id, v_row.status, v_row.status,
          'human_review', p_actor,
          jsonb_build_object('suggestionScope', v_row.suggestion_scope, 'auditOnly', true,
                             'historicalAudit', true, 'maskedOnly', true));
  RETURN jsonb_build_object('status','reviewed','reviewedAt', now());
END $$;

-- ── 3. Rechazar (operational o historical_review) ────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_bank_suggestion_v1(
  p_workspace_id uuid, p_suggestion_id uuid, p_actor uuid, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public, pg_temp' AS $$
DECLARE v_row public.bank_reconciliation_suggestions; v_reason text;
BEGIN
  PERFORM public.bank_review_assert_actor(p_workspace_id, p_actor);
  v_reason := btrim(coalesce(p_reason, ''));
  IF length(v_reason) < 3 OR length(v_reason) > 500 THEN RAISE EXCEPTION 'REASON_INVALID'; END IF;

  SELECT * INTO v_row FROM public.bank_reconciliation_suggestions
    WHERE id = p_suggestion_id AND workspace_id = p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SUGGESTION_NOT_FOUND'; END IF;
  IF v_row.suggestion_scope NOT IN ('operational','historical_review') THEN RAISE EXCEPTION 'SCOPE_NOT_ALLOWED'; END IF;
  IF v_row.status = 'rejected' THEN
    RETURN jsonb_build_object('status','already_rejected');
  END IF;
  IF v_row.status NOT IN ('generated','pending_review') THEN RAISE EXCEPTION 'SUGGESTION_TERMINAL'; END IF;

  UPDATE public.bank_reconciliation_suggestions
    SET status = 'rejected', rejected_reason = v_reason, reviewed_at = now(), reviewed_by = p_actor
    WHERE id = p_suggestion_id AND workspace_id = p_workspace_id AND status IN ('generated','pending_review');
  IF NOT FOUND THEN RAISE EXCEPTION 'CONCURRENT_UPDATE'; END IF;

  INSERT INTO public.reconciliation_events
    (workspace_id, event_type, entity_type, entity_id, previous_state, new_state, reason, actor_user_id, metadata)
  VALUES (p_workspace_id, 'suggestion_rejected', 'suggestion', p_suggestion_id, v_row.status, 'rejected',
          'human_reject', p_actor,
          jsonb_build_object('suggestionScope', v_row.suggestion_scope,
                             'auditOnly', v_row.suggestion_scope <> 'operational',
                             'historicalAudit', v_row.suggestion_scope = 'historical_review', 'maskedOnly', true));
  RETURN jsonb_build_object('status','rejected');
END $$;

-- ── 4. Agregar nota (append-only; no muta la sugerencia) ─────────────────────
CREATE OR REPLACE FUNCTION public.add_bank_suggestion_note_v1(
  p_workspace_id uuid, p_suggestion_id uuid, p_actor uuid, p_note text, p_client_token text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public, pg_temp' AS $$
DECLARE v_row public.bank_reconciliation_suggestions; v_note text; v_token text;
BEGIN
  PERFORM public.bank_review_assert_actor(p_workspace_id, p_actor);
  v_note := btrim(coalesce(p_note, ''));
  IF length(v_note) < 1 OR length(v_note) > 1000 THEN RAISE EXCEPTION 'NOTE_INVALID'; END IF;
  v_token := nullif(btrim(coalesce(p_client_token, '')), '');

  SELECT * INTO v_row FROM public.bank_reconciliation_suggestions
    WHERE id = p_suggestion_id AND workspace_id = p_workspace_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SUGGESTION_NOT_FOUND'; END IF;
  IF v_row.suggestion_scope NOT IN ('operational','historical_review') THEN RAISE EXCEPTION 'SCOPE_NOT_ALLOWED'; END IF;

  -- Idempotencia por token de cliente (evita doble envío).
  IF v_token IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.reconciliation_events
    WHERE workspace_id = p_workspace_id AND entity_id = p_suggestion_id
      AND event_type = 'suggestion_note_added' AND metadata->>'clientToken' = v_token
  ) THEN
    RETURN jsonb_build_object('status','already_recorded');
  END IF;

  INSERT INTO public.reconciliation_events
    (workspace_id, event_type, entity_type, entity_id, previous_state, new_state, reason, actor_user_id, metadata)
  VALUES (p_workspace_id, 'suggestion_note_added', 'suggestion', p_suggestion_id, v_row.status, v_row.status,
          'human_note', p_actor,
          jsonb_build_object('suggestionScope', v_row.suggestion_scope,
                             'auditOnly', v_row.suggestion_scope <> 'operational',
                             'historicalAudit', v_row.suggestion_scope = 'historical_review',
                             'maskedOnly', true, 'note', v_note, 'clientToken', v_token));
  RETURN jsonb_build_object('status','noted');
END $$;

-- ── 5. Permisos: SOLO service_role (como confirm/reverse) ─────────────────────
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.review_bank_suggestion_v1(uuid,uuid,uuid)',
    'public.reject_bank_suggestion_v1(uuid,uuid,uuid,text)',
    'public.add_bank_suggestion_note_v1(uuid,uuid,uuid,text,text)',
    'public.bank_review_assert_actor(uuid,uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

-- ROLLBACK CONCEPTUAL (no ejecutar aquí):
--   DROP FUNCTION IF EXISTS public.review_bank_suggestion_v1(uuid,uuid,uuid);
--   DROP FUNCTION IF EXISTS public.reject_bank_suggestion_v1(uuid,uuid,uuid,text);
--   DROP FUNCTION IF EXISTS public.add_bank_suggestion_note_v1(uuid,uuid,uuid,text,text);
--   DROP FUNCTION IF EXISTS public.bank_review_assert_actor(uuid,uuid);
--   DROP INDEX IF EXISTS public.brs_ws_scope_reviewed_idx;
--   ALTER TABLE public.reconciliation_events DROP CONSTRAINT IF EXISTS reconciliation_events_event_type_check;
--   -- (restaurar el CHECK anterior de event_type sin los 3 nuevos tipos)
