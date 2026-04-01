/**
 * Idempotencia de iniciativas: misma empresa + fuente + disparador + día civil (UY).
 */

export type InitiativeDedupeFields = {
  company_name: string;
  source: string;
  trigger: string;
};

/** Normaliza texto para comparar sin falsos negativos por espacios. */
export function normalizeInitiativeDedupeFields(
  row: InitiativeDedupeFields
): InitiativeDedupeFields {
  const norm = (s: string) =>
    String(s ?? "")
      .trim()
      .replace(/\s+/g, " ");
  return {
    company_name: norm(row.company_name),
    source: norm(row.source),
    trigger: norm(row.trigger),
  };
}

/** Clave estable para Set/Map (campos ya normalizados). */
export function initiativeDedupeKey(row: InitiativeDedupeFields): string {
  const n = normalizeInitiativeDedupeFields(row);
  return `${n.company_name}\u0001${n.source}\u0001${n.trigger}`;
}

/**
 * Inicio y fin en ISO (UTC) del día calendario en America/Montevideo.
 * Uruguay no usa DST; el offset −03:00 es estable para medianoche local.
 */
export function startEndOfMontevideoDay(now: Date = new Date()): {
  start: string;
  end: string;
  ymd: string;
} {
  const tz = "America/Montevideo";
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const ymd = `${year}-${month}-${day}`;
  const start = new Date(`${ymd}T00:00:00-03:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString(), ymd };
}
