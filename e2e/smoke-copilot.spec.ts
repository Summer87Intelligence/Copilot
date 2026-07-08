import { expect, test } from "@playwright/test";

import { applyCopilotSessionCookie } from "./copilot-session-helper";
import { createSevereCollector } from "./severity-console";

/**
 * Smoke QA-02: rutas críticas de Copilot sin depender de datos poblados.
 * Requiere app en PLAYWRIGHT_BASE_URL (por defecto levanta `next dev` vía playwright.config).
 *
 * Desde FASE 1 existe `middleware.ts` que cierra el acceso anónimo a
 * `/copilot/*`. Inyectamos la cookie firmada antes de cada navegación para
 * mantener el contrato: estos smoke validan shell + navegación, no auth.
 */
test.describe("Copilot smoke", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await applyCopilotSessionCookie(context, baseURL ?? "http://127.0.0.1:3000");
  });

  test("carga /copilot, redirige a Hoy y muestra títulos estables (tolerante a empty state)", async ({
    page,
  }) => {
    const severe = createSevereCollector();
    severe.attach(page);

    await page.goto("/copilot");

    // /copilot redirige al cockpit Hoy (app/copilot/page.tsx).
    // Nota: el shell Copilot no renderiza landmark <main>; anclamos en h1 + nav.
    await expect(page).toHaveURL(/\/copilot\/hoy$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Copilot · Hoy" })
    ).toBeVisible();

    await expect(
      page.getByRole("navigation", { name: "Navegación del módulo Copilot" })
    ).toBeVisible();

    await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");
    await expect(page.locator("body")).not.toContainText("Application error");

    severe.assertClean();
  });

  test("navegación lateral a Datos, Agentes IA y Hoy (sin asserts de negocio)", async ({
    page,
  }) => {
    const severe = createSevereCollector();
    severe.attach(page);

    await page.goto("/copilot");
    await expect(
      page.getByRole("navigation", { name: "Navegación del módulo Copilot" })
    ).toBeVisible();

    await page.locator('aside nav a[href="/copilot/datos"]').click();
    await expect(page).toHaveURL(/\/copilot\/datos$/);
    await expect(page.getByRole("heading", { level: 1, name: "Datos" })).toBeVisible();

    await page.locator('aside nav a[href="/copilot/agentes"]').click();
    await expect(page).toHaveURL(/\/copilot\/agentes$/);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Agentes IA",
      })
    ).toBeVisible();

    await page.locator('aside nav a[href="/copilot/hoy"]').click();
    await expect(page).toHaveURL(/\/copilot\/hoy$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Copilot · Hoy" })
    ).toBeVisible();

    await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");

    severe.assertClean();
  });

  test("navegación a Tesorería y secciones base (sin asserts de negocio)", async ({ page }) => {
    const severe = createSevereCollector();
    severe.attach(page);

    await page.goto("/copilot");
    await expect(
      page.getByRole("navigation", { name: "Navegación del módulo Copilot" })
    ).toBeVisible();

    await page.locator('aside nav a[href="/copilot/tesoreria"]').click();
    await expect(page).toHaveURL(/\/copilot\/tesoreria$/);
    await expect(page.getByRole("heading", { level: 1, name: "Tesorería" })).toBeVisible();
    const sectionsNav = page.getByRole("navigation", { name: "Secciones de tesorería" });
    await expect(sectionsNav).toBeVisible();
    await expect(sectionsNav.getByRole("button", { name: "Pagos", exact: true })).toBeVisible();
    await expect(sectionsNav.getByRole("button", { name: "Movimientos" })).toBeVisible();
    await expect(sectionsNav.getByRole("button", { name: "Cobranza del mes" })).toBeVisible();

    // Tab default: Pagos (sección "programados") con su listado de pagos programados.
    await expect(page.getByRole("heading", { name: "Pagos programados" })).toBeVisible();

    await sectionsNav.getByRole("button", { name: "Movimientos" }).click();
    await expect(page.getByRole("heading", { name: "Movimientos de caja" })).toBeVisible();

    await sectionsNav.getByRole("button", { name: "Cobranza del mes" }).click();
    await expect(
      page.getByRole("heading", { name: "Recibos Zeta (contable)" })
    ).toBeVisible();

    await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");
    await expect(page.locator("body")).not.toContainText("Application error");

    severe.assertClean();
  });

  test("aliases legacy de ?section= en Tesorería siguen resolviendo (sin asserts de negocio)", async ({
    page,
  }) => {
    const severe = createSevereCollector();
    severe.attach(page);

    // Alias viejo "caja" → tab Pagos (sección "programados").
    await page.goto("/copilot/tesoreria?section=caja");
    await expect(page.getByRole("heading", { level: 1, name: "Tesorería" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pagos programados" })).toBeVisible();

    await page.goto("/copilot/tesoreria?section=movimientos");
    await expect(page.getByRole("heading", { name: "Movimientos de caja" })).toBeVisible();

    await page.goto("/copilot/tesoreria?section=cobranza");
    await expect(
      page.getByRole("heading", { name: "Recibos Zeta (contable)" })
    ).toBeVisible();

    await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");
    await expect(page.locator("body")).not.toContainText("Application error");

    severe.assertClean();
  });
});
