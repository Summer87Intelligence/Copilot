-- FASE BANK-IDEMPOTENT-IMPORT-CLIENT-BANKING-HISTORY-001
-- Etapa 2: índice único parcial SOLO si no hay colisiones operativas.
-- Si hay colisiones, no falla la migración: deja evidencia en un NOTICE.

DO $$
DECLARE
  collision_count integer;
BEGIN
  SELECT count(*) INTO collision_count
  FROM (
    SELECT workspace_id, fingerprint_v1
    FROM public.bank_movements
    WHERE fingerprint_v1 IS NOT NULL
      AND excluded_from_operations IS NOT TRUE
      AND duplicate_of IS NULL
    GROUP BY workspace_id, fingerprint_v1
    HAVING count(*) > 1
  ) collisions;

  IF collision_count > 0 THEN
    RAISE NOTICE
      'bank_movements fingerprint unique index SKIPPED: % operational collision group(s). Run historical dedupe dry-run first.',
      collision_count;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS bank_movements_ws_fingerprint_v1_active_uidx
      ON public.bank_movements (workspace_id, fingerprint_v1)
      WHERE fingerprint_v1 IS NOT NULL
        AND excluded_from_operations IS NOT TRUE
        AND duplicate_of IS NULL;
  END IF;
END $$;
