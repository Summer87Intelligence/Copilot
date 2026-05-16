-- ZETA-13-01: Completeness Audit Engine
-- Registra comparaciones automáticas entre conteos Zeta vs conteos locales
-- Permite detectar pérdidas silenciosas de sincronización por entidad y período

CREATE TABLE IF NOT EXISTS zeta_completeness_audits (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity                text        NOT NULL CHECK (entity IN ('invoices', 'receipts', 'installments', 'contacts')),
  audit_scope           text        NOT NULL,          -- 'period:2026-05' | 'full' | 'month:5:2026'
  period_year           integer,
  period_month          integer,
  zeta_count            integer     NOT NULL DEFAULT 0,
  local_count           integer     NOT NULL DEFAULT 0,
  missing_registro_ids  text[]      NOT NULL DEFAULT '{}',   -- RegistroIds en Zeta pero no local
  orphan_registro_ids   text[]      NOT NULL DEFAULT '{}',   -- RegistroIds en local pero no en Zeta
  notes                 text,
  severity              text        NOT NULL DEFAULT 'ok' CHECK (severity IN ('ok', 'warning', 'critical')),
  auto_resync_triggered boolean     NOT NULL DEFAULT false,
  audited_at            timestamptz NOT NULL DEFAULT now()
);

-- Índice para consultas rápidas por workspace+entidad+scope+tiempo
CREATE INDEX IF NOT EXISTS idx_zeta_completeness_dedup
  ON zeta_completeness_audits (workspace_company_id, entity, audit_scope, audited_at DESC);

CREATE INDEX IF NOT EXISTS idx_zeta_completeness_workspace_entity
  ON zeta_completeness_audits (workspace_company_id, entity, audited_at DESC);

-- Índice parcial para alertas rápidas (solo non-ok)
CREATE INDEX IF NOT EXISTS idx_zeta_completeness_alerts
  ON zeta_completeness_audits (severity, audited_at DESC)
  WHERE severity != 'ok';

-- RLS: habilitado; service_role bypassa automáticamente en Supabase
ALTER TABLE zeta_completeness_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_can_select_completeness_audits" ON zeta_completeness_audits;
CREATE POLICY "authenticated_can_select_completeness_audits"
  ON zeta_completeness_audits FOR SELECT TO authenticated USING (true);
