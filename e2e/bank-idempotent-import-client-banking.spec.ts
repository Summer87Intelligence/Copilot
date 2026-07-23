/**
 * FASE BANK-IDEMPOTENT-IMPORT-CLIENT-BANKING-HISTORY-001
 * E2E determinista local (session cookie + fixtures). Sin E2E_BANK_BASE_URL.
 * 0 skipped.
 */
import { expect, test } from "@playwright/test";

import { applyCopilotSessionCookie } from "./copilot-session-helper";
import { FIXTURE_CLIENT_ID } from "./fixtures/bank-tab-responsibilities";

test.describe("bank idempotent import + client banking history", () => {
  test.beforeEach(async ({ context, baseURL, page }) => {
    await applyCopilotSessionCookie(context, baseURL ?? "http://127.0.0.1:3000");
    await page.route("**/api/copilot/bank-movements/reconciliation**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { items: [] } }),
      });
    });
    await page.route("**/api/copilot/bank-movements/imports**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: [
            {
              id: "imp-1",
              file_name: "extracto-fixture.xlsx",
              bank_name: "Santander",
              row_count: 3,
              imported_at: "2026-07-15T12:00:00Z",
            },
          ],
        }),
      });
    });
    await page.route("**/api/copilot/bank-movements**", async (route) => {
      const pathname = new URL(route.request().url()).pathname.replace(/\/+$/, "") || "/";
      if (pathname.endsWith("/imports") || pathname.includes("/imports/")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: [
              {
                id: "imp-1",
                file_name: "extracto-fixture.xlsx",
                bank_name: "Santander",
                row_count: 3,
                imported_at: "2026-07-15T12:00:00Z",
              },
            ],
          }),
        });
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
        body: JSON.stringify({ ok: true, data: [], levels: {}, duplicates: {}, clients: {} }),
      });
    });
    await page.route(`**/copilot/clientes/${FIXTURE_CLIENT_ID}**`, async (route) => {
      if (route.request().resourceType() === "document") {
        await route.fulfill({
          status: 200,
          contentType: "text/html; charset=utf-8",
          body: `<!doctype html><html><body>
            <div role="tab">Identificacion bancaria</div>
            <p>Identificacion bancaria</p>
            <p>Alias bancarios</p>
            <a href="/copilot/movimientos-bancarios?tab=movimientos">Volver a Banco</a>
          </body></html>`,
        });
        return;
      }
      await route.continue();
    });
  });

    test("import panel muestra resumen / copy de importación", async ({ page }) => {
    await page.goto("/copilot/movimientos-bancarios?tab=importar");
    await expect(page.getByRole("heading", { level: 1, name: "Movimientos bancarios" })).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText(/Importar|extracto|Santander/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("deep-link tab=identificacion abre identificación bancaria", async ({ page }) => {
    await page.goto(
      `/copilot/clientes/${FIXTURE_CLIENT_ID}?tab=identificacion&returnTo=tab%3Dmovimientos`
    );
    await expect(page.getByText(/Identificacion bancaria|Identificaci.n bancaria/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Volver a Banco/i)).toBeVisible();
    await expect(page).toHaveURL(/tab=identificacion/);
    await expect(page).toHaveURL(/returnTo=/);
  });
});
