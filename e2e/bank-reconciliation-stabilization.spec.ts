import { devices, expect, test } from "@playwright/test";

import { applyCopilotSessionCookie } from "./copilot-session-helper";
import { createSevereCollector } from "./severity-console";

/**
 * FASE BANK-RECONCILIATION-END-TO-END-STABILIZATION-001 — smoke e2e para el
 * flujo estabilizado de Movimientos bancarios / Conciliación.
 *
 * No asume seed data específico: si no hay ningún caso de cliente en
 * Conciliación (workspace de test vacío), el spec verifica solo el chrome
 * (tabs, navegación, secciones) y sale sin fallar — el contrato de copy
 * "Revisar N listos" / "Revisar movimientos" (nunca la CTA masiva legacy
 * "Confirmar N con recibo") solo se puede ejercitar si existe al menos un
 * caso con movimientos.
 */
test.describe("Movimientos bancarios / Conciliación — estabilización", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await applyCopilotSessionCookie(context, baseURL ?? "http://127.0.0.1:3000");
  });

  test("tabs de Movimientos bancarios visibles y navegables", async ({ page }) => {
    const severe = createSevereCollector();
    severe.attach(page);

    await page.goto("/copilot/movimientos-bancarios");
    await expect(page.getByRole("heading", { level: 1, name: "Movimientos bancarios" })).toBeVisible();

    const tabs = page.locator("[data-bank-tabs]");
    await expect(tabs).toBeVisible();
    await expect(tabs.getByRole("button", { name: "Importar" })).toBeVisible();
    await expect(tabs.getByRole("button", { name: "Movimientos" })).toBeVisible();
    await expect(tabs.getByRole("button", { name: /Conciliación/ })).toBeVisible();
    await expect(tabs.getByRole("button", { name: "Historial" })).toBeVisible();

    await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");
    await expect(page.locator("body")).not.toContainText("Application error");
    severe.assertClean();
  });

  test("pestaña Conciliación carga sin romper el shell (sin asumir seed data)", async ({ page }) => {
    const severe = createSevereCollector();
    severe.attach(page);

    await page.goto("/copilot/movimientos-bancarios");
    const tabs = page.locator("[data-bank-tabs]");
    await tabs.getByRole("button", { name: /Conciliación/ }).click();

    // El shell de Conciliación (buscador/filtros o empty state) debe montar
    // sin excepciones, exista o no data — nunca dejar la vista en blanco sin
    // señal alguna al usuario.
    await page.waitForTimeout(500);
    await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");
    await expect(page.locator("body")).not.toContainText("Application error");
    severe.assertClean();
  });

  test("caso listo-para-confirmar (si existe) usa 'Revisar N listos' o 'Revisar movimientos', nunca la CTA masiva legacy 'Confirmar N con recibo'", async ({
    page,
  }) => {
    const severe = createSevereCollector();
    severe.attach(page);

    await page.goto("/copilot/movimientos-bancarios");
    const tabs = page.locator("[data-bank-tabs]");
    await tabs.getByRole("button", { name: /Conciliación/ }).click();
    await page.waitForTimeout(800);

    // Contrato duro, independiente de si hay data: la CTA masiva legacy no
    // debe existir en el DOM bajo ninguna circunstancia.
    await expect(page.getByText(/Confirmar \d+ con recibo/)).toHaveCount(0);

    // Buscamos cualquier caso clickeable en la lista de Conciliación. Si no
    // hay ninguno (workspace de test sin seed), salimos gracefully: no hay
    // nada más que este spec pueda ejercitar sin datos.
    const caseCard = page
      .locator("button, [role='button'], a")
      .filter({ hasText: /Revisar movimientos|Revisar cliente|Identificar cliente|Confirmar cliente/ })
      .first();

    const hasCase = (await caseCard.count()) > 0;
    test.skip(!hasCase, "Sin casos de Conciliación en el workspace de test — nada que abrir.");

    await caseCard.click();
    await page.waitForTimeout(500);

    // Dentro del detalle del caso: si hay un lote de listos-para-confirmar,
    // el copy debe ser "Revisar N listos"; si no, puede no aparecer ningún
    // CTA de lote (caso sin movimientos listos) — ambos son válidos. Lo
    // único prohibido es la CTA masiva legacy.
    await expect(page.getByText(/Confirmar \d+ con recibo/)).toHaveCount(0);
    const batchOrGeneralCta = page.getByText(/Revisar \d+ listos|Revisar movimientos/);
    if ((await batchOrGeneralCta.count()) > 0) {
      await expect(batchOrGeneralCta.first()).toBeVisible();
    }

    await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");
    severe.assertClean();
  });

  test("Movimientos bancarios en viewport móvil no rompe el chrome", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ ...devices["iPhone 13"] });
    await applyCopilotSessionCookie(context, baseURL ?? "http://127.0.0.1:3000");
    const page = await context.newPage();
    const severe = createSevereCollector();
    severe.attach(page);

    try {
      await page.goto("/copilot/movimientos-bancarios");
      await expect(page.getByRole("heading", { level: 1, name: "Movimientos bancarios" })).toBeVisible();
      const tabs = page.locator("[data-bank-tabs]");
      await expect(tabs).toBeVisible();
      await tabs.getByRole("button", { name: /Conciliación/ }).click();
      await page.waitForTimeout(500);

      await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");
      await expect(page.locator("body")).not.toContainText("Application error");
      severe.assertClean();
    } finally {
      await context.close();
    }
  });
});
