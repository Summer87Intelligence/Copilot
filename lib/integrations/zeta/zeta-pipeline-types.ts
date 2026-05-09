/** Flujo persistido en `zeta_sync_*` para saldos pendientes factura cliente. */
export const ZETA_PIPELINE_FLOW_SALDOS_PENDIENTES = "factura_cliente_saldos_pendientes";

export type ZetaSaldosPipelineMode = "bootstrap" | "incremental";

/**
 * syncMode controls the reconciliation behavior after a successful full fetch:
 * - "incremental": normal run, no orphan reconciliation (default)
 * - "reconciliation_cleanup": forces bootstrap mode + runs orphan reconciliation
 *   to detect and safe-zero pending invoices no longer returned by Zeta
 */
export type ZetaSaldosSyncMode = "incremental" | "reconciliation_cleanup";

export type ZetaSaldosPipelineOptions = {
  /** Cliente Zeta (`Filters.ClienteCodigo`). */
  clienteCodigo: string;
  /** Cliente cartera en Copilot (`proto_companies.id`). */
  protoCompanyId: string;
  mode: ZetaSaldosPipelineMode;
  /** Máximo de páginas HTTP por corrida (restricción proveedor / fairness). Default 5. */
  maxPagesPerRun?: number;
  /** Pausa entre páginas (ms). Default 400. */
  pageDelayMs?: number;
  /** Ventana lógica de overlap registrada en corrida/estado (segundos). Default 604800 (7d). */
  overlapSeconds?: number;
  /** Opcional: dedupe de creación de corrida (ZETA-02). */
  idempotencyKey?: string | null;
  /**
   * "reconciliation_cleanup" forces bootstrap + orphan detection.
   * Defaults to "incremental" (no orphan reconciliation).
   */
  syncMode?: ZetaSaldosSyncMode;
};

export type ZetaSaldosPipelineResult = {
  ok: boolean;
  sync_run_id: string;
  pages_fetched: number;
  rows_normalized: number;
  rows_upserted: number;
  stopped_reason: "completed" | "max_pages" | "zeta_error" | "persist_error" | "aborted";
  error_summary?: string;
  last_page_processed: string;
  bootstrap_completed: boolean;
  /** Orphan reconciliation metrics (only populated when syncMode=reconciliation_cleanup or bootstrap+completed). */
  reconciliation?: {
    pending_invoices_checked: number;
    orphans_detected: number;
    warnings: number;
    auto_closed: number;
    db_errors: number;
  };
};
