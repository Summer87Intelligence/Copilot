import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DEDUPE_PAGE_SIZE,
  selectInitiativeDedupeFieldsForLocalDatePage,
} from "@/lib/data/engine-repository";
import {
  initiativeDedupeKey,
  normalizeInitiativeDedupeFields,
} from "@/lib/ai/initiative-dedupe";

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
    const { data, error } = await selectInitiativeDedupeFieldsForLocalDatePage(
      client,
      ymd,
      from,
      DEDUPE_PAGE_SIZE
    );

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

    if (rows.length < DEDUPE_PAGE_SIZE) break;
    from += DEDUPE_PAGE_SIZE;
  }

  return keys;
}
