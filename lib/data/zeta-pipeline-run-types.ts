/**
 * ZETA-06: Tipos para el registro de ejecuciones de cron pipelines Zeta.
 * Una fila por invocación de cron (nivel orchestración, no per-client).
 */

export type ZetaPipelineRunStatus =
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "partial";

export const ZETA_PIPELINE_NAMES = {
  SALDOS: "zeta-sync-saldos",
  VOUCHERS: "zeta-sync-vouchers",
  CONTACTS: "zeta-sync-contacts",
} as const;

export type ZetaPipelineName =
  (typeof ZETA_PIPELINE_NAMES)[keyof typeof ZETA_PIPELINE_NAMES];

/** Fila de `zeta_pipeline_runs` (nivel cron/orchestración). */
export type ZetaPipelineRunRow = {
  id: string;
  pipeline_name: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  status: ZetaPipelineRunStatus;
  rows_processed: number;
  rows_updated: number;
  rows_failed: number;
  error_summary: string | null;
  metadata: Record<string, unknown> | null;
};

export type CreatePipelineRunInput = {
  pipeline_name: string;
  metadata?: Record<string, unknown> | null;
};

export type UpdatePipelineRunInput = {
  status: ZetaPipelineRunStatus;
  finished_at?: string;
  duration_ms?: number;
  rows_processed?: number;
  rows_updated?: number;
  rows_failed?: number;
  error_summary?: string | null;
  metadata?: Record<string, unknown> | null;
};
