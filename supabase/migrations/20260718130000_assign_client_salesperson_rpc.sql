-- ASSIGN-CLIENT-SALESPERSON-RPC-001 (HOTFIX comerciales · atomicidad)
--
-- Reemplaza el flujo NO atómico (UPDATE de A + INSERT de B como dos requests
-- PostgREST separados) por UNA sola transacción de base de datos: el cuerpo de
-- esta función corre dentro de la transacción del llamador, por lo que cualquier
-- RAISE/fallo hace ROLLBACK completo (no queda A cerrada sin B).
--
-- ADITIVA y NO DESTRUCTIVA. No borra ni migra datos. Sin DML, sin backfill.
-- SECURITY INVOKER: corre con los privilegios y RLS del usuario autenticado
-- (aislamiento por workspace conservado). El workspace SIEMPRE se deriva de
-- copilot_current_workspace_company_id() — nunca se acepta desde el cliente.
-- search_path fijo a 'public' (evita hijacking de resolución de objetos).
--
-- Garantías:
--   - una sola asignación activa por cliente (reforzada por el índice único
--     parcial sales_client_salespersons_ws_cust_open_uidx);
--   - historial preservado (cerrar = valid_to, nunca DELETE);
--   - idempotente A->A (no escribe);
--   - permite desasignar (cierra la vigente y no inserta);
--   - valida cliente y comercial (activo, mismo workspace);
--   - devuelve el nuevo estado canónico.

CREATE OR REPLACE FUNCTION public.copilot_assign_client_salesperson(
  p_customer_id    uuid,
  p_salesperson_id uuid,
  p_valid_from     date,
  p_assigned_by    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_ws        uuid;
  v_start     constant date := DATE '2026-07-01';
  v_from      date;
  v_open      record;
  v_close     date;
BEGIN
  v_ws := public.copilot_current_workspace_company_id();
  IF v_ws IS NULL THEN
    RAISE EXCEPTION 'NO_WORKSPACE' USING errcode = '42501';
  END IF;

  v_from := GREATEST(COALESCE(p_valid_from, CURRENT_DATE), v_start);
  IF v_from < v_start THEN
    RAISE EXCEPTION 'OUT_OF_RANGE';
  END IF;

  -- Cliente debe existir en el workspace.
  PERFORM 1 FROM public.proto_companies
   WHERE id = p_customer_id AND workspace_company_id = v_ws;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND';
  END IF;

  -- Comercial (si viene) debe existir, estar activo y ser del mismo workspace.
  IF p_salesperson_id IS NOT NULL THEN
    PERFORM 1 FROM public.sales_salespersons
     WHERE id = p_salesperson_id AND workspace_id = v_ws AND active IS NOT FALSE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SALESPERSON_NOT_FOUND';
    END IF;
  END IF;

  -- Bloquear la asignación vigente (si existe) para serializar cambios concurrentes.
  SELECT id, valid_from, salesperson_id
    INTO v_open
    FROM public.sales_client_salespersons
   WHERE workspace_id = v_ws AND customer_id = p_customer_id AND valid_to IS NULL
   FOR UPDATE;

  -- Idempotencia A->A: el comercial vigente ya es el pedido → sin escrituras.
  IF p_salesperson_id IS NOT NULL AND v_open.salesperson_id = p_salesperson_id THEN
    RETURN jsonb_build_object(
      'customerId', p_customer_id,
      'salespersonId', p_salesperson_id,
      'validFrom', v_open.valid_from,
      'changed', false
    );
  END IF;

  -- Cerrar la vigente (nunca borrar): mismo día si validFrom <= su inicio, si no día previo.
  IF v_open.id IS NOT NULL THEN
    v_close := CASE WHEN v_from <= v_open.valid_from THEN v_open.valid_from ELSE v_from - 1 END;
    UPDATE public.sales_client_salespersons
       SET valid_to = v_close, updated_at = now()
     WHERE id = v_open.id AND workspace_id = v_ws;
  END IF;

  -- Crear la nueva (si corresponde). Si esto falla, TODO se revierte (misma transacción).
  IF p_salesperson_id IS NOT NULL THEN
    INSERT INTO public.sales_client_salespersons
      (workspace_id, customer_id, salesperson_id, valid_from, valid_to, assigned_by, assigned_at)
    VALUES (v_ws, p_customer_id, p_salesperson_id, v_from, NULL, p_assigned_by, now());
  END IF;

  RETURN jsonb_build_object(
    'customerId', p_customer_id,
    'salespersonId', p_salesperson_id,
    'validFrom', v_from,
    'changed', true
  );
END;
$$;

COMMENT ON FUNCTION public.copilot_assign_client_salesperson(uuid, uuid, date, uuid) IS
  'Asigna/cambia/desasigna el comercial vigente de un cliente en UNA transacción (cierra la vigente e inserta la nueva atómicamente). SECURITY INVOKER, workspace desde sesión, idempotente A->A. HOTFIX.';

-- Permiso mínimo: solo usuarios autenticados (RLS sigue aplicando por ser INVOKER).
REVOKE ALL ON FUNCTION public.copilot_assign_client_salesperson(uuid, uuid, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.copilot_assign_client_salesperson(uuid, uuid, date, uuid) TO authenticated;

-- ROLLBACK CONCEPTUAL (no ejecutar aquí):
--   DROP FUNCTION IF EXISTS public.copilot_assign_client_salesperson(uuid, uuid, date, uuid);
-- Aditiva: si se revierte, el repositorio degrada al camino secuencial existente.
