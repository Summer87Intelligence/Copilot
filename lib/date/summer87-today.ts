/**
 * Helpers de fecha oficiales para Summer87.
 *
 * Regla: toda clasificación comercial de cliente (Al día / Con deuda /
 * Atrasado / Crítico) debe medirse contra la fecha local de Montevideo
 * (UTC−3). El runtime puede correr en UTC (Vercel SSR) o en zona del
 * navegador; ninguno de esos es correcto para tomar decisiones de negocio.
 *
 * Implementación: usa `Intl.DateTimeFormat` con `timeZone: 'America/Montevideo'`
 * que aplica las reglas reales del zoneinfo (sin DST en UY desde 2015, pero
 * delega en el motor para ser robusto ante cambios futuros).
 *
 * NO usar `new Date().toISOString().slice(0,10)` — corre en UTC.
 * NO usar `Date.prototype.getFullYear()` directamente — usa zona del runtime.
 */

const MONTEVIDEO_TZ = "America/Montevideo";

const ymdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: MONTEVIDEO_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Fecha actual en Montevideo (YYYY-MM-DD).
 * Idempotente en SSR vs cliente: ambos devuelven la misma fecha para el
 * mismo instante absoluto.
 */
export function todayYmdMontevideo(): string {
  return formatYmdMontevideo(new Date());
}

/**
 * Fecha de Montevideo (YYYY-MM-DD) correspondiente a un instante dado.
 * Útil para tests y para call sites con `now` inyectado.
 */
export function formatYmdMontevideo(instant: Date | number): string {
  const d = instant instanceof Date ? instant : new Date(instant);
  // Intl "en-CA" produce "YYYY-MM-DD" — formato directo, sin parsing.
  return ymdFormatter.format(d);
}
