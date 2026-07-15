/**
 * Modelo puro de ordenamiento de tablas.
 *
 * El consumer provee un accessor por columna (valor comparable). Soporta
 * strings (locale-insensitive lower) y números. Orden estable.
 */

export type SortDirection = "asc" | "desc";

export type SortState = { key: string | null; direction: SortDirection };

export type SortAccessor<T> = (row: T) => string | number | null | undefined;

/**
 * Nueva dirección al clickear una columna: si ya es la activa, alterna; si es
 * otra, arranca ascendente.
 */
export function nextSortState(current: SortState, key: string): SortState {
  if (current.key === key) {
    return { key, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key, direction: "asc" };
}

function isEmptyValue(v: string | number | null | undefined): boolean {
  return v == null || v === "";
}

/** Compara dos valores NO nulos (números o strings case-insensitive). */
function compareValues(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const as = String(a).toLowerCase();
  const bs = String(b).toLowerCase();
  if (as < bs) return -1;
  if (as > bs) return 1;
  return 0;
}

/**
 * Devuelve una copia ordenada (estable) según el accessor y la dirección.
 * Los valores vacíos/nulos van SIEMPRE al final, sin importar la dirección.
 */
export function sortRows<T>(
  rows: readonly T[],
  accessor: SortAccessor<T> | null,
  direction: SortDirection
): T[] {
  if (!accessor) return [...rows];
  const withIndex = rows.map((row, index) => ({ row, index }));
  withIndex.sort((x, y) => {
    const av = accessor(x.row);
    const bv = accessor(y.row);
    const aNull = isEmptyValue(av);
    const bNull = isEmptyValue(bv);
    if (aNull || bNull) {
      if (aNull && bNull) return x.index - y.index;
      return aNull ? 1 : -1; // nulos al final, independientes de la dirección
    }
    const base = compareValues(av as string | number, bv as string | number);
    const signed = direction === "asc" ? base : -base;
    return signed !== 0 ? signed : x.index - y.index;
  });
  return withIndex.map((w) => w.row);
}
