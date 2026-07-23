/**
 * Paginación con reset declarativo al cambiar filtros/datos.
 * Evita setState dentro de useEffect: si la key cambió, la página efectiva es 1.
 */

export type KeyedPageState = {
  key: string;
  page: number;
};

/** Página efectiva: conserva `page` solo si `state.key` coincide con la key actual. */
export function resolveKeyedPage(state: KeyedPageState, currentKey: string): number {
  return state.key === currentKey ? Math.max(1, state.page) : 1;
}

/** Nuevo estado al navegar (siempre anclado a la key vigente). */
export function keyedPageAt(currentKey: string, page: number): KeyedPageState {
  return { key: currentKey, page: Math.max(1, Math.floor(page) || 1) };
}
