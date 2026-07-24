/**
 * Regresión: "Última actualización" en el encabezado de Banco debe reflejar
 * la última ejecución EXITOSA de "Importar extracto", incluso cuando esa
 * corrida no insertó movimientos nuevos (todo duplicado / ya existente).
 *
 * E2E determinista local (session cookie + mocks de red). No escribe en
 * Supabase real: simula que el backend (ya corregido) persiste una fila
 * nueva en bank_statement_imports con row_count 0 en la segunda corrida.
 */
import { expect, test } from "@playwright/test";

import { applyCopilotSessionCookie } from "./copilot-session-helper";

const FIRST_IMPORT_AT = "2026-07-20T10:00:00Z";
const SECOND_IMPORT_AT = "2026-07-24T13:30:00Z";

function importRow(overrides: Record<string, unknown>) {
  return {
    id: "imp-1",
    workspace_id: "ws-1",
    bank_name: "Santander",
    account_label: "Santander 000001211749 UYU",
    file_name: "extracto.pdf",
    file_type: "pdf",
    imported_by: null,
    imported_at: FIRST_IMPORT_AT,
    status: "parsed",
    row_count: 2,
    metadata: {},
    created_at: FIRST_IMPORT_AT,
    updated_at: FIRST_IMPORT_AT,
    ...overrides,
  };
}

test.describe("bank import header — última actualización", () => {
  test.beforeEach(async ({ context, baseURL, page }) => {
    await applyCopilotSessionCookie(context, baseURL ?? "http://127.0.0.1:3000");

    await page.route("**/api/copilot/bank-movements/reconciliation**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { items: [] } }),
      });
    });

    let importsCallCount = 0;
    await page.route("**/api/copilot/bank-movements/imports", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      importsCallCount += 1;
      const rows =
        importsCallCount === 1
          ? [importRow({})]
          : [
              importRow({}),
              importRow({
                id: "imp-2",
                imported_at: SECOND_IMPORT_AT,
                row_count: 0,
                metadata: { inserted_count: 0, already_exists_count: 2, total_preview_count: 2 },
              }),
            ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: rows, meta: { total: rows.length, migration_pending: false } }),
      });
    });

    await page.route("**/api/copilot/bank-movements", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: [], levels: {}, duplicates: {}, clients: {} }),
      });
    });

    await page.route("**/api/copilot/bank-movements/imports/preview", async (route) => {
      const previewItem = {
        client_preview_id: "preview-1",
        file_name: "extracto.pdf",
        status: "ready",
        bank_name: "Santander",
        account_number: "000001211749",
        account_label: "Santander 000001211749 UYU",
        currency_code: "UYU",
        period_start: "2026-07-01",
        period_end: "2026-07-31",
        opening_balance: 1000,
        closing_balance: 1000,
        movements: [
          {
            date: "2026-07-10",
            description: "Transferencia recibida",
            reference: "REF-1",
            credit: 500,
            debit: null,
            balance: 1500,
          },
        ],
        movements_count: 1,
        totals: { inflows: 500, outflows: 0, net: 500 },
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            files_count: 1,
            parsed_count: 1,
            failed_count: 0,
            skipped_count: 0,
            total_movements_count: 1,
            totals_by_currency: {
              UYU: { inflows: 500, outflows: 0, net: 500, movements_count: 1 },
              USD: { inflows: 0, outflows: 0, net: 0, movements_count: 0 },
            },
            previews: [previewItem],
            errors: [],
            skipped: [],
          },
        }),
      });
    });

    // Simula el backend YA corregido: una corrida exitosa sin movimientos
    // nuevos (todo duplicado) igual persiste una fila en bank_statement_imports
    // y la expone con un import_id real.
    await page.route("**/api/copilot/bank-movements/imports/confirm", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            files_count: 1,
            imported_files_count: 1,
            failed_files_count: 0,
            skipped_files_count: 0,
            total_preview_count: 1,
            inserted_count: 0,
            skipped_duplicates_count: 1,
            already_exists_count: 1,
            duplicate_in_file_count: 0,
            excluded_before_2026_count: 0,
            outcomes: { read: 1, inserted: 0, already_exists: 1, duplicate_in_file: 0, invalid: 0, ambiguous: 0 },
            results: [
              {
                file_name: "extracto.pdf",
                import_id: "imp-2",
                inserted_count: 0,
                skipped_duplicates_count: 1,
                already_exists_count: 1,
                duplicate_in_file_count: 0,
                excluded_before_2026_count: 0,
                total_preview_count: 1,
                status: "duplicate",
              },
            ],
            errors: [],
            skipped: [],
          },
        }),
      });
    });
  });

  test("reimport sin movimientos nuevos actualiza 'Última actualización' en el encabezado", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/copilot/movimientos-bancarios?tab=importar");

    const header = page.getByTestId("bank-last-import-updated-at");
    await expect(header).toContainText("Última actualización", { timeout: 45_000 });
    const initialHeaderText = (await header.textContent())?.trim() ?? "";
    expect(initialHeaderText).not.toContain("Sin importaciones");

    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: "extracto.pdf", mimeType: "application/pdf", buffer: Buffer.from("dummy") });

    await page.getByRole("button", { name: "Previsualizar extractos" }).click();
    await expect(page.getByText("Vista previa. Todavía no se guardó ningún movimiento.")).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("button", { name: "Importar solo nuevos" }).click();
    await expect(page.getByText("No se encontraron movimientos nuevos.")).toBeVisible({ timeout: 20_000 });

    // El header toma la fecha de la última EJECUCIÓN exitosa, no de la última
    // inserción de movimientos: debe cambiar aunque inserted_count sea 0.
    await expect(header).not.toHaveText(initialHeaderText, { timeout: 20_000 });
    const updatedHeaderText = (await header.textContent())?.trim() ?? "";
    expect(updatedHeaderText).toContain("Última actualización");

    expect(consoleErrors).toEqual([]);
  });
});
