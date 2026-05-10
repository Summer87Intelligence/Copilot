/**
 * OBS-02: Factory de logger para cron routes.
 *
 * Drop-in para el patrón inline que usan zeta-sync-saldos, vouchers y contacts:
 *
 *   const log = (kind, extra?) => console.info(JSON.stringify({ ... }))
 *
 * Reemplaza con:
 *
 *   const log = createCronLogger(PIPELINE, cronRunId);
 *
 * El output JSON mantiene la misma estructura y es compatible con Vercel logs.
 */

import { createLogger } from "@/lib/observability/logger";

export type CronLogFn = (kind: string, extra?: Record<string, unknown>) => void;

/**
 * Crea un logger para cron routes con source y cron_run_id fijos.
 * Todos los eventos se emiten a nivel `info`.
 *
 * @param source - Nombre del pipeline (e.g., ZETA_PIPELINE_NAMES.SALDOS)
 * @param cronRunId - UUID de la corrida actual del cron
 */
export function createCronLogger(source: string, cronRunId: string): CronLogFn {
  const base = createLogger({ source, cron_run_id: cronRunId });

  return function cronLog(kind: string, extra?: Record<string, unknown>): void {
    base.info(kind, undefined, extra);
  };
}
