import { expect, test, type Page } from "@playwright/test";

import { applyCopilotSessionCookie } from "./copilot-session-helper";
import { createSevereCollector } from "./severity-console";

/**
 * FASE BANK-ASSOCIATION-DRAWER-SCROLL-ANCHOR-FIX-002 — E2E real del bug:
 * con "Asignar cliente" abierto, el scroll owner del module shell NO debe
 * moverse (ni el rect del drawer); solo scrollea `[data-bank-drawer-body]`.
 */

const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "desktop-1366", width: 1366, height: 768 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
] as const;

const OPEN_ASSOCIATION_RE = /Asignar cliente|Ver asociación|Ver detalle/;

type Rect = { top: number; bottom: number; left: number; right: number };

test.describe.configure({ timeout: 180_000 });

async function ensureBackgroundScrollable(page: Page) {
  await page.evaluate(() => {
    const owner = document.querySelector("[data-copilot-module-scroll]") as HTMLElement | null;
    if (!owner) return;
    if (owner.scrollHeight > owner.clientHeight + 80) return;
    if (owner.querySelector("[data-e2e-bg-scroll-pad]")) return;
    const pad = document.createElement("div");
    pad.setAttribute("data-e2e-bg-scroll-pad", "1");
    pad.setAttribute("aria-hidden", "true");
    pad.style.height = "3200px";
    owner.appendChild(pad);
  });
}

async function getDrawerRect(page: Page): Promise<Rect | null> {
  return page.evaluate(() => {
    const panel = document.querySelector("[data-bank-drawer-panel]") as HTMLElement | null;
    if (!panel) return null;
    const r = panel.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  });
}

async function ensureDrawerBodyScrollable(page: Page) {
  await page.evaluate(() => {
    const body = document.querySelector("[data-bank-drawer-body]") as HTMLElement | null;
    if (!body) return;
    if (body.scrollHeight > body.clientHeight + 20) return;
    if (body.querySelector("[data-e2e-scroll-pad]")) return;
    const pad = document.createElement("div");
    pad.setAttribute("data-e2e-scroll-pad", "1");
    pad.style.height = "1600px";
    pad.setAttribute("aria-hidden", "true");
    body.appendChild(pad);
  });
}

async function wheelAt(page: Page, selector: string, deltaY: number) {
  const locator = page.locator(selector).first();
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`No bounding box for ${selector}`);
  await page.mouse.move(box.x + Math.min(24, box.width / 2), box.y + Math.min(80, box.height / 2));
  await page.mouse.wheel(0, deltaY);
}

async function resolveMovementId(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const res = await fetch("/api/copilot/bank-movements");
    const json = (await res.json()) as {
      ok?: boolean;
      data?: Array<{ id: string; direction?: string; status?: string }>;
    };
    const rows = json.data ?? [];
    const pick = rows.find((m) => m.direction === "inflow" && m.status !== "ignored") ?? rows[0] ?? null;
    return pick?.id ?? null;
  });
}

async function openAssociationDrawer(page: Page, _tab: "Movimientos" | "Conciliación") {
  // FASE BANK-SIMPLE-RESPONSIBILITY-AND-DRAWER-DETAIL-001 — el panel solo
  // vive en Conciliación; deep-link con movementId fuerza esa tab.
  const movementId = await resolveMovementId(page);
  if (movementId) {
    await page.goto(`/copilot/movimientos-bancarios?tab=conciliacion&movementId=${movementId}`);
  } else {
    await page.goto("/copilot/movimientos-bancarios?tab=conciliacion");
    const openBtn = page.getByRole("button", { name: OPEN_ASSOCIATION_RE });
    const visible = await openBtn
      .first()
      .waitFor({ state: "visible", timeout: 45_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!visible, "Sin CTA ni movimientos para abrir asociación en Conciliación");
    await openBtn.first().scrollIntoViewIfNeeded();
    await openBtn.first().click();
  }

  await expect(page.locator("[data-bank-drawer-panel]")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /Asignar cliente|Ver asociación/ })).toBeVisible();
  await expect(page.locator("[data-bank-drawer-footer]")).toBeVisible({ timeout: 25_000 });
}

async function runScrollLockAssertions(page: Page, closeVia: "escape" | "backdrop") {
  await ensureDrawerBodyScrollable(page);

  const restoreTarget = await page.evaluate(() => {
    const owner = document.querySelector("[data-copilot-module-scroll]") as HTMLElement | null;
    if (!owner) return 0;
    const captured = owner.scrollTop;
    if (captured > 0) return captured;
    owner.scrollTop = 240;
    return 0;
  });

  const backgroundScrollBefore = await page.evaluate(() => {
    const owner = document.querySelector("[data-copilot-module-scroll]") as HTMLElement | null;
    return owner?.scrollTop ?? -1;
  });
  expect(backgroundScrollBefore).toBeGreaterThan(0);

  const drawerRectBefore = await getDrawerRect(page);
  expect(drawerRectBefore).not.toBeNull();

  await expect(page.locator("[data-bank-drawer-header]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cerrar" }).first()).toBeVisible();
  await expect(page.locator("[data-bank-drawer-footer]")).toBeVisible();

  await wheelAt(page, "[data-bank-drawer-backdrop]", 480);
  await page.waitForTimeout(100);

  const backgroundScrollAfterWheel = await page.evaluate(() => {
    const owner = document.querySelector("[data-copilot-module-scroll]") as HTMLElement | null;
    return owner?.scrollTop ?? -1;
  });
  const drawerRectAfterWheel = await getDrawerRect(page);
  expect(backgroundScrollAfterWheel).toBe(backgroundScrollBefore);
  expect(drawerRectAfterWheel!.top).toBe(drawerRectBefore!.top);
  expect(drawerRectAfterWheel!.bottom).toBe(drawerRectBefore!.bottom);

  const bodyScrollBefore = await page.evaluate(() => {
    const body = document.querySelector("[data-bank-drawer-body]") as HTMLElement | null;
    return body?.scrollTop ?? 0;
  });
  await wheelAt(page, "[data-bank-drawer-body]", 420);
  await page.waitForTimeout(100);
  const bodyScrollAfter = await page.evaluate(() => {
    const body = document.querySelector("[data-bank-drawer-body]") as HTMLElement | null;
    return body?.scrollTop ?? 0;
  });
  expect(bodyScrollAfter).toBeGreaterThan(bodyScrollBefore);

  const backgroundStillLocked = await page.evaluate(() => {
    const owner = document.querySelector("[data-copilot-module-scroll]") as HTMLElement | null;
    return owner?.scrollTop ?? -1;
  });
  expect(backgroundStillLocked).toBe(backgroundScrollBefore);

  if (closeVia === "escape") {
    await page.keyboard.press("Escape");
  } else {
    await page.locator("[data-bank-drawer-backdrop]").click({ position: { x: 8, y: 8 }, force: true });
  }
  await expect(page.locator("[data-bank-drawer-panel]")).toHaveCount(0);

  const backgroundScrollAfterClose = await page.evaluate(() => {
    const owner = document.querySelector("[data-copilot-module-scroll]") as HTMLElement | null;
    return owner?.scrollTop ?? -1;
  });
  expect(backgroundScrollAfterClose).toBe(restoreTarget);

  const noHOverflow = await page.evaluate(() => {
    const de = document.documentElement;
    return de.scrollWidth <= de.clientWidth + 1;
  });
  expect(noHOverflow).toBe(true);
}

for (const vp of VIEWPORTS) {
  test.describe(`Association drawer scroll lock — ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test.beforeEach(async ({ context, baseURL }) => {
      await applyCopilotSessionCookie(context, baseURL ?? "http://127.0.0.1:3000");
    });

    test(`Movimientos — wheel bloqueado + Escape restaura scroll (${vp.name})`, async ({ page }) => {
      const severe = createSevereCollector();
      severe.attach(page);

      await page.goto("/copilot/movimientos-bancarios");
      await expect(page.getByRole("heading", { level: 1, name: "Movimientos bancarios" })).toBeVisible();
      await openAssociationDrawer(page, "Movimientos");
      // Pad + scroll bajo el lock (el deep-link abre en scrollTop 0).
      await ensureBackgroundScrollable(page);
      await runScrollLockAssertions(page, "escape");
      severe.assertClean();
    });

    test(`Conciliación — wheel bloqueado + backdrop restaura scroll (${vp.name})`, async ({ page }) => {
      const severe = createSevereCollector();
      severe.attach(page);

      await page.goto("/copilot/movimientos-bancarios");
      await expect(page.getByRole("heading", { level: 1, name: "Movimientos bancarios" })).toBeVisible();
      await openAssociationDrawer(page, "Conciliación");
      await ensureBackgroundScrollable(page);
      await runScrollLockAssertions(page, "backdrop");
      severe.assertClean();
    });
  });
}
