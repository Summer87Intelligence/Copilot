import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

function resolvePageSize(): number {
  const raw = process.env.ZETA_CRON_ACTIVE_WORKSPACE_PAGE_SIZE;
  if (!raw) return DEFAULT_PAGE_SIZE;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(n, MAX_PAGE_SIZE);
}

/**
 * Una página de `public.companies.id` activas, orden determinístico por `id`.
 * `afterId`: exclusivo; null = primera página. No carga más de `pageSize+1` filas.
 */
export async function fetchActiveWorkspaceIdPage(
  supabase: SupabaseClient,
  afterId: string | null,
  pageSize: number = resolvePageSize()
): Promise<{ ids: string[]; nextAfterId: string | null }> {
  const take = pageSize + 1;
  let q = supabase
    .from("companies")
    .select("id")
    .eq("status", "active")
    .order("id", { ascending: true })
    .limit(take);
  if (afterId) {
    q = q.gt("id", afterId);
  }
  const { data, error } = await q;
  if (error) {
    throw new Error(`fetchActiveWorkspaceIdPage: ${error.message}`);
  }
  const rows = (data ?? []) as { id: string }[];
  if (rows.length === 0) {
    return { ids: [], nextAfterId: null };
  }
  const hasMore = rows.length > pageSize;
  const slice = hasMore ? rows.slice(0, pageSize) : rows;
  const lastId = slice[slice.length - 1]!.id;
  return {
    ids: slice.map((r) => r.id),
    nextAfterId: hasMore ? lastId : null,
  };
}
