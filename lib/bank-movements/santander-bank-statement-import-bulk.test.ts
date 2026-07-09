import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  SANTANDER_USD_JULY_AUSZUG_FIXTURE,
  SANTANDER_UYU_JULY_AUSZUG_FIXTURE,
} from "@/lib/bank-movements/fixtures/santander-pdf-text.fixture";
import { buildSantanderBankStatementPreview } from "@/lib/bank-movements/santander-pdf-parser";
import {
  confirmSantanderBankStatementImport,
  confirmSantanderBankStatementImportsBulk,
} from "@/lib/bank-movements/santander-bank-statement-import-persist.server";

function previewBodyFromFixture(fixture: string) {
  const { movements_count: _mc, totals: _t, ...preview } = buildSantanderBankStatementPreview(fixture);
  return preview;
}

function createSupabaseMock() {
  const bankMovements: Record<string, unknown>[] = [];
  const imports: { id: string; row: Record<string, unknown> }[] = [];
  let importSeq = 0;

  function queryTable(table: string) {
    const filters: Record<string, unknown> = {};
    let mode: "select" | "insert" | null = null;
    let insertPayload: Record<string, unknown> | Record<string, unknown>[] | null = null;

    const builder = {
      select: () => {
        mode = "select";
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return builder;
      },
      insert: (row: Record<string, unknown> | Record<string, unknown>[]) => {
        mode = "insert";
        insertPayload = row;
        if (table === "bank_statement_imports") {
          return {
            select: () => ({
              single: async () => {
                importSeq += 1;
                const id = `import-${importSeq}`;
                const rows = Array.isArray(insertPayload) ? insertPayload : [insertPayload!];
                for (const item of rows) {
                  imports.push({ id, row: item });
                }
                return { data: { id }, error: null };
              },
            }),
          };
        }
        return {
          then: (
            resolve: (value: { error: null }) => void,
            reject?: (reason: unknown) => void
          ) => {
            try {
              const rows = Array.isArray(insertPayload) ? insertPayload : [insertPayload!];
              bankMovements.push(...rows);
              resolve({ error: null });
            } catch (error) {
              reject?.(error);
            }
          },
        };
      },
      then: (
        resolve: (value: { data: Record<string, unknown>[] | null; error: null }) => void,
        reject?: (reason: unknown) => void
      ) => {
        try {
          if (mode === "select" && table === "bank_movements") {
            const data = bankMovements.filter((row) =>
              Object.entries(filters).every(([column, value]) => row[column] === value)
            );
            resolve({ data, error: null });
            return;
          }
          if (mode === "insert" && table === "bank_movements" && insertPayload) {
            reject?.(new Error("bank_movements insert should use insert().then"));
            return;
          }
          resolve({ data: [], error: null });
        } catch (error) {
          reject?.(error);
        }
      },
    };

    return builder;
  }

  const supabase = {
    from: queryTable,
    _bankMovements: bankMovements,
    _imports: imports,
  };

  return supabase;
}

describe("confirmSantanderBankStatementImportsBulk", () => {
  const workspaceId = "11111111-1111-1111-1111-111111111111";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("crea un import por PDF e inserta movimientos separados", async () => {
    const supabase = createSupabaseMock();

    const result = await confirmSantanderBankStatementImportsBulk({
      supabase: supabase as never,
      workspaceId,
      importedBy: "user-1",
      previews: [
        { file_name: "uyu.pdf", preview: previewBodyFromFixture(SANTANDER_UYU_JULY_AUSZUG_FIXTURE) },
        { file_name: "usd.pdf", preview: previewBodyFromFixture(SANTANDER_USD_JULY_AUSZUG_FIXTURE) },
      ],
    });

    expect(result.imported_files_count).toBe(2);
    expect(result.inserted_count).toBe(5);
    expect(result.results).toHaveLength(2);
    expect(supabase._imports).toHaveLength(2);
    expect(supabase._bankMovements).toHaveLength(5);
    expect(
      supabase._bankMovements.some(
        (row) => row.currency === "UYU" && row.account_label === "Santander 000001211749 UYU"
      )
    ).toBe(true);
    expect(
      supabase._bankMovements.some(
        (row) => row.currency === "USD" && row.account_label === "Santander 005101107711 USD"
      )
    ).toBe(true);
  });

  it("segunda corrida bulk devuelve solo duplicados", async () => {
    const supabase = createSupabaseMock();
    const previews = [
      { file_name: "uyu.pdf", preview: previewBodyFromFixture(SANTANDER_UYU_JULY_AUSZUG_FIXTURE) },
      { file_name: "usd.pdf", preview: previewBodyFromFixture(SANTANDER_USD_JULY_AUSZUG_FIXTURE) },
    ];

    await confirmSantanderBankStatementImportsBulk({
      supabase: supabase as never,
      workspaceId,
      importedBy: "user-1",
      previews,
    });

    const second = await confirmSantanderBankStatementImportsBulk({
      supabase: supabase as never,
      workspaceId,
      importedBy: "user-1",
      previews,
    });

    expect(second.inserted_count).toBe(0);
    expect(second.skipped_duplicates_count).toBe(5);
    expect(second.results.every((r) => r.status === "duplicate")).toBe(true);
    expect(supabase._bankMovements).toHaveLength(5);
  });

  it("bulk parcial duplicado inserta solo el archivo nuevo", async () => {
    const supabase = createSupabaseMock();

    await confirmSantanderBankStatementImport({
      supabase: supabase as never,
      workspaceId,
      importedBy: "user-1",
      fileName: "uyu.pdf",
      preview: previewBodyFromFixture(SANTANDER_UYU_JULY_AUSZUG_FIXTURE),
    });

    const result = await confirmSantanderBankStatementImportsBulk({
      supabase: supabase as never,
      workspaceId,
      importedBy: "user-1",
      previews: [
        { file_name: "uyu.pdf", preview: previewBodyFromFixture(SANTANDER_UYU_JULY_AUSZUG_FIXTURE) },
        { file_name: "usd.pdf", preview: previewBodyFromFixture(SANTANDER_USD_JULY_AUSZUG_FIXTURE) },
      ],
    });

    expect(result.inserted_count).toBe(2);
    expect(result.skipped_duplicates_count).toBe(3);
    expect(result.results.find((r) => r.file_name === "uyu.pdf")?.status).toBe("duplicate");
    expect(result.results.find((r) => r.file_name === "usd.pdf")?.status).toBe("imported");
    expect(supabase._bankMovements).toHaveLength(5);
  });
});
