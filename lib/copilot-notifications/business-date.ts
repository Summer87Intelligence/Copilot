/**
 * Helpers para calcular fechas de negocio en timezone América/Montevideo.
 *
 * Usar estos helpers en lugar de toISOString().slice(0,10) para evitar
 * que el servidor (UTC) devuelva la fecha incorrecta cerca de medianoche
 * local (Uruguay = UTC-3, sin horario de verano desde 2015).
 */

export const BUSINESS_TIMEZONE = "America/Montevideo";

/**
 * Devuelve la fecha en el timezone de negocio como "YYYY-MM-DD".
 * Acepta `now` y `timeZone` para facilitar tests determinísticos.
 */
export function businessDateYmd(
  now: Date = new Date(),
  timeZone: string = BUSINESS_TIMEZONE
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Devuelve el mes en el timezone de negocio como "YYYY-MM".
 * Evita que UTC medianoche avance el mes antes que el negocio.
 */
export function businessMonthYm(
  now: Date = new Date(),
  timeZone: string = BUSINESS_TIMEZONE
): string {
  return businessDateYmd(now, timeZone).slice(0, 7);
}
