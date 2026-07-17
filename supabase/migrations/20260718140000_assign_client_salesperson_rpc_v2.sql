-- ASSIGN-CLIENT-SALESPERSON-RPC-002 (HOTFIX PROD · workspace desde servidor)
--
-- CAUSA DEL 500 EN PRODUCCIÓN: la app usa un cliente Supabase con SERVICE_ROLE
-- (auth propia por cookie de sesión Copilot, no Supabase Auth). Bajo service_role
-- `auth.uid()`/`auth.jwt()` son NULL, por lo que `copilot_current_workspace_company_id()`
-- devuelve NULL y la RPC v1 lanzaba NO_WORKSPACE en cada llamada.
--
-- Este es el MISMO patrón que usa el resto de las escrituras del servidor: el
-- workspace lo aporta el servidor (auth.ctx.tenantCompanyId, resuelto por la sesión
-- Copilot) — NUNCA el navegador (el payload solo trae customerId/salespersonId/
-- validFrom). Por eso la RPC pasa a recibir `p_workspace_id` del servidor de confianza.
--
-- Defensa en profundidad: si existiera una sesión Supabase-Auth real (workspace no
-- nulo) y NO coincide con p_workspace_id, se rechaza (WORKSPACE_MISMATCH). Bajo
-- service_role la sesión es nula y se confía en el workspace del servidor.
--
-- ADITIVA. Reemplaza la función v1 (misma responsabilidad, firma corregida). Sin
-- DML, sin backfill. SECURITY INVOKER, search_path fijo. Atomicidad intacta
-- (cierra la vigente e inserta la nueva en UNA transacción; rollback ante fallo).

-- La v1 (4 args) queda obsoleta: se elimina para no dejar overloads ambiguos.
DROP FUNCTION IF EXISTS public.copilot_assign_client_salesperson(uuid, uuid, date, uuid);

CREATE OR REPLACE FUNCTION public.copilot_assign_client_salesperson(
  p_workspace_id   uuid,
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
  v_start      constant date := DATE '2026-07-01';
  v_session_ws uuid;
  v_from       date;
  v_open       record;
  v_close      date;
BEGIN
  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'NO_WORKSPACE' USING errcode = '42501';
  END IF;

  -- Defensa: una sesión Supabase-Auth real no puede operar sobre otro workspace.
  v_session_ws := public.copilot_current_workspace_company_id();
  IF v_session_ws IS NOT NULL AND v_session_ws <> p_workspace_id THEN
    RAISE EXCEPTION 'WORKSPACE_MISMATCH' USING errcode = '42501';
  END IF;

  v_from := GREATEST(COALESCE(p_valid_from, CURRENT_DATE), v_start);
  IF v_from < v_start THEN
    RAISE EXCEPTION 'OUT_OF_RANGE';
  END IF;

  PERFORM 1 FROM public.proto_companies
   WHERE id = p_customer_id AND workspace_company_id = p_workspace_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND';
  END IF;

  IF p_salesperson_id IS NOT NULL THEN
    PERFORM 1 FROM public.sales_salespersons
     WHERE id = p_salesperson_id AND workspace_id = p_workspace_id AND active IS NOT FALSE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SALESPERSON_NOT_FOUND';
    END IF;
  END IF;

  SELECT id, valid_from, salesperson_id
    INTO v_open
    FROM public.sales_client_salespersons
   WHERE workspace_id = p_workspace_id AND customer_id = p_customer_id AND valid_to IS NULL
   FOR UPDATE;

  IF p_salesperson_id IS NOT NULL AND v_open.salesperson_id = p_salesperson_id THEN
    RETURN jsonb_build_object(
      'customerId', p_customer_id,
      'salespersonId', p_salesperson_id,
      'validFrom', v_open.valid_from,
      'changed', false
    );
  END IF;

  IF v_open.id IS NOT NULL THEN
    v_close := CASE WHEN v_from <= v_open.valid_from THEN v_open.valid_from ELSE v_from - 1 END;
    UPDATE public.sales_client_salespersons
       SET valid_to = v_close, updated_at = now()
     WHERE id = v_open.id AND workspace_id = p_workspace_id;
  END IF;

  IF p_salesperson_id IS NOT NULL THEN
    INSERT INTO public.sales_client_salespersons
      (workspace_id, customer_id, salesperson_id, valid_from, valid_to, assigned_by, assigned_at)
    VALUES (p_workspace_id, p_customer_id, p_salesperson_id, v_from, NULL, p_assigned_by, now());
  END IF;

  RETURN jsonb_build_object(
    'customerId', p_customer_id,
    'salespersonId', p_salesperson_id,
    'validFrom', v_from,
    'changed', true
  );
END;
$$;

COMMENT ON FUNCTION public.copilot_assign_client_salesperson(uuid, uuid, uuid, date, uuid) IS
  'Asigna/cambia/desasigna el comercial vigente de un cliente en UNA transacción. Workspace lo aporta el servidor (p_workspace_id, service_role), nunca el navegador. SECURITY INVOKER, idempotente A->A. HOTFIX v2.';

-- Permisos: authenticated (por si el cliente pasa a user-scoped) y service_role
-- (la app llama con service_role). Sin anon, sin public.
REVOKE ALL ON FUNCTION public.copilot_assign_client_salesperson(uuid, uuid, uuid, date, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.copilot_assign_client_salesperson(uuid, uuid, uuid, date, uuid) TO authenticated, service_role;

-- ROLLBACK CONCEPTUAL (no ejecutar aquí):
--   DROP FUNCTION IF EXISTS public.copilot_assign_client_salesperson(uuid, uuid, uuid, date, uuid);
-- El repositorio degrada al camino secuencial (service_role) si la función falta.
