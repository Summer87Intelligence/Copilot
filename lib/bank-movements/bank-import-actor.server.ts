import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildBankImportActorView,
  isBankImportActorUuid,
  type BankImportActorView,
} from "@/lib/bank-movements/bank-import-actor";
import type { BankStatementImport } from "@/lib/bank-movements/bank-movements-types";
import { resolveAppUsersById } from "@/lib/bank/canonical/resolve-app-users.server";

/**
 * Enriquece filas de `bank_statement_imports` con `actor` listo para UI.
 * Un solo batch a `app_users` (sin N+1). Conserva `imported_by` técnico.
 */
export async function enrichBankStatementImportsWithActors(
  supabase: SupabaseClient,
  rows: BankStatementImport[]
): Promise<Array<BankStatementImport & { actor: BankImportActorView }>> {
  const uuidIds = Array.from(
    new Set(
      rows
        .map((row) => (typeof row.imported_by === "string" ? row.imported_by.trim() : ""))
        .filter((id) => id.length > 0 && isBankImportActorUuid(id))
    )
  );

  const resolved = await resolveAppUsersById(supabase, uuidIds);

  return rows.map((row) => {
    const importedBy = typeof row.imported_by === "string" ? row.imported_by : null;
    const key = importedBy?.trim() ?? "";
    const profile = key && isBankImportActorUuid(key) ? resolved.get(key) : null;
    const actor = buildBankImportActorView({
      importedBy,
      metadata: row.metadata ?? null,
      resolved: profile
        ? {
            id: profile.id,
            fullName: profile.fullName,
            email: profile.email,
            deletedAt: profile.deletedAt,
            isActive: profile.isActive,
          }
        : null,
    });
    return { ...row, actor };
  });
}
