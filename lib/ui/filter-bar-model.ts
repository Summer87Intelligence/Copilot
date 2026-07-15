/**
 * Modelo puro de `FilterBar` (DS-Core).
 *
 * Unifica el patrón de filtros disperso (Cartera select+date, Banco selects,
 * Cobranza chips, Alertas chips). Solo lógica de conteo/estado activo — el
 * layout vive en el TSX. Testeable en node.
 */

export type FilterValues = Record<string, string | null | undefined>;

/**
 * Cuenta cuántos filtros difieren de su valor por defecto.
 * Un filtro cuenta como activo si su valor no es vacío/nulo Y difiere del
 * default provisto para esa clave (si no hay default, cualquier valor no vacío
 * cuenta).
 */
export function countActiveFilters(values: FilterValues, defaults: FilterValues = {}): number {
  let count = 0;
  for (const key of Object.keys(values)) {
    const raw = values[key];
    const value = typeof raw === "string" ? raw.trim() : raw ?? "";
    if (value === "" || value == null) continue;
    const def = defaults[key];
    const normalizedDefault = typeof def === "string" ? def.trim() : def ?? "";
    if (value !== normalizedDefault) count += 1;
  }
  return count;
}

export function hasActiveFilters(values: FilterValues, defaults: FilterValues = {}): boolean {
  return countActiveFilters(values, defaults) > 0;
}

/** Reinicia los valores a sus defaults (o cadena vacía si no hay default). */
export function resetFilters(values: FilterValues, defaults: FilterValues = {}): FilterValues {
  const next: FilterValues = {};
  for (const key of Object.keys(values)) {
    next[key] = key in defaults ? defaults[key] : "";
  }
  return next;
}
