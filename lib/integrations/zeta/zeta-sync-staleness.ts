/**
 * Umbrales de staleness por `zeta_sync_state.resource_flow` (Sync Health / Cartera).
 * Pipeline Health usa `zeta_pipeline_runs` + `PIPELINE_EXPECTED_INTERVALS_MS`.
 */

export type ZetaSyncStalenessStatus = "ok" | "warning" | "critical" | "never_synced";

export const DEFAULT_SYNC_STALE_WARNING_HOURS = 24;
export const DEFAULT_SYNC_STALE_CRITICAL_HOURS = 72;

/** Horas sin `last_success_at` antes de WARN/CRIT por flujo. */
export const ZETA_SYNC_RESOURCE_STALE_HOURS: Record<
  string,
  { warningHours: number; criticalHours: number }
> = {
  // Tier A — cron cada 3 h: WARN 12 h (4× intervalo), CRIT 24 h
  zeta_collection_receipts_v1: { warningHours: 12, criticalHours: 24 },
  factura_cliente_saldos_pendientes: { warningHours: 12, criticalHours: 24 },
  zeta_saldos_pendientes_v1: { warningHours: 12, criticalHours: 24 },
  zeta_customer_vouchers_v1: { warningHours: 12, criticalHours: 24 },
  // Tier B — cron cada 6 h: WARN 18 h (3× intervalo), CRIT 48 h
  "zeta-sync-vendor-payments": { warningHours: 18, criticalHours: 48 },
};

export function resolveSyncResourceStalenessHours(resourceFlow: string): {
  warningHours: number;
  criticalHours: number;
} {
  const flow = resourceFlow.trim();
  return (
    ZETA_SYNC_RESOURCE_STALE_HOURS[flow] ?? {
      warningHours: DEFAULT_SYNC_STALE_WARNING_HOURS,
      criticalHours: DEFAULT_SYNC_STALE_CRITICAL_HOURS,
    }
  );
}

export function stalenessFromHoursForResourceFlow(
  hours: number | null,
  resourceFlow: string
): ZetaSyncStalenessStatus {
  if (hours === null) return "never_synced";
  const { warningHours, criticalHours } = resolveSyncResourceStalenessHours(resourceFlow);
  if (hours > criticalHours) return "critical";
  if (hours > warningHours) return "warning";
  return "ok";
}
