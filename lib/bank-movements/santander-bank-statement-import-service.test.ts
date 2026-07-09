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

describe("buildMovementDedupeKey", () => {
  it("usa referencia como criterio fuerte", () => {
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
    expect(withRef).toBe(otherDesc);
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
