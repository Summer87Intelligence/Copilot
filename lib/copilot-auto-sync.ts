/**
 * Helpers puros para el indicador de auto-sync Zeta en `/copilot/cartera`.
 *
 * NO ejecuta el cron. NO modifica syncs. Solo lee metadata ya disponible
 * (`report.syncStates`) y deriva:
 *   - cuál de los syncStates corresponde al cron de saldos
 *   - cuándo será aproximadamente la próxima corrida según la schedule
 *
 * El cron real está declarado en `vercel.json`:
 *   { "path": "/api/cron/zeta-sync-saldos", "schedule": "0 *​/2 * * *" }
 *
 * Vercel ejecuta los crons en UTC. Por eso `computeNextZetaSyncAt` razona en
 * UTC al ubicar el próximo múltiplo entero del intervalo y luego se delega
 * el formateo a hora local con `formatHHmm`.
 */

import type { SyncStateSummary } from "@/lib/copilot-financial-reconciliation";
import { pickMostRecentSync } from "@/lib/copilot-cartera-format";

/**
 * Intervalo del cron de saldos pendientes Zeta en horas.
 * Refleja `vercel.json → crons[0].schedule = "0 *​/2 * * *"`.
 *
 * Si en el futuro se cambia la schedule, ajustar acá y en `vercel.json`.
 */
export const ZETA_SALDOS_SYNC_INTERVAL_HOURS = 2;

/**
 * Devuelve el `SyncStateSummary` que corresponde al flujo de saldos pendientes
 * (el que actualiza `balance_amount` y por ende la cartera). Heurística:
 *   1. Coincidencia case-insensitive por substring `saldo`.
 *   2. Fallback: el sync más reciente disponible (`pickMostRecentSync`).
 *   3. Si no hay ninguno con timestamp válido → `null`.
 *
 * Pura: no toca DB, no hace fetch.
 */
export function pickZetaSaldosSyncState(
  syncStates: readonly SyncStateSummary[]
): SyncStateSummary | null {
  const saldos = syncStates.filter((s) =>
    s.resource_flow.toLowerCase().includes("saldo")
  );
  const fromSaldos = pickMostRecentSync(saldos);
  if (fromSaldos) return fromSaldos;
  return pickMostRecentSync(syncStates);
}

/**
 * Calcula el siguiente instante en el que el cron Vercel `0 *​/N * * *` se va a
 * disparar a partir de `now`. Razona en UTC porque Vercel ejecuta crons en UTC.
 *
 *   intervalHours = 2 → 00:00, 02:00, 04:00, 06:00, 08:00, 10:00, 12:00, 14:00, 16:00, 18:00, 20:00, 22:00 UTC
 *
 * Si `now` cae exactamente en un múltiplo, devuelve el SIGUIENTE bloque
 * (semántica "próxima ejecución estrictamente futura").
 *
 * Devuelve un `Date` que apunta al instante UTC; el caller decide cómo formatear.
 */
export function computeNextZetaSyncAt(
  now: Date,
  intervalHours: number = ZETA_SALDOS_SYNC_INTERVAL_HOURS
): Date {
  if (!Number.isFinite(intervalHours) || intervalHours <= 0) {
    throw new Error(
      `computeNextZetaSyncAt: intervalHours debe ser positivo. Recibido: ${intervalHours}`
    );
  }
  const next = new Date(now.getTime());
  next.setUTCMinutes(0, 0, 0);
  const h = next.getUTCHours();
  const nextSlotHour = Math.floor(h / intervalHours) * intervalHours + intervalHours;
  next.setUTCHours(nextSlotHour, 0, 0, 0);
  while (next.getTime() <= now.getTime()) {
    next.setUTCHours(next.getUTCHours() + intervalHours);
  }
  return next;
}

/**
 * Formatea un `Date` como `HH:mm` en hora local del usuario (es-UY).
 * Diseñado para microcopy compacto del indicador de próxima sync.
 *
 * Si el `Date` es inválido devuelve `"—"` para evitar mostrar "NaN:NaN".
 */
export function formatHHmm(date: Date): string {
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return "—";
  return new Intl.DateTimeFormat("es-UY", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
