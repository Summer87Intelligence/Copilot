/** Flujo persistido en `zeta_sync_*` para saldos pendientes factura cliente. */
export const ZETA_PIPELINE_FLOW_SALDOS_PENDIENTES = "factura_cliente_saldos_pendientes";

export type ZetaSaldosPipelineMode = "bootstrap" | "incremental";

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
};
