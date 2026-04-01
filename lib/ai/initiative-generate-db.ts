import type { SupabaseClient } from "@supabase/supabase-js";

import {
  initiativeDedupeKey,
  normalizeInitiativeDedupeFields,
} from "@/lib/ai/initiative-dedupe";

const PAGE_SIZE = 1000;

/**
 * Paso B: claves ya presentes para `dedupe_local_date = ymd` (YYYY-MM-DD, Montevideo).
 * Alineado con el índice único en BD; paginado por si hay muchas filas en un día.
 */
export async function fetchExistingDedupeKeysForLocalDate(
  client: SupabaseClient,
  ymd: string
): Promise<Set<string>> {
  const keys = new Set<string>();
  let from = 0;

  for (;;) {
    const { data, error } = await client
      .from("initiatives")
      .select("company_name, source, trigger")
      .eq("dedupe_local_date", ymd)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    const rows = data ?? [];
    for (const r of rows) {
      keys.add(
        initiativeDedupeKey(
          normalizeInitiativeDedupeFields({
            company_name: String(
              (r as { company_name?: string }).company_name ?? ""
            ),
            source: String((r as { source?: string }).source ?? ""),
            trigger: String((r as { trigger?: string }).trigger ?? ""),
          })
        )
      );
    }

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return keys;
}
