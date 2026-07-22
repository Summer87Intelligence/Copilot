import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { confirmSantanderBankStatementImport } = await import(
  "@/lib/bank-movements/santander-bank-statement-import-persist.server"
);
const { buildMovementDedupeKey, buildMovementInsertFromPreview } = await import(
  "@/lib/bank-movements/santander-bank-statement-import-service"
);
const { SANTANDER_UYU_JULY_AUSZUG_FIXTURE } = await import(
  "@/lib/bank-movements/fixtures/santander-pdf-text.fixture"
);
const { buildSantanderBankStatementPreview } = await import("@/lib/bank-movements/santander-pdf-parser");

function previewBodyFromFixtureForTest() {
  const { movements_count: _mc, totals: _t, ...preview } =
    buildSantanderBankStatementPreview(SANTANDER_UYU_JULY_AUSZUG_FIXTURE);
  return preview;
}

const WS = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

type Row = Record<string, unknown>;

/**
 * FASE BANK-GLOBAL-MOVEMENT-RECEIPT-INVOICE-INTEGRITY-AUDIT-AND-CORRECTION-001
 * Fake mínimo suficiente para `confirmSantanderBankStatementImport`: lectura
 * de existentes, insert de `bank_statement_imports` (con .select().single()),
 * insert de `bank_movements`, y update de metadata sobre una fila existente.
 */
function fakeClient(opts: { existingMovements: Row[] }) {
  const updates: Array<{ id: string; metadata: Record<string, unknown> }> = [];
  const inserted: Row[] = [];

  return {
    from(table: string) {
      if (table === "bank_movements") {
        return {
          select() {
            return {
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => Promise.resolve({ data: opts.existingMovements, error: null }),
                  }),
                }),
              }),
            };
          },
          insert(rows: Row[]) {
            inserted.push(...rows);
            return Promise.resolve({ error: null });
          },
          update(payload: { metadata: Record<string, unknown> }) {
            return {
              eq(_col: string, id: string) {
                updates.push({ id, metadata: payload.metadata });
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      if (table === "bank_statement_imports") {
        return {
          insert() {
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({ data: { id: "import-new-1" }, error: null });
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    _inserted: () => inserted,
    _updates: () => updates,
  };
}

describe("confirmSantanderBankStatementImport — evidencia cross-parser (FASE BANK-GLOBAL-...)", () => {
  it("no inserta una segunda fila operativa para la misma operación real ya vista por Excel; registra el PDF como evidencia sobre la fila existente", async () => {
    const preview = previewBodyFromFixtureForTest();
    const movement = preview.movements[0]!;
    const plannedFromExcel = buildMovementInsertFromPreview(movement, {
      workspaceId: WS,
      accountNumber: preview.account_number,
      currencyCode: preview.currency_code,
      parserId: "santander_excel_consolidated_v1",
    });
    const excelDescription = `${plannedFromExcel.description} -- 1 of 7 --`;
    const excelDedupeKey = buildMovementDedupeKey({
      workspaceId: WS,
      bankName: "Santander",
      accountNumber: preview.account_number,
      currency: plannedFromExcel.currency,
      movementDate: plannedFromExcel.movement_date,
      bankReference: plannedFromExcel.bank_reference,
      amount: plannedFromExcel.amount,
      description: excelDescription,
    });

    const client = fakeClient({
      existingMovements: [
        {
          id: "existing-excel-row",
          movement_date: plannedFromExcel.movement_date,
          amount: plannedFromExcel.amount,
          currency: plannedFromExcel.currency,
          direction: plannedFromExcel.direction,
          bank_reference: plannedFromExcel.bank_reference,
          description: excelDescription,
          account_label: "Santander 000001211749 UYU",
          bank_name: "Santander",
          metadata: {
            ...plannedFromExcel.metadata,
            dedupe_key: excelDedupeKey,
            canonical_fingerprint: plannedFromExcel.canonical_fingerprint,
            additional_sources: [],
          },
        },
      ],
    });

    const result = await confirmSantanderBankStatementImport({
      supabase: client as never,
      workspaceId: WS,
      importedBy: "user-1",
      fileName: "umsatz (6) (1).pdf",
      preview,
    });

    expect(result.cross_parser_duplicates_count).toBeGreaterThanOrEqual(1);
    const insertedRefs = client._inserted().map((r) => r.bank_reference);
    expect(insertedRefs).not.toContain(plannedFromExcel.bank_reference);

    const update = client._updates().find((u) => u.id === "existing-excel-row");
    expect(update).toBeDefined();
    const sources = update?.metadata.additional_sources as Array<Record<string, unknown>>;
    expect(sources.length).toBe(1);
    expect(sources[0]!.file_name).toBe("umsatz (6) (1).pdf");
    expect(sources[0]!.parser).toBe("santander_pdf_v1");
  });
});
