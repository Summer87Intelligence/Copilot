/**
 * Paginación segura sobre Supabase usando `.range(from, to)`.
 *
 * Por qué range y no limit+offset:
 *   `.range(from, to)` es PostgREST nativo → más eficiente que OFFSET en PG.
 *   Con OFFSET, cada página re-escanea las filas anteriores. range usa el cursor
 *   del índice cuando el ORDER BY está indexado (proto_invoices.id, receipt_date).
 *
 * Invariantes:
 *   - El caller DEBE incluir ORDER BY estable en queryPage (por id o equivalente).
 *   - pageSize recomendado: 1 000 (balance entre RTTs y payload size).
 *   - maxRows es un guard de seguridad, no el límite de negocio. Activa
 *     reachedMaxRows=true y corta el loop, SIN truncar silenciosamente.
 */

export const DEFAULT_PAGE_SIZE = 1_000;
export const DEFAULT_MAX_ROWS = 50_000;

export type FetchAllRowsResult<T> = {
  rows: T[];
  /** Cuántas páginas se emitieron a Supabase (incluyendo la última vacía si ocurrió). */
  pagesFetched: number;
  /** Alias de rows.length — cuántas filas se cargaron en total. */
  totalFetched: number;
  /** true si se cortó el loop por maxRows, no porque llegara al final real. */
  reachedMaxRows: boolean;
};

/**
 * Función de página: el caller construye la query base con todos los filtros
 * y orderings, y la paginator agrega `.range(from, to)` en cada iteración.
 *
 * Ejemplo:
 * ```ts
 * queryPage: (from, to) =>
 *   supabase.from("proto_invoices")
 *     .select("id, ...")
 *     .eq("workspace_company_id", wid)
 *     .order("id", { ascending: true })
 *     .range(from, to)
 * ```
 */
export type PageQueryFn<T> = (
  from: number,
  to: number
) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * Carga todas las filas de una query Supabase paginando por `.range(from, to)`.
 *
 * @throws Si la query retorna un error en cualquier página.
 */
export async function fetchAllRows<T>({
  queryPage,
  pageSize = DEFAULT_PAGE_SIZE,
  maxRows = DEFAULT_MAX_ROWS,
}: {
  queryPage: PageQueryFn<T>;
  pageSize?: number;
  maxRows?: number;
}): Promise<FetchAllRowsResult<T>> {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const safeMaxRows = Math.max(safePageSize, Math.floor(maxRows));

  const rows: T[] = [];
  let pagesFetched = 0;
  let reachedMaxRows = false;
  let from = 0;

  while (true) {
    const to = from + safePageSize - 1;
    const { data, error } = await queryPage(from, to);

    if (error) {
      throw new Error(error.message);
    }

    const page = data ?? [];
    pagesFetched++;
    rows.push(...page);

    // Last page: fewer rows than requested
    if (page.length < safePageSize) break;

    from += safePageSize;

    // Safety guard: stop before loading unbounded data
    if (rows.length >= safeMaxRows) {
      reachedMaxRows = true;
      break;
    }
  }

  return {
    rows,
    pagesFetched,
    totalFetched: rows.length,
    reachedMaxRows,
  };
}

/**
 * Variante "safe" que captura errores en lugar de lanzarlos.
 * Usar para fuentes opcionales (receipts, companies) donde la degradación
 * es preferible a reventar el handler.
 */
/** Alias explícito para integraciones Copilot (A-02 / FIX-8). */
export const fetchAllSupabaseRows = fetchAllRows;

export async function fetchAllRowsSafe<T>(opts: {
  queryPage: PageQueryFn<T>;
  pageSize?: number;
  maxRows?: number;
}): Promise<FetchAllRowsResult<T> & { fetchError: string | null }> {
  try {
    const result = await fetchAllRows<T>(opts);
    return { ...result, fetchError: null };
  } catch (e) {
    return {
      rows: [],
      pagesFetched: 0,
      totalFetched: 0,
      reachedMaxRows: false,
      fetchError: e instanceof Error ? e.message : String(e),
    };
  }
}
