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
  /**
   * ZETA-08 — cuotas pendientes desde `RESTCuotasV1QueryCliente`.
   * Cron separado del de saldos para no acoplar fallos y permitir frecuencias
   * distintas (cuotas no cambian tan seguido como saldos).
   */
  CUOTAS: "zeta-sync-cuotas",
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
  /** NULL = run fleet (cron multi-workspace). Ver migración zeta-06-03. */
  workspace_company_id?: string | null;
  last_heartbeat_at?: string | null;
};

export type CreatePipelineRunInput = {
  pipeline_name: string;
  metadata?: Record<string, unknown> | null;
  /**
   * NULL/omitido = run de orchestración fleet (default crons Zeta).
   * UUID = futuro overlap por workspace.
   */
  workspace_company_id?: string | null;
};

/** Anti-overlap: por defecto solo compite con runs fleet (`workspace_company_id` IS NULL). */
export type FindActivePipelineRunWorkspaceScope =
  | "fleet"
  | { companyId: string };

export type FindActivePipelineRunOptions = {
  workspaceScope?: FindActivePipelineRunWorkspaceScope;
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
