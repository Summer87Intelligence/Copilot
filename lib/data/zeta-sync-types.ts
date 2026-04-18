/**
 * ZETA-02: tipos mínimos para estado de sync Zeta (corrida, modo, filas).
 */

export type ZetaSyncMode = "bootstrap" | "incremental";

export type ZetaSyncRunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "partial"
  | "cancelled";

export type ZetaWatermarkType = "opaque" | "cursor" | "timestamp" | "page";

/** Fila de `zeta_sync_state` (PK compuesta company_id + resource_flow). */
export type ZetaSyncStateRow = {
  company_id: string;
  resource_flow: string;
  watermark: string;
  watermark_type: ZetaWatermarkType;
  overlap_seconds: number | null;
  bootstrap_completed: boolean;
  last_success_at: string | null;
  last_success_run_id: string | null;
  last_run_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateZetaSyncRunInput = {
  resource_flow: string;
  sync_mode: ZetaSyncMode;
  status?: ZetaSyncRunStatus;
  overlap_from?: string | null;
  overlap_to?: string | null;
  idempotency_key?: string | null;
};

export type UpdateZetaSyncRunInput = {
  status?: ZetaSyncRunStatus;
  finished_at?: string | null;
  records_fetched?: number | null;
  records_processed?: number | null;
  error_summary?: string | null;
  error_code?: string | null;
  overlap_from?: string | null;
  overlap_to?: string | null;
};

export type UpsertZetaSyncStateInput = {
  resource_flow: string;
  watermark?: string;
  /**
   * Si es true, no altera `watermark` aunque venga `watermark` en el input
   * (preserva el valor ya persistido; útil si la corrida falló sin progreso de paginación).
   */
  preserve_watermark?: boolean;
  watermark_type?: ZetaWatermarkType;
  overlap_seconds?: number | null;
  bootstrap_completed?: boolean;
  last_success_at?: string | null;
  last_success_run_id?: string | null;
  last_run_id?: string | null;
};

export type InsertZetaSyncRawPayloadInput = {
  sync_run_id: string;
  resource_flow: string;
  chunk_index?: number;
  zeta_operation: string;
  http_status?: number | null;
  payload_json: unknown;
  request_fingerprint?: string | null;
};
