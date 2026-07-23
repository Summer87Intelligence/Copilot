import type { BankStatementImport } from "@/lib/bank-movements/bank-movements-types";

export type ImportHistoryDisplayRow = BankStatementImport & {
  retryCount: number;
};

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function importMeta(item: BankStatementImport): Record<string, unknown> {
  return (item.metadata ?? {}) as Record<string, unknown>;
}

/** Stats visibles en Historial → Importaciones. */
export function resolveImportHistoryStats(item: ImportHistoryDisplayRow | BankStatementImport): {
  read: number;
  inserted: number;
  alreadyExists: number;
  errors: number;
  actor: string | null;
  retryCount: number;
} {
  const meta = importMeta(item);
  const read =
    asFiniteNumber(meta.total_preview_count) ??
    asFiniteNumber(meta.read_count) ??
    item.row_count;
  const inserted = asFiniteNumber(meta.inserted_count) ?? item.row_count;
  const alreadyExists =
    asFiniteNumber(meta.already_exists_count) ??
    asFiniteNumber(meta.skipped_duplicates_count) ??
    0;
  const errors = asFiniteNumber(meta.error_count) ?? (item.status === "failed" ? 1 : 0);
  const retryCount = "retryCount" in item && typeof item.retryCount === "number" ? item.retryCount : 1;

  return {
    read,
    inserted,
    alreadyExists,
    errors,
    actor: item.imported_by?.trim() || null,
    retryCount,
  };
}

function fileKey(item: BankStatementImport): string {
  return (item.file_name?.trim() || item.bank_name || item.id).toLowerCase();
}

/**
 * Agrupa reintentos del mismo archivo cuando todos tuvieron 0 nuevos.
 * La lista de entrada se asume ordenada por imported_at desc.
 */
export function collapseZeroNewImportRetries(imports: BankStatementImport[]): ImportHistoryDisplayRow[] {
  const result: ImportHistoryDisplayRow[] = [];
  const zeroNewGroups = new Map<string, ImportHistoryDisplayRow>();

  for (const item of imports) {
    const stats = resolveImportHistoryStats(item);
    if (stats.inserted > 0) {
      result.push({ ...item, retryCount: 1 });
      continue;
    }

    const key = fileKey(item);
    const existing = zeroNewGroups.get(key);
    if (existing) {
      existing.retryCount += 1;
      continue;
    }

    const row: ImportHistoryDisplayRow = { ...item, retryCount: 1 };
    zeroNewGroups.set(key, row);
    result.push(row);
  }

  return result;
}
