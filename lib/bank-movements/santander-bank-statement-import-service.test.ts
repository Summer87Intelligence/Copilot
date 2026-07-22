import { describe, expect, it } from "vitest";

import { buildSantanderConsolidatedExcelPreview } from "@/lib/bank-movements/santander-excel-consolidated-parser";
import { bankStatementImportConfirmBodySchema } from "@/lib/bank-movements/bank-movements-import-api";
import { buildSantanderConsolidatedUyuFixtureBuffer } from "@/lib/bank-movements/fixtures/santander-excel-consolidated.fixture";
import {
  SANTANDER_USD_JULY_AUSZUG_FIXTURE,
  SANTANDER_UYU_JULY_AUSZUG_FIXTURE,
} from "@/lib/bank-movements/fixtures/santander-pdf-text.fixture";
import { buildSantanderBankStatementPreview } from "@/lib/bank-movements/santander-pdf-parser";
import {
  buildMovementDedupeKey,
  buildMovementInsertFromPreview,
  buildStatementImportRecord,
  canonicalFingerprintFromExistingRow,
  inferBankStatementImportFileType,
  inferBankStatementParserId,
  SANTANDER_EXCEL_CONSOLIDATED_PARSER_ID,
  planSantanderBankStatementImport,
  type ExistingBankMovementForDedupe,
} from "@/lib/bank-movements/santander-bank-statement-import-service";

const WS = "11111111-1111-1111-1111-111111111111";

function previewBodyFromFixture(fixture: string) {
  const { movements_count: _mc, totals: _t, ...preview } =
    buildSantanderBankStatementPreview(fixture);
  return preview;
}

describe("bankStatementImportConfirmBodySchema", () => {
  it("rechaza workspace_id del cliente", () => {
    const preview = previewBodyFromFixture(SANTANDER_UYU_JULY_AUSZUG_FIXTURE);
    const r = bankStatementImportConfirmBodySchema.safeParse({
      workspace_id: WS,
      file_name: "extracto.pdf",
      file_type: "application/pdf",
      preview,
    });
    expect(r.success).toBe(false);
  });

  it("rechaza movimientos vacíos", () => {
    const preview = previewBodyFromFixture(SANTANDER_UYU_JULY_AUSZUG_FIXTURE);
    const r = bankStatementImportConfirmBodySchema.safeParse({
      file_name: "extracto.pdf",
      file_type: "application/pdf",
      preview: { ...preview, movements: [] },
    });
    expect(r.success).toBe(false);
  });

  it("rechaza currency inválida", () => {
    const preview = previewBodyFromFixture(SANTANDER_UYU_JULY_AUSZUG_FIXTURE);
    const r = bankStatementImportConfirmBodySchema.safeParse({
      file_name: "extracto.pdf",
      file_type: "application/pdf",
      preview: { ...preview, currency_code: "EUR" },
    });
    expect(r.success).toBe(false);
  });

  it("acepta preview Excel con source_file opcional en movimientos", async () => {
    const excelPreview = await buildSantanderConsolidatedExcelPreview(buildSantanderConsolidatedUyuFixtureBuffer());
    const { movements_count: _mc, totals: _t, ...preview } = excelPreview;
    const r = bankStatementImportConfirmBodySchema.safeParse({
      file_name: "consolidado.xlsx",
      file_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      preview,
    });
    expect(r.success).toBe(true);
  });
});

describe("planSantanderBankStatementImport — UYU", () => {
  const preview = previewBodyFromFixture(SANTANDER_UYU_JULY_AUSZUG_FIXTURE);

  it("inserta todos los movimientos cuando no hay existentes", () => {
    const plan = planSantanderBankStatementImport(preview, [], WS);
    expect(plan.total_preview_count).toBe(3);
    expect(plan.to_insert).toHaveLength(3);
    expect(plan.skipped_duplicates_count).toBe(0);
    expect(plan.account_label).toBe("Santander 000001211749 UYU");
    expect(plan.to_insert.every((r) => r.status === "pending")).toBe(true);
    expect(plan.to_insert.every((r) => r.metadata.parser === "santander_pdf_v1")).toBe(true);
  });

  it("detecta ZETA -3721 con monto positivo y direction outflow", () => {
    const plan = planSantanderBankStatementImport(preview, [], WS);
    const zeta = plan.to_insert.find((r) => r.description.includes("ZETA"));
    expect(zeta).toMatchObject({
      movement_date: "2026-07-01",
      amount: 3721,
      currency: "UYU",
      direction: "outflow",
      bank_reference: "ZETA001",
    });
  });
});

describe("planSantanderBankStatementImport — USD", () => {
  const preview = previewBodyFromFixture(SANTANDER_USD_JULY_AUSZUG_FIXTURE);

  it("conserva currency USD y montos", () => {
    const plan = planSantanderBankStatementImport(preview, [], WS);
    expect(plan.account_label).toBe("Santander 005101107711 USD");
    const ingreso = plan.to_insert.find((r) => r.amount === 427);
    expect(ingreso?.currency).toBe("USD");
    expect(ingreso?.direction).toBe("inflow");
  });
});

describe("planSantanderBankStatementImport — alcance de cuenta EASY", () => {
  const businessPreview = previewBodyFromFixture(SANTANDER_UYU_JULY_AUSZUG_FIXTURE);

  it("bloquea cuenta personal (005205831977): 0 a insertar", () => {
    const plan = planSantanderBankStatementImport(
      { ...businessPreview, account_number: "005205831977" },
      [],
      WS
    );
    expect(plan.to_insert).toHaveLength(0);
    expect(plan.blocked?.scope).toBe("blocked_personal");
    expect(plan.total_preview_count).toBe(businessPreview.movements.length);
  });

  it("bloquea cuenta no reconocida (unknown): 0 a insertar", () => {
    const plan = planSantanderBankStatementImport(
      { ...businessPreview, account_number: "999888777" },
      [],
      WS
    );
    expect(plan.to_insert).toHaveLength(0);
    expect(plan.blocked?.scope).toBe("unknown");
  });

  it("cuenta de empresa (1211749) sí importa", () => {
    const plan = planSantanderBankStatementImport(businessPreview, [], WS);
    expect(plan.blocked).toBeUndefined();
    expect(plan.to_insert.length).toBeGreaterThan(0);
  });
});

describe("anti-duplicado", () => {
  const preview = previewBodyFromFixture(SANTANDER_UYU_JULY_AUSZUG_FIXTURE);

  it("segunda corrida omite todos los movimientos", () => {
    const first = planSantanderBankStatementImport(preview, [], WS);
    const existing: ExistingBankMovementForDedupe[] = first.to_insert.map((row) => ({
      movement_date: row.movement_date,
      amount: row.amount,
      currency: row.currency,
      direction: row.direction,
      bank_reference: row.bank_reference,
      description: row.description,
      account_label: "Santander 000001211749 UYU",
      bank_name: "Santander",
      metadata: row.metadata,
    }));

    const second = planSantanderBankStatementImport(preview, existing, WS);
    expect(second.to_insert).toHaveLength(0);
    expect(second.skipped_duplicates_count).toBe(3);
    expect(second.total_preview_count).toBe(3);
  });

  it("duplicado parcial inserta solo nuevos", () => {
    const movement = preview.movements[0]!;
    const planned = buildMovementInsertFromPreview(movement, {
      workspaceId: WS,
      accountNumber: preview.account_number,
      currencyCode: preview.currency_code,
    });
    const existing: ExistingBankMovementForDedupe[] = [
      {
        movement_date: planned.movement_date,
        amount: planned.amount,
        currency: planned.currency,
        direction: planned.direction,
        bank_reference: planned.bank_reference,
        description: planned.description,
        account_label: "Santander 000001211749 UYU",
        bank_name: "Santander",
        metadata: planned.metadata,
      },
    ];

    const plan = planSantanderBankStatementImport(preview, existing, WS);
    expect(plan.to_insert).toHaveLength(2);
    expect(plan.skipped_duplicates_count).toBe(1);
  });
});

describe("FASE BANK-GLOBAL-MOVEMENT-RECEIPT-INVOICE-INTEGRITY-AUDIT-AND-CORRECTION-001 — dedupe cross-parser", () => {
  const preview = previewBodyFromFixture(SANTANDER_UYU_JULY_AUSZUG_FIXTURE);

  it("caso real Nirmex/Harrison: misma operación ya importada por Excel, ahora vista de nuevo por PDF con descripción distinta -> no crea fila operativa nueva, se reporta como cross_parser_duplicates", () => {
    const movement = preview.movements[0]!;
    const plannedFromExcel = buildMovementInsertFromPreview(movement, {
      workspaceId: WS,
      accountNumber: preview.account_number,
      currencyCode: preview.currency_code,
      parserId: "santander_excel_consolidated_v1",
    });
    // Simula el artefacto real de un parser PDF distinto para la MISMA
    // transferencia ("-- N of M --", espaciado): su propio dedupe_key exacto
    // (que sí incluye descripción) es DISTINTO al de la fila Excel — por eso
    // el dedupe_key no la detecta y hace falta el chequeo por huella canónica.
    const excelRowDescription = `${plannedFromExcel.description} -- 1 of 7 --`;
    const excelRowDedupeKey = buildMovementDedupeKey({
      workspaceId: WS,
      bankName: "Santander",
      accountNumber: preview.account_number,
      currency: plannedFromExcel.currency,
      movementDate: plannedFromExcel.movement_date,
      bankReference: plannedFromExcel.bank_reference,
      amount: plannedFromExcel.amount,
      description: excelRowDescription,
    });
    expect(excelRowDedupeKey).not.toBe(plannedFromExcel.dedupe_key);

    const existing: ExistingBankMovementForDedupe[] = [
      {
        id: "existing-excel-row",
        movement_date: plannedFromExcel.movement_date,
        amount: plannedFromExcel.amount,
        currency: plannedFromExcel.currency,
        direction: plannedFromExcel.direction,
        bank_reference: plannedFromExcel.bank_reference,
        description: excelRowDescription,
        account_label: "Santander 000001211749 UYU",
        bank_name: "Santander",
        metadata: {
          ...plannedFromExcel.metadata,
          dedupe_key: excelRowDedupeKey,
          canonical_fingerprint: plannedFromExcel.canonical_fingerprint,
        },
      },
    ];

    const plan = planSantanderBankStatementImport(preview, existing, WS, "santander_pdf_v1");
    const skip = plan.cross_parser_duplicates.find(
      (d) => d.movement.bank_reference === plannedFromExcel.bank_reference
    );
    expect(skip).toBeDefined();
    expect(skip?.existingMovementId).toBe("existing-excel-row");
    expect(plan.to_insert.some((r) => r.bank_reference === plannedFromExcel.bank_reference)).toBe(false);
  });

  it("sin bank_reference nunca se fusiona por huella (solo el dedupe_key exacto sigue vigente)", () => {
    const movement = { ...preview.movements[0]!, reference: null };
    const plannedNoRef = buildMovementInsertFromPreview(movement, {
      workspaceId: WS,
      accountNumber: preview.account_number,
      currencyCode: preview.currency_code,
    });
    expect(plannedNoRef.canonical_fingerprint).toBeNull();

    const existing: ExistingBankMovementForDedupe[] = [
      {
        id: "existing-no-ref",
        movement_date: plannedNoRef.movement_date,
        amount: plannedNoRef.amount,
        currency: plannedNoRef.currency,
        direction: plannedNoRef.direction,
        bank_reference: null,
        description: "OTRA DESCRIPCION TOTALMENTE DISTINTA",
        account_label: "Santander 000001211749 UYU",
        bank_name: "Santander",
        metadata: {},
      },
    ];
    const plan = planSantanderBankStatementImport(
      { ...preview, movements: [movement] },
      existing,
      WS
    );
    expect(plan.cross_parser_duplicates).toHaveLength(0);
    expect(plan.to_insert).toHaveLength(1);
  });

  it("filas existentes sin id (fixtures legacy) quedan fuera del chequeo cross-parser (solo dedupe_key exacto aplica)", () => {
    const movement = preview.movements[0]!;
    const planned = buildMovementInsertFromPreview(movement, {
      workspaceId: WS,
      accountNumber: preview.account_number,
      currencyCode: preview.currency_code,
    });
    const existingWithoutId: ExistingBankMovementForDedupe[] = [
      {
        movement_date: planned.movement_date,
        amount: planned.amount,
        currency: planned.currency,
        direction: planned.direction,
        bank_reference: planned.bank_reference,
        description: "DESCRIPCION DISTINTA SIN ID",
        account_label: "Santander 000001211749 UYU",
        bank_name: "Santander",
        metadata: {},
      },
    ];
    const plan = planSantanderBankStatementImport(preview, existingWithoutId, WS);
    expect(plan.cross_parser_duplicates).toHaveLength(0);
    expect(plan.to_insert.some((r) => r.bank_reference === planned.bank_reference)).toBe(true);
  });

  it("dos filas del mismo archivo comparten huella (superposición interna) -> la segunda se omite como duplicado, no como cross_parser_duplicates", () => {
    const movement = preview.movements[0]!;
    const duplicateWithinSameFile = { ...movement, description: `${movement.description} -- 1 of 2 --` };
    const plan = planSantanderBankStatementImport(
      { ...preview, movements: [movement, duplicateWithinSameFile] },
      [],
      WS
    );
    const matches = plan.to_insert.filter((r) => r.bank_reference === movement.reference);
    expect(matches).toHaveLength(1);
    expect(plan.cross_parser_duplicates).toHaveLength(0);
    expect(plan.skipped_duplicates_count).toBeGreaterThanOrEqual(1);
  });

  it("canonicalFingerprintFromExistingRow reusa metadata.canonical_fingerprint cuando está presente", () => {
    const stored = "precomputed-fingerprint-value";
    const fp = canonicalFingerprintFromExistingRow(
      {
        movement_date: "2026-04-10",
        amount: 7567,
        currency: "UYU",
        direction: "inflow",
        bank_reference: "TR0082544541",
        description: "cualquier cosa",
        account_label: "Santander 000001211749 UYU",
        bank_name: "Santander",
        metadata: { canonical_fingerprint: stored },
      },
      WS
    );
    expect(fp).toBe(stored);
  });
});

describe("buildMovementDedupeKey", () => {
  it("diferencia movimientos con misma referencia y monto pero distinta descripción", () => {
    const withRef = buildMovementDedupeKey({
      workspaceId: WS,
      bankName: "Santander",
      accountNumber: "000001211749",
      currency: "UYU",
      movementDate: "2026-07-01",
      bankReference: "ZETA001",
      amount: 3721,
      description: "PAGO ZETA",
    });
    const otherDesc = buildMovementDedupeKey({
      workspaceId: WS,
      bankName: "Santander",
      accountNumber: "000001211749",
      currency: "UYU",
      movementDate: "2026-07-01",
      bankReference: "ZETA001",
      amount: 3721,
      description: "OTRA DESCRIPCION",
    });
    expect(withRef).not.toBe(otherDesc);
  });
});

describe("inferBankStatementImportFileType", () => {
  it("detecta xlsx y pdf por extensión", () => {
    expect(inferBankStatementImportFileType("consolidado.xlsx")).toBe("xlsx");
    expect(inferBankStatementImportFileType("extracto.pdf")).toBe("pdf");
  });

  it("usa parser excel consolidado para xlsx", () => {
    expect(inferBankStatementParserId("consolidado.xlsx")).toBe(SANTANDER_EXCEL_CONSOLIDATED_PARSER_ID);
    const record = buildStatementImportRecord({
      workspaceId: WS,
      importedBy: "user-1",
      fileName: "consolidado.xlsx",
      preview: previewBodyFromFixture(SANTANDER_UYU_JULY_AUSZUG_FIXTURE),
      accountLabel: "Santander 000001211749 UYU",
      insertedCount: 1,
      skippedDuplicatesCount: 0,
      totalPreviewCount: 1,
    });
    expect(record.file_type).toBe("xlsx");
    expect((record.metadata as { parser: string }).parser).toBe(SANTANDER_EXCEL_CONSOLIDATED_PARSER_ID);
  });
});
