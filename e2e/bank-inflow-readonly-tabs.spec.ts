/**
 * inflow_readonly (Camila / "Cami") solo debe ver la pestaña Movimientos en
 * Banco. Importar/Conciliación/Historial deben quedar completamente fuera de
 * alcance — ni el botón, ni el deep-link por query param.
 *
 * Sesión real: usa el user_id real de Camila (bank_movements=inflow_readonly
 * en app_user_permissions, confirmado por lectura directa, sin modificar
 * datos) para firmar una cookie de sesión de test válida.
 */
import { expect, test } from "@playwright/test";
import { applyCopilotSessionCookie } from "./copilot-session-helper";

const CAMI_USER_ID = "ed980d62-a16c-4217-aa60-1c78cb023240";
const CAMI_COMPANY_ID = "040321ff-10fd-4da3-aeca-f1865f879986";
const CAMI_ROLE = "usuario";

async function loginAsCami(context: import("@playwright/test").BrowserContext, baseURL: string) {
  await applyCopilotSessionCookie(context, baseURL, {
    userId: CAMI_USER_ID,
    role: CAMI_ROLE,
    companyId: CAMI_COMPANY_ID,
    credentialVersion: 1,
  });
}

test.describe("Banco — tabs restringidos para inflow_readonly (Camila)", () => {
  test("Camila solo ve Movimientos; Importar/Conciliación/Historial no existen", async ({
    page,
    context,
    baseURL,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(`[pageerror] ${err.message}`));

    await loginAsCami(context, baseURL ?? "http://127.0.0.1:3001");
    await page.goto("/copilot/movimientos-bancarios");

    const nav = page.locator("[data-bank-tabs]");
    await expect(nav.getByRole("button", { name: "Movimientos" })).toBeVisible({ timeout: 45_000 });

    await expect(nav.getByRole("button", { name: "Importar" })).toHaveCount(0);
    await expect(nav.getByRole("button", { name: "Conciliación" })).toHaveCount(0);
    await expect(nav.getByRole("button", { name: "Historial" })).toHaveCount(0);

    // Un solo botón en el nav: sin huecos ni separadores raros.
    await expect(nav.getByRole("button")).toHaveCount(1);

    // El encabezado con la fecha de última actualización se mantiene.
    await expect(page.getByTestId("bank-last-import-updated-at")).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  for (const restrictedTab of ["importar", "conciliacion", "historial"]) {
    test(`Camila con ?tab=${restrictedTab} queda normalizada a Movimientos`, async ({
      page,
      context,
      baseURL,
    }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });

      await loginAsCami(context, baseURL ?? "http://127.0.0.1:3001");
      await page.goto(`/copilot/movimientos-bancarios?tab=${restrictedTab}`);

      const nav = page.locator("[data-bank-tabs]");
      await expect(nav.getByRole("button", { name: "Movimientos" })).toBeVisible({ timeout: 45_000 });
      await expect(nav.getByRole("button")).toHaveCount(1);

      // Ninguno de los paneles restringidos debe montarse.
      await expect(page.getByText("Importar extracto")).toHaveCount(0);
      await expect(page.getByText("Pagos programados de Tesorería")).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Movimientos del banco" })).toBeVisible();

      expect(consoleErrors).toEqual([]);
    });
  }

  test("otro usuario autorizado (superadmin) sigue viendo las 4 pestañas", async ({
    page,
    context,
    baseURL,
  }) => {
    await applyCopilotSessionCookie(context, baseURL ?? "http://127.0.0.1:3001");
    await page.goto("/copilot/movimientos-bancarios");

    const nav = page.locator("[data-bank-tabs]");
    await expect(nav.getByRole("button", { name: "Movimientos" })).toBeVisible({ timeout: 45_000 });
    await expect(nav.getByRole("button", { name: "Importar" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Conciliación" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Historial" })).toBeVisible();
    await expect(nav.getByRole("button")).toHaveCount(4);
  });
});
