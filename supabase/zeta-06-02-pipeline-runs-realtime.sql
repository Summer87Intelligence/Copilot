-- ============================================================
-- ZETA-06-02: Habilitar Realtime en zeta_pipeline_runs
--
-- Requisito: Supabase Realtime con postgres_changes requiere
-- RLS habilitado en la tabla. El subscriber autenticado necesita
-- una política SELECT.
--
-- zeta_pipeline_runs contiene datos globales de operación
-- (no hay columna tenant/workspace). El acceso READ es seguro
-- para usuarios autenticados: solo contiene estado del pipeline,
-- nunca datos de clientes.
--
-- El cliente NUNCA lee datos sensibles directamente. El Realtime
-- actúa solo como trigger signal → refetch de /api/copilot/pipeline-health.
-- ============================================================

-- 1. Habilitar RLS (service_role lo bypasa → crons no se ven afectados)
ALTER TABLE public.zeta_pipeline_runs ENABLE ROW LEVEL SECURITY;

-- 2. Política READ para usuarios autenticados (datos globales, sin tenant filter)
CREATE POLICY "zeta_pipeline_runs_authenticated_read"
  ON public.zeta_pipeline_runs
  FOR SELECT
  TO authenticated
  USING (true);

-- 3. Agregar a la publicación de Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.zeta_pipeline_runs;
