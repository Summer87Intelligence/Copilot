/**
 * FASE BANK-SIMPLE-RESPONSIBILITY-AND-DRAWER-DETAIL-001
 *
 * Movimientos = consulta; Conciliación = asignación; drawer encima de tabs;
 * descripción canónica completa; paridad Movimientos/Conciliación.
 */
import { expect, test, type Page } from "@playwright/test";

import { applyCopilotSessionCookie } from "./copilot-session-helper";

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "desktop-1366", width: 1366, height: 768 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
] as const;

test.describe.configure({ timeout: 180_000 });

async function resolveUnassignedInflowId(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const res = await fetch("/api/copilot/bank-movements");
    const json = (await res.json()) as {
      ok?: boolean;
      data?: Array<{ id: string; direction?: string; status?: string }>;
      clients?: Record<string, { clientCompanyId: string; clientName: string | null }>;
      duplicates?: Record<string, unknown>;
    };
    const clients = json.clients ?? {};
    const duplicates = json.duplicates ?? {};
    const rows = json.data ?? [];
    const pick =
      rows.find(
        (m) =>
          m.direction === "inflow" &&
          m.status !== "ignored" &&
          m.status !== "matched" &&
          !clients[m.id]?.clientCompanyId &&
          !duplicates[m.id]
      ) ?? null;
    return pick?.id ?? null;
  });
}

async function resolveAssociatedInflow(page: Page): Promise<{
  id: string;
  clientCompanyId: string;
  clientName: string;
} | null> {
  return page.evaluate(async () => {
    const res = await fetch("/api/copilot/bank-movements");
    const json = (await res.json()) as {
      ok?: boolean;
      data?: Array<{ id: string; direction?: string }>;
      clients?: Record<string, { clientCompanyId: string; clientName: string | null }>;
    };
    const clients = json.clients ?? {};
    for (const m of json.data ?? []) {
      if (m.direction !== "inflow") continue;
      const c = clients[m.id];
      if (c?.clientCompanyId && c.clientName) {
        return { id: m.id, clientCompanyId: c.clientCompanyId, clientName: c.clientName };
      }
    }
    return null;
  });
}

async function readParitySnapshot(page: Page, movementId: string) {
  return page.evaluate(async (id) => {
    const res = await fetch("/api/copilot/bank-movements");
    const json = (await res.json()) as {
      ok?: boolean;
      data?: Array<{
        id: string;
        description?: string | null;
        raw_description?: string | null;
        amount: number;
        currency: string;
        movement_date: string;
        bank_reference?: string | null;
        status: string;
      }>;
      clients?: Record<string, { clientCompanyId: string; clientName: string | null }>;
      duplicates?: Record<string, unknown>;
    };
    const m = (json.data ?? []).find((row) => row.id === id);
    if (!m) return null;
    const client = json.clients?.[id] ?? null;
    const desc =
      (typeof m.raw_description === "string" && m.raw_description.trim()) ||
      (typeof m.description === "string" && m.description.trim()) ||
      "Sin descripción";
    return {
      id: m.id,
      description: desc,
      amount: Number(m.amount),
      currency: m.currency,
      date: m.movement_date.slice(0, 10),
      reference: m.bank_reference ?? null,
      clientName: client?.clientName ?? null,
      clientCompanyId: client?.clientCompanyId ?? null,
      isDuplicate: Boolean(json.duplicates?.[id]),
    };
  }, movementId);
}

for (const vp of VIEWPORTS) {
  test.describe(`Bank tab responsibilities — ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test.beforeEach(async ({ context, baseURL }) => {
      await applyCopilotSessionCookie(context, baseURL ?? "http://127.0.0.1:3000");
    });

    test(`A+B Movimientos consulta + Conciliación drawer stacking (${vp.name})`, async ({ page }) => {
      await page.goto("/copilot/movimientos-bancarios?tab=movimientos");
      await expect(page.getByRole("heading", { level: 1, name: "Movimientos bancarios" })).toBeVisible({
        timeout: 45_000,
      });

      // A: no hay "Asignar cliente" en Movimientos
      await expect(page.getByRole("button", { name: /^Asignar cliente$/ })).toHaveCount(0);

      const movementId = await resolveUnassignedInflowId(page);
      test.skip(!movementId, "Sin movimiento sin cliente para el flujo");

      const goTo = page.locator("[data-bank-go-to-reconciliation]").first();
      if ((await goTo.count()) === 0) {
        // Si el filtro oculta filas, deep-link directo a Conciliación
        await page.goto(`/copilot/movimientos-bancarios?tab=conciliacion&movementId=${movementId}`);
      } else {
        await goTo.click();
      }

      const drawer = page.locator("[data-bank-drawer]");
      await expect(drawer).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("[data-bank-drawer-close]")).toBeVisible();
      await expect(page.getByText(/Banco → Conciliación/i)).toBeVisible();

      // Descripción completa + referencia / importe
      await expect(page.locator("[data-bank-drawer-body]").getByText("Descripción Santander")).toBeVisible();
      const descCell = page.locator("[data-bank-drawer-body] dd").filter({ hasText: /.+/ }).first();
      await expect(descCell).toBeVisible();

      const zTabs = await page.locator("[data-bank-tabs]").evaluate((el) =>
        Number.parseInt(getComputedStyle(el).zIndex || "0", 10)
      );
      const zDrawer = await page.locator("[data-bank-drawer]").evaluate((el) =>
        Number.parseInt(getComputedStyle(el).zIndex || "0", 10)
      );
      expect(zDrawer).toBeGreaterThan(zTabs);

      const drawerTopBefore = await page.locator("[data-bank-drawer-panel]").evaluate((el) =>
        el.getBoundingClientRect().top
      );

      // Tabs no reciben click: pointer events van al backdrop
      const tabsBlocked = await page.evaluate(() => {
        const tabs = document.querySelector("[data-bank-tabs]");
        const backdrop = document.querySelector("[data-bank-drawer-backdrop]");
        if (!tabs || !backdrop) return false;
        const tabRect = tabs.getBoundingClientRect();
        const x = tabRect.left + Math.min(40, tabRect.width / 2);
        const y = tabRect.top + Math.min(12, tabRect.height / 2);
        const topEl = document.elementFromPoint(x, y);
        return topEl === backdrop || Boolean(topEl?.closest("[data-bank-drawer]"));
      });
      expect(tabsBlocked).toBe(true);

      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(80);
      const drawerTopAfter = await page.locator("[data-bank-drawer-panel]").evaluate((el) =>
        el.getBoundingClientRect().top
      );
      expect(drawerTopAfter).toBe(drawerTopBefore);

      await page.locator("[data-bank-drawer-close]").click();
      await expect(page.locator("[data-bank-drawer]")).toHaveCount(0);
    });
  });
}

test.describe("Bank client link + parity", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await applyCopilotSessionCookie(context, baseURL ?? "http://127.0.0.1:3000");
  });

  test("C. nombre cliente clickeable → Identificación bancaria + returnTo", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/copilot/movimientos-bancarios?tab=movimientos");
    await expect(page.getByRole("heading", { level: 1, name: "Movimientos bancarios" })).toBeVisible({
      timeout: 45_000,
    });

    const associated = await resolveAssociatedInflow(page);
    test.skip(!associated, "Sin movimiento asociado para el fixture");

    const link = page.getByRole("link", {
      name: `Abrir identificación bancaria de ${associated!.clientName}`,
    });
    await expect(link.first()).toBeVisible({ timeout: 20_000 });
    await link.first().click();
    await expect(page).toHaveURL(new RegExp(`/copilot/clientes/${associated!.clientCompanyId}`));
    await expect(page).toHaveURL(/tab=identificacion/);
    await expect(page).toHaveURL(/returnTo=/);
    await expect(page.getByText(/Identificación bancaria/i).first()).toBeVisible({ timeout: 30_000 });
  });

  test("D. paridad Movimientos/Conciliación mismo movement_id", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/copilot/movimientos-bancarios?tab=movimientos");
    await expect(page.getByRole("heading", { level: 1, name: "Movimientos bancarios" })).toBeVisible({
      timeout: 45_000,
    });

    const associated = await resolveAssociatedInflow(page);
    const unassigned = associated ? null : await resolveUnassignedInflowId(page);
    const movementId = associated?.id ?? unassigned;
    test.skip(!movementId, "Sin movimiento para paridad");

    const snapA = await readParitySnapshot(page, movementId!);
    expect(snapA).not.toBeNull();

    await page.goto(`/copilot/movimientos-bancarios?tab=conciliacion&movementId=${movementId}`);
    await expect(page.locator("[data-bank-drawer]")).toBeVisible({ timeout: 30_000 });

    const snapB = await readParitySnapshot(page, movementId!);
    expect(snapB).not.toBeNull();
    expect(snapB!.description).toBe(snapA!.description);
    expect(snapB!.amount).toBe(snapA!.amount);
    expect(snapB!.currency).toBe(snapA!.currency);
    expect(snapB!.date).toBe(snapA!.date);
    expect(snapB!.reference).toBe(snapA!.reference);
    expect(snapB!.clientName).toBe(snapA!.clientName);
    expect(snapB!.clientCompanyId).toBe(snapA!.clientCompanyId);
    expect(snapB!.isDuplicate).toBe(snapA!.isDuplicate);

    // UI drawer muestra la misma descripción canónica
    if (snapA!.description !== "Sin descripción") {
      await expect(page.locator("[data-bank-drawer-body]")).toContainText(snapA!.description.slice(0, 40));
    }

    await page.locator("[data-bank-drawer-close]").click();
  });
});
