import { describe, expect, it } from "vitest";

import {
  collapseZeroNewImportRetries,
  resolveImportHistoryStats,
} from "@/lib/bank-movements/bank-import-history-display";
import type { BankStatementImport } from "@/lib/bank-movements/bank-movements-types";

function imp(partial: Partial<BankStatementImport> & Pick<BankStatementImport, "id">): BankStatementImport {
  return {
    workspace_id: "ws",
    bank_name: "Santander",
    account_label: "Santander UYU",
    file_name: "extracto.pdf",
    file_type: "pdf",
    imported_by: "Ana",
    imported_at: "2026-07-10T12:00:00Z",
    status: "parsed",
    row_count: 0,
    created_at: "2026-07-10T12:00:00Z",
    updated_at: "2026-07-10T12:00:00Z",
    ...partial,
  };
}

describe("bank-import-history-display", () => {
  it("resuelve leídos/nuevos/ya existentes desde metadata", () => {
    const stats = resolveImportHistoryStats(
      imp({
        id: "1",
        row_count: 5,
        metadata: {
          total_preview_count: 98,
          inserted_count: 0,
          already_exists_count: 98,
        },
      })
    );
    expect(stats).toMatchObject({
      read: 98,
      inserted: 0,
      alreadyExists: 98,
      actor: "Ana",
      retryCount: 1,
    });
  });

  it("agrupa reintentos del mismo archivo con 0 nuevos", () => {
    const rows = collapseZeroNewImportRetries([
      imp({
        id: "a",
        file_name: "julio.pdf",
        imported_at: "2026-07-11T10:00:00Z",
        metadata: { total_preview_count: 98, inserted_count: 0, already_exists_count: 98 },
      }),
      imp({
        id: "b",
        file_name: "julio.pdf",
        imported_at: "2026-07-10T10:00:00Z",
        metadata: { total_preview_count: 98, inserted_count: 0, already_exists_count: 98 },
      }),
      imp({
        id: "c",
        file_name: "junio.pdf",
        imported_at: "2026-06-01T10:00:00Z",
        metadata: { total_preview_count: 10, inserted_count: 10, already_exists_count: 0 },
      }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.id).toBe("a");
    expect(rows[0]?.retryCount).toBe(2);
    expect(rows[1]?.id).toBe("c");
    expect(rows[1]?.retryCount).toBe(1);
  });
});
