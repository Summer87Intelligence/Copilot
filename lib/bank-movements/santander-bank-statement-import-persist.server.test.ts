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
          update(payload: Record<string, unknown>) {
            return {
              eq(_col: string, id: string) {
                updates.push({ id, metadata: payload as Record<string, unknown> });
                return Promise.resolve({ error: null });
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
    const excelDescription = `${plannedFromExcel.description} DETALLE EXTRA PARSER`;
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

/**
 * Rastrea el ciclo de vida completo (insert + updates) de la fila en
 * bank_statement_imports para verificar que nunca queda "parsed" salvo que
 * el insert de movimientos haya terminado bien.
 */
function fakeClientWithImportLifecycleTracking(opts: {
  existingMovements: Row[];
  movementsInsertError?: { code?: string; message?: string } | null;
}) {
  const importCalls: Array<{ op: "insert" | "update"; payload: Record<string, unknown> }> = [];

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
          insert() {
            return Promise.resolve({ error: opts.movementsInsertError ?? null });
          },
        };
      }
      if (table === "bank_statement_imports") {
        return {
          insert(row: Record<string, unknown>) {
            importCalls.push({ op: "insert", payload: row });
            return {
              select() {
                return {
                  single() {
                    return Promise.resolve({ data: { id: "import-lifecycle-1" }, error: null });
                  },
                };
              },
            };
          },
          update(payload: Record<string, unknown>) {
            importCalls.push({ op: "update", payload });
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    _importCalls: () => importCalls,
  };
}

describe("confirmSantanderBankStatementImport — integridad de status (nunca 'parsed' falso positivo)", () => {
  it("con movimientos nuevos, el registro nace 'uploaded' y solo pasa a 'parsed' si el insert de movimientos termina bien", async () => {
    const preview = previewBodyFromFixtureForTest();
    const client = fakeClientWithImportLifecycleTracking({ existingMovements: [] });

    const result = await confirmSantanderBankStatementImport({
      supabase: client as never,
      workspaceId: WS,
      importedBy: "user-1",
      fileName: "extracto.pdf",
      preview,
    });

    expect(result.inserted_count).toBeGreaterThan(0);
    const calls = client._importCalls();
    expect(calls[0]).toEqual({ op: "insert", payload: expect.objectContaining({ status: "uploaded" }) });
    const finalize = calls.find((c) => c.op === "update");
    expect(finalize?.payload).toEqual({ status: "parsed", row_count: result.inserted_count });
  });

  it("sin movimientos nuevos (todo duplicado), el registro nace 'parsed' directamente: el proceso ya terminó", async () => {
    const preview = previewBodyFromFixtureForTest();
    // Reutiliza el propio dedupe_key/fingerprint_v1 calculado por el planner
    // para cada movimiento leído, así el plan no tiene nada nuevo que insertar
    // (todo "already_exists") sin depender de recomputar el hash a mano.
    const existingMovements = preview.movements.map((m, i) => {
      const p = buildMovementInsertFromPreview(m, {
        workspaceId: WS,
        accountNumber: preview.account_number,
        currencyCode: preview.currency_code,
        parserId: "santander_pdf_v1",
      });
      return {
        id: `existing-${i}`,
        movement_date: p.movement_date,
        amount: p.amount,
        currency: p.currency,
        direction: p.direction,
        bank_reference: p.bank_reference,
        description: p.description,
        account_label: "Santander 000001211749 UYU",
        bank_name: "Santander",
        metadata: {
          ...p.metadata,
          dedupe_key: p.dedupe_key,
          canonical_fingerprint: p.canonical_fingerprint,
          additional_sources: [],
        },
      };
    });

    const client = fakeClientWithImportLifecycleTracking({ existingMovements });

    const result = await confirmSantanderBankStatementImport({
      supabase: client as never,
      workspaceId: WS,
      importedBy: "user-1",
      fileName: "extracto.pdf",
      preview,
    });

    expect(result.inserted_count).toBe(0);
    const calls = client._importCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ op: "insert", payload: expect.objectContaining({ status: "parsed" }) });
  });

  it("si el insert de movimientos falla, el registro queda 'failed' y nunca llega a 'parsed'", async () => {
    const preview = previewBodyFromFixtureForTest();
    const client = fakeClientWithImportLifecycleTracking({
      existingMovements: [],
      movementsInsertError: { code: "23503", message: "insert failed" },
    });

    await expect(
      confirmSantanderBankStatementImport({
        supabase: client as never,
        workspaceId: WS,
        importedBy: "user-1",
        fileName: "extracto.pdf",
        preview,
      })
    ).rejects.toThrow("MOVEMENTS_INSERT_FAILED");

    const calls = client._importCalls();
    expect(calls[0]).toEqual({ op: "insert", payload: expect.objectContaining({ status: "uploaded" }) });
    expect(calls.some((c) => c.op === "update" && c.payload.status === "parsed")).toBe(false);
    const failedUpdate = calls.find((c) => c.op === "update");
    expect(failedUpdate?.payload).toEqual({ status: "failed" });
  });
});
