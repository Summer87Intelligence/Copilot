/**
 * FASE BANK-2026-CLEANUP — E2E fixtures (sin producción).
 * Cubre: no 2025 en UI, KPI montos, historial sin Conciliados, import copy, paginación.
 */
import { expect, test, type Page } from "@playwright/test";

import { applyCopilotSessionCookie } from "./copilot-session-helper";

const WS = "040321ff-10fd-4da3-aeca-f1865f879986";

function mov(partial: Record<string, unknown> & { id: string }) {
  return {
    workspace_id: WS,
    import_id: null,
    bank_name: "Santander",
    account_label: "Santander UYU",
    movement_date: "2026-07-10",
    description: "TRANSFERENCIA",
    raw_description: "TRANSFERENCIA",
    amount: 1000,
    currency: "UYU",
    direction: "inflow",
    bank_reference: "REF",
    status: "pending",
    matched_type: null,
    matched_id: null,
    matched_confidence: null,
    matched_by: null,
    matched_at: null,
    metadata: {},
    excluded_from_operations: false,
    duplicate_of: null,
    created_at: "2026-07-10T12:00:00Z",
    updated_at: "2026-07-10T12:00:00Z",
    ...partial,
  };
}

const ID_IN_UYU = "b1111111-1111-4111-8111-111111111111";
const ID_IN_USD = "b2222222-2222-4222-8222-222222222222";
const ID_OUT_UYU = "b3333333-3333-4333-8333-333333333333";
const ID_2025 = "b4444444-4444-4444-8444-444444444444";
const ID_DUP = "b5555555-5555-4555-8555-555555555555";

function listPayload() {
  const rows = [
    mov({
      id: ID_IN_UYU,
      amount: 100,
      currency: "UYU",
      direction: "inflow",
      description: "ENTRADA UYU JULIO",
    }),
    mov({
      id: ID_IN_USD,
      amount: 50,
      currency: "USD",
      direction: "inflow",
      description: "ENTRADA USD JULIO SUPRASUR",
      bank_reference: "198677",
    }),
    mov({
      id: ID_OUT_UYU,
      amount: 30,
      currency: "UYU",
      direction: "outflow",
      description: "SALIDA UYU JULIO",
    }),
    mov({
      id: ID_2025,
      movement_date: "2025-06-01",
      description: "MOVIMIENTO 2025 NO DEBE VERSE",
      amount: 9999,
    }),
    mov({
      id: ID_DUP,
      description: "ENTRADA UYU JULIO DUP",
      amount: 100,
      excluded_from_operations: true,
      duplicate_of: ID_IN_UYU,
    }),
  ];
  // Fill to exercise pagination (need > 25 with pageSize 25)
  for (let i = 0; i < 30; i += 1) {
    const hex = i.toString(16).padStart(12, "0");
    rows.push(
      mov({
        id: `c0000000-0000-4000-8000-${hex}`,
        movement_date: `2026-07-${String((i % 28) + 1).padStart(2, "0")}`,
        description: `EXTRA ${i}`,
        amount: 1 + i,
        direction: i % 2 === 0 ? "inflow" : "outflow",
      })
    );
  }
  return {
    ok: true,
    data: rows,
    levels: Object.fromEntries(rows.map((r) => [String(r.id), "unidentified"])),
    duplicates: { [ID_DUP]: { canonicalMovementId: ID_IN_UYU } },
    clients: {},
  };
}

async function install(page: Page) {
  await page.route("**/api/copilot/bank-movements/reconciliation**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { items: [] } }),
    });
  });
  await page.route("**/api/copilot/bank-reconciliation/client-identifications**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: [
          {
            id: "h1",
            eventLabel: "Cliente asociado",
            status: "identified",
            clientName: "Suprasur S.A.",
            date: "2026-07-14",
            amountLabel: "USD 610",
            referenceMasked: "198677",
            actor: "daniel@example.com",
            reason: null,
            eventAt: "2026-07-15T12:00:00Z",
          },
        ],
      }),
    });
  });
  await page.route("**/api/copilot/bank-movements**", async (route) => {
    const pathname = new URL(route.request().url()).pathname.replace(/\/+$/, "") || "/";
    // Dejar que la ruta específica de /imports (registrada después) gane.
    if (pathname.includes("/imports")) {
      await route.fallback();
      return;
    }
    if (pathname.includes("/reconciliation")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { items: [] } }),
      });
      return;
    }
    if (pathname !== "/api/copilot/bank-movements") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(listPayload()),
    });
  });
  // Última ruta registrada gana sobre el catch-all de bank-movements.
  await page.route("**/api/copilot/bank-movements/imports**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: [
          {
            id: "imp-1",
            workspace_id: WS,
            bank_name: "Santander",
            account_label: "Santander UYU",
            file_name: "auszug-julio.pdf",
            file_type: "pdf",
            imported_by: "22535d5c-3c6d-4bc4-a9a1-550132a1819b",
            imported_at: "2026-07-15T12:00:00Z",
            status: "parsed",
            row_count: 11,
            metadata: {
              total_preview_count: 48,
              inserted_count: 11,
              already_exists_count: 37,
            },
            actor: {
              id: "22535d5c-3c6d-4bc4-a9a1-550132a1819b",
              displayName: "Daniel Odella",
              email: "daniel@example.com",
              kind: "user",
            },
            created_at: "2026-07-15T12:00:00Z",
            updated_at: "2026-07-15T12:00:00Z",
          },
          // Simula meta.actors_unresolved: fila cruda sin view model.
          {
            id: "imp-unresolved",
            workspace_id: WS,
            bank_name: "Santander",
            account_label: "Santander UYU",
            file_name: "umsatz-sin-actor.pdf",
            file_type: "pdf",
            imported_by: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
            imported_at: "2026-07-14T12:00:00Z",
            status: "parsed",
            row_count: 3,
            metadata: { total_preview_count: 3, inserted_count: 3, already_exists_count: 0 },
            created_at: "2026-07-14T12:00:00Z",
            updated_at: "2026-07-14T12:00:00Z",
          },
        ],
        meta: { total: 2, migration_pending: false, actors_unresolved: true },
      }),
    });
  });
}

test.describe.configure({ timeout: 120_000 });

test.describe("Bank 2026 cleanup — fixtures", () => {
  test.beforeEach(async ({ context, page, baseURL }) => {
    await applyCopilotSessionCookie(context, baseURL ?? "http://127.0.0.1:3000");
    await install(page);
  });

  test("1. Selector no ofrece 2025; KPI muestra montos UYU/USD", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/copilot/movimientos-bancarios?tab=movimientos&month=2026-07");
    await expect(page.getByRole("heading", { level: 1, name: "Movimientos bancarios" })).toBeVisible({
      timeout: 45_000,
    });
    const periodOptions = await page.locator("#bank-period-select option").allTextContents();
    expect(periodOptions.some((t) => /2025/.test(t))).toBe(false);
    expect(periodOptions.some((t) => /Enero 2026/.test(t))).toBe(true);
    await expect(page.getByTestId("bank-kpi-inflow")).toContainText("UYU");
    await expect(page.getByTestId("bank-kpi-inflow")).toContainText("USD");
    await expect(page.getByTestId("bank-kpi-outflow")).toContainText("UYU");
    await expect(page.getByText(/Diferencia del período/i)).toBeVisible();
    await expect(page.getByText(/Neto UYU/i)).toHaveCount(0);
    await expect(page.getByText("MOVIMIENTO 2025 NO DEBE VERSE")).toHaveCount(0);
  });

  test("2. Paginación numérica conserva page en URL", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/copilot/movimientos-bancarios?tab=movimientos&month=2026-07&pageSize=25");
    await expect(page.getByRole("heading", { level: 1, name: "Movimientos bancarios" })).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByTestId("table-pagination-numeric")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("table-pagination-numeric").getByRole("button", { name: "Ir a página 2" }).click();
    await expect(page).toHaveURL(/page=2/, { timeout: 15_000 });
    await expect(page).toHaveURL(/month=2026-07/);
    // pageSize puede omitirse en URL cuando coincide con el default canónico (25).
    const url = page.url();
    expect(url.includes("pageSize=25") || !/[?&]pageSize=/.test(url)).toBe(true);
  });

  test("3. Historial: Importado por legible, sin UUID, sin Conciliados por cliente", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/copilot/movimientos-bancarios?tab=historial&month=2026-07");
    await expect(page.getByTestId("bank-history-panel")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/Identificaciones por cliente/i)).toBeVisible();
    await expect(page.getByText(/Conciliaciones por cliente/i)).toHaveCount(0);
    await expect(page.getByText(/Conciliados por cliente/i)).toHaveCount(0);
    await expect(page.getByText(/Suprasur/i).first()).toBeVisible();

    const actor = page.getByTestId("bank-import-actor").first();
    await expect(actor).toBeVisible();
    await expect(actor).toContainText("Importado por");
    await expect(actor).toContainText("Daniel Odella");
    await expect(actor).toContainText("daniel@example.com");
    await expect(actor).not.toContainText("22535d5c-3c6d-4bc4-a9a1-550132a1819b");

    // Camino actors_unresolved: fallback legible, sin UUID.
    await expect(page.getByText("Usuario del sistema").first()).toBeVisible();
    await expect(page.getByTestId("bank-history-panel")).not.toContainText(
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
    );
  });

  test("3b. Historial mobile: actor sin overflow horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/copilot/movimientos-bancarios?tab=historial&month=2026-07");
    await expect(page.getByTestId("bank-import-actor").first()).toBeVisible({ timeout: 45_000 });
    const overflowX = await page.evaluate(() => {
      const doc = document.documentElement;
      return Math.max(doc.scrollWidth - window.innerWidth, document.body.scrollWidth - window.innerWidth);
    });
    expect(overflowX).toBeLessThanOrEqual(1);
  });

  test("4. Importar — sin Neto ambiguo y CTA Importar solo nuevos", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/copilot/movimientos-bancarios?tab=importar");
    await expect(page.getByRole("heading", { level: 1, name: "Movimientos bancarios" })).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText(/Neto UYU/i)).toHaveCount(0);
    await expect(page.getByText(/Neto USD/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Previsualizar/i })).toBeVisible();
  });

  test("5. Mobile: paginación muestra Página X de Y", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/copilot/movimientos-bancarios?tab=movimientos&month=2026-07&pageSize=25");
    await expect(page.getByRole("heading", { level: 1, name: "Movimientos bancarios" })).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText(/Página \d+ de \d+/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: "Página siguiente" })).toBeVisible();
  });
});
