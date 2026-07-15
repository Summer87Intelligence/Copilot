/**
 * Modelo puro de paginación de tablas (client-side).
 *
 * Reusable por Clientes, Banco y la lista de Cobranza. Garantiza:
 *  - página siempre dentro de rango (nunca una página vacía por overflow),
 *  - conteos "Mostrando X–Y de N" consistentes,
 *  - reset determinista cuando cambian los filtros.
 */

export type PaginationState = { page: number; pageSize: number };

export type PaginationResult<T> = {
  /** Filas de la página actual (ya recortadas). */
  pageRows: T[];
  /** Página efectiva (clamp a [1, totalPages]). */
  safePage: number;
  totalPages: number;
  total: number;
  /** Índice 1-based del primer ítem visible (0 si no hay filas). */
  from: number;
  /** Índice 1-based del último ítem visible (0 si no hay filas). */
  to: number;
};

/** Recorta `rows` a la página pedida, corrigiendo páginas fuera de rango. */
export function paginate<T>(
  rows: readonly T[],
  page: number,
  pageSize: number
): PaginationResult<T> {
  const size = Math.max(1, Math.floor(pageSize));
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const start = (safePage - 1) * size;
  const end = Math.min(start + size, total);
  return {
    pageRows: rows.slice(start, end),
    safePage,
    totalPages,
    total,
    from: total === 0 ? 0 : start + 1,
    to: end,
  };
}

/**
 * Página a la que hay que ir cuando cambia un filtro/búsqueda. Siempre vuelve a
 * 1 para no dejar al usuario en una página que ya no existe con el nuevo conjunto.
 */
export function pageAfterFilterChange(): number {
  return 1;
}

/** Clamp de una página al total actual (para usar tras recomputar filas). */
export function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, Math.floor(page) || 1), Math.max(1, totalPages));
}
