/**
 * FASE BANK-IDEMPOTENT-IMPORT-CLIENT-BANKING-HISTORY-001
 * E2E contract: import idempotente + deep-link banking (fixtures / smoke UI).
 */
import { expect, test } from "@playwright/test";

test.describe("bank idempotent import + client banking history", () => {
  test.skip(!process.env.E2E_BANK_BASE_URL, "Requires E2E_BANK_BASE_URL");

  test("import panel muestra resumen de ya existentes (smoke)", async ({ page }) => {
    const base = process.env.E2E_BANK_BASE_URL!;
    await page.goto(`${base}/copilot/movimientos-bancarios?tab=importar`);
    await expect(page.getByText(/Importar|extracto|Santander/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("deep-link tab=identificacion abre identificación bancaria", async ({ page }) => {
    const base = process.env.E2E_BANK_BASE_URL!;
    const clientId = process.env.E2E_BANK_CLIENT_ID;
    test.skip(!clientId, "Requires E2E_BANK_CLIENT_ID");
    await page.goto(
      `${base}/copilot/clientes/${clientId}?tab=identificacion&returnTo=tab%3Dmovimientos`
    );
    await expect(page.getByRole("tab", { name: /Identificación bancaria/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Identificación bancaria|Alias bancarios|historial/i).first()).toBeVisible();
    await expect(page.getByText(/Volver a Banco/i)).toBeVisible();
  });
});
