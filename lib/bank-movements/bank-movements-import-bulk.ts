/**
 * Contratos y utilidades para importación masiva de extractos Santander PDF (Sprint E).
 */
import { randomUUID } from "node:crypto";

import { buildSantanderAccountLabel } from "@/lib/bank-movements/bank-movements-import-api";
import type { SantanderBankStatementPreview } from "@/lib/bank-movements/santander-pdf-parser";

export type CurrencyBulkTotals = {
  inflows: number;
  outflows: number;
  net: number;
  movements_count: number;
};

export type BulkPreviewReadyItem = SantanderBankStatementPreview & {
  client_preview_id: string;
  file_name: string;
  status: "ready";
  account_label: string;
};

export type BulkPreviewErrorItem = {
  file_name: string;
  status: "error";
  error: string;
};

export type BulkPreviewData = {
  files_count: number;
  parsed_count: number;
  failed_count: number;
  total_movements_count: number;
  totals_by_currency: {
    UYU: CurrencyBulkTotals;
    USD: CurrencyBulkTotals;
  };
  previews: BulkPreviewReadyItem[];
  errors: BulkPreviewErrorItem[];
};

export type BulkConfirmResultItem = {
  file_name: string;
  import_id: string;
  inserted_count: number;
  skipped_duplicates_count: number;
  total_preview_count: number;
  status: "imported" | "duplicate";
};

export type BulkConfirmErrorItem = {
  file_name: string;
  status: "error";
  error: string;
};

export type BulkConfirmData = {
  files_count: number;
  imported_files_count: number;
  failed_files_count: number;
  total_preview_count: number;
  inserted_count: number;
  skipped_duplicates_count: number;
  results: BulkConfirmResultItem[];
  errors: BulkConfirmErrorItem[];
};

export function emptyCurrencyTotals(): CurrencyBulkTotals {
  return { inflows: 0, outflows: 0, net: 0, movements_count: 0 };
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function addPreviewToCurrencyTotals(
  totals: CurrencyBulkTotals,
  preview: Pick<SantanderBankStatementPreview, "currency_code" | "totals" | "movements_count">
): CurrencyBulkTotals {
  return {
    inflows: roundMoney(totals.inflows + preview.totals.inflows),
    outflows: roundMoney(totals.outflows + preview.totals.outflows),
    net: roundMoney(totals.net + preview.totals.net),
    movements_count: totals.movements_count + preview.movements_count,
  };
}

export function buildBulkPreviewReadyItem(
  fileName: string,
  preview: SantanderBankStatementPreview
): BulkPreviewReadyItem {
  return {
    ...preview,
    client_preview_id: randomUUID(),
    file_name: fileName,
    status: "ready",
    account_label: buildSantanderAccountLabel(preview.account_number, preview.currency_code),
  };
}

export function collectBankStatementImportFilesFromFormData(formData: FormData): File[] {
  const seen = new Set<File>();
  const files: File[] = [];

  for (const key of ["files", "file"] as const) {
    for (const entry of formData.getAll(key)) {
      if (entry instanceof File && entry.size > 0 && !seen.has(entry)) {
        seen.add(entry);
        files.push(entry);
      }
    }
  }

  return files;
}

/** @deprecated Use collectBankStatementImportFilesFromFormData */
export function collectPdfFilesFromFormData(formData: FormData): File[] {
  return collectBankStatementImportFilesFromFormData(formData);
}

export function resolveImportFileStatus(
  insertedCount: number,
  skippedDuplicatesCount: number
): "imported" | "duplicate" {
  return insertedCount > 0 ? "imported" : skippedDuplicatesCount > 0 ? "duplicate" : "imported";
}
