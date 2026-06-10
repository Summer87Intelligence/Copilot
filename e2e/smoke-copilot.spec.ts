import { expect, test } from "@playwright/test";

import { createSevereCollector } from "./severity-console";

/**
 * Smoke QA-02: rutas críticas de Copilot sin depender de datos poblados.
 * Requiere app en PLAYWRIGHT_BASE_URL (por defecto levanta `next dev` vía playwright.config).
 */
test.describe("Copilot smoke", () => {
  test("carga /copilot, región principal y títulos estables (tolerante a empty state)", async ({
    page,
  }) => {
    const severe = createSevereCollector();
    severe.attach(page);

    await page.goto("/copilot");

    await expect(page.getByRole("main")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Inicio" })
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
    await expect(page.getByRole("main")).toBeVisible();

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
    await expect(page.getByRole("main")).toBeVisible();

    await page.locator('aside nav a[href="/copilot/tesoreria"]').click();
    await expect(page).toHaveURL(/\/copilot\/tesoreria$/);
    await expect(page.getByRole("heading", { level: 1, name: "Tesorería" })).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Secciones de tesorería" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Caja manual" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Conciliación Santander" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Obligaciones" })).toBeVisible();

    await page.getByRole("button", { name: "Caja manual" }).click();
    await expect(page.getByRole("heading", { name: "Caja manual" })).toBeVisible();

    await page.getByRole("button", { name: "Conciliación Santander" }).click();
    await expect(
      page.getByRole("heading", { name: "Conciliación bancaria Santander" })
    ).toBeVisible();

    await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");
    await expect(page.locator("body")).not.toContainText("Application error");

    severe.assertClean();
  });
});
