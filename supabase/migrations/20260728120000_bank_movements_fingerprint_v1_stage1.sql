-- FASE BANK-IDEMPOTENT-IMPORT-CLIENT-BANKING-HISTORY-001
-- Etapa 1: columnas de identidad + promoción de duplicados históricos ya marcados.
-- NO crea el índice único todavía (puede haber colisiones no marcadas).

ALTER TABLE public.bank_movements
  ADD COLUMN IF NOT EXISTS fingerprint_v1 text,
  ADD COLUMN IF NOT EXISTS fingerprint_version integer,
  ADD COLUMN IF NOT EXISTS duplicate_of uuid REFERENCES public.bank_movements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS excluded_from_operations boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS normalized_description text;

COMMENT ON COLUMN public.bank_movements.fingerprint_v1 IS
  'Huella canónica bank_movement_fingerprint_v1 (PDF/Excel/CSV). Identidad del movimiento, no del archivo.';
COMMENT ON COLUMN public.bank_movements.fingerprint_version IS
  'Versión del algoritmo de fingerprint (actualmente 1).';
COMMENT ON COLUMN public.bank_movements.duplicate_of IS
  'Si no es null, esta fila es copia no operativa del movimiento canónico indicado.';
COMMENT ON COLUMN public.bank_movements.excluded_from_operations IS
  'true = no aparece en Operativos (Movimientos/Conciliación/totales). Reversible.';
COMMENT ON COLUMN public.bank_movements.normalized_description IS
  'Descripción normalizada para identidad/memoria; raw_description conserva el texto original.';

-- Promover marcas históricas de metadata (backfill reversible ya aplicado en prod).
UPDATE public.bank_movements
SET
  duplicate_of = CASE
    WHEN metadata ? 'duplicate_of'
      AND (metadata->>'duplicate_of') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (metadata->>'duplicate_of')::uuid
    ELSE duplicate_of
  END,
  excluded_from_operations = CASE
    WHEN metadata->>'duplicate_status' = 'duplicate_of_import' THEN true
    ELSE excluded_from_operations
  END,
  fingerprint_v1 = COALESCE(
    fingerprint_v1,
    NULLIF(metadata->>'fingerprint_v1', ''),
    NULLIF(metadata->>'canonical_fingerprint', '')
  ),
  fingerprint_version = COALESCE(
    fingerprint_version,
    CASE
      WHEN metadata ? 'fingerprint_version'
        AND (metadata->>'fingerprint_version') ~ '^[0-9]+$'
      THEN (metadata->>'fingerprint_version')::integer
      WHEN COALESCE(NULLIF(metadata->>'fingerprint_v1', ''), NULLIF(metadata->>'canonical_fingerprint', '')) IS NOT NULL
      THEN 1
      ELSE NULL
    END
  )
WHERE
  metadata->>'duplicate_status' = 'duplicate_of_import'
  OR metadata ? 'fingerprint_v1'
  OR metadata ? 'canonical_fingerprint';

CREATE INDEX IF NOT EXISTS bank_movements_ws_fingerprint_v1_idx
  ON public.bank_movements (workspace_id, fingerprint_v1)
  WHERE fingerprint_v1 IS NOT NULL;

CREATE INDEX IF NOT EXISTS bank_movements_ws_excluded_ops_idx
  ON public.bank_movements (workspace_id, excluded_from_operations, movement_date DESC);

CREATE INDEX IF NOT EXISTS bank_movements_duplicate_of_idx
  ON public.bank_movements (duplicate_of)
  WHERE duplicate_of IS NOT NULL;
