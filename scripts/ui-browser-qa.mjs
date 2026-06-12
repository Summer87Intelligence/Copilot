#!/usr/bin/env node
/**
 * UI Browser QA — recorre todas las rutas críticas en 3 viewports × 2 themes,
 * captura screenshots, console errors y warnings visuales automatizables.
 *
 * USO:
 *   node scripts/ui-browser-qa.mjs
 *
 * Variables opcionales:
 *   QA_BASE_URL=http://localhost:3001  (default: detección automática 3000→3001→...)
 *   QA_OUT=tmp/ui-qa                    (default: tmp/ui-qa)
 *
 * Requisitos:
 *   - Dev server corriendo en algún puerto local.
 *   - .env.local con NEXT_PUBLIC_SUPABASE_URL para validar cookie firmada.
 *
 * Genera:
 *   tmp/ui-qa/{route}-{theme}-{viewport}.png  (screenshots)
 *   tmp/ui-qa/report.md                       (resumen ejecutivo)
 *   tmp/ui-qa/findings.json                   (datos crudos para inspección)
 */

import { chromium } from "@playwright/test";
import { createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// ─── Config ──────────────────────────────────────────────────────────────────

const OUT_DIR = process.env.QA_OUT ?? "out/ui-qa";
const COOKIE_NAME = "copilot_session";
const SUPERADMIN_USER_ID = "22535d5c-3c6d-4bc4-a9a1-550132a1819b";
const SUPERADMIN_ROLE = "superadmin";
const SUPERADMIN_COMPANY_ID = "040321ff-10fd-4da3-aeca-f1865f879986";
const SUPERADMIN_CRED_VERSION = 1;
const COPILOT_SESSION_TEST_SIGNING_SECRET =
  "copilot-session-test-signing-secret-v1-not-for-production";

const ROUTES = [
  "/copilot/hoy",
  "/copilot/dashboard",
  "/copilot/cartera",
  "/copilot/finanzas",
  "/copilot/clientes",
  "/copilot/tesoreria",
  "/copilot/datos",
  "/copilot/admin",
  "/copilot/alertas",
  "/copilot/reportes",
  "/copilot/manual",
  "/copilot/agentes",
];

const VIEWPORTS = (() => {
  const filter = process.env.QA_VIEWPORTS?.trim();
  const all = [
    { name: "390", width: 390, height: 844 },
    { name: "768", width: 768, height: 1024 },
    { name: "1440", width: 1440, height: 900 },
  ];
  if (!filter || filter === "all") return all;
  const want = new Set(filter.split(","));
  return all.filter((v) => want.has(v.name));
})();

const THEMES = ["light", "dark"];

// Mojibake / replacement-char patterns to detect in rendered HTML.
const MOJIBAKE_PATTERNS = [
  /\bCr\?tico\b/i,
  /\bPer\?odo\b/i,
  /\bTesorer\?a\b/i,
  /\bAtenci\?n\b/i,
  /\bAcci\?n\b/i,
  /\bSituaci\?n\b/i,
  /\bD\?as\b/i,
  /\bM\?s\b/i,
  /\bHist\?rico\b/i,
  /\?lt(ima|imo|imas|imos)\b/i,
  /�/, // replacement char
];

// Critical console message substrings.
const CRITICAL_CONSOLE = [
  "Internal Server Error",
  "ChunkLoadError",
  "Hydration failed",
  "There was an error while hydrating",
  "Cannot read properties of undefined",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildSignedSessionCookie() {
  const payload = `${SUPERADMIN_USER_ID}:${SUPERADMIN_ROLE}:${SUPERADMIN_COMPANY_ID}:${SUPERADMIN_CRED_VERSION}`;
  const sig = createHmac("sha256", COPILOT_SESSION_TEST_SIGNING_SECRET)
    .update(payload, "utf8")
    .digest("hex");
  return `${payload}.${sig}`;
}

async function detectBaseUrl() {
  const fromEnv = process.env.QA_BASE_URL?.trim();
  if (fromEnv) return fromEnv;
  for (const port of [3000, 3001, 3002, 3003, 3004, 3005]) {
    try {
      const r = await fetch(`http://localhost:${port}/login`, {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(2000),
      });
      if (r.status >= 200 && r.status < 600) return `http://localhost:${port}`;
    } catch {
      // try next
    }
  }
  throw new Error(
    "No dev server detected on ports 3000–3005. Start `npm run dev` or set QA_BASE_URL."
  );
}

function slugForRoute(route) {
  return route.replace(/^\//, "").replace(/\//g, "_");
}

// ─── Page checks (executed in the page context) ──────────────────────────────

async function visualWarningsInPage(page) {
  return await page.evaluate(() => {
    const warnings = [];

    // 1. Visible buttons / links with 0×0 box but text content
    const interactables = document.querySelectorAll("button, a, [role='button']");
    for (const el of interactables) {
      const text = el.textContent?.trim() ?? "";
      if (!text) continue;
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      if (cs.opacity === "0") {
        warnings.push({
          kind: "interactable_opacity_0",
          text: text.slice(0, 80),
          tag: el.tagName,
        });
      }
      if (rect.width < 2 || rect.height < 2) {
        warnings.push({
          kind: "interactable_zero_box",
          text: text.slice(0, 80),
          tag: el.tagName,
          width: rect.width,
          height: rect.height,
        });
      }
    }

    // 2. Same-color text vs background (white-on-white / black-on-black)
    function parseRgb(s) {
      const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (!m) return null;
      return [Number(m[1]), Number(m[2]), Number(m[3])];
    }
    function dist(a, b) {
      return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    }
    function bgChain(el) {
      let cur = el;
      while (cur) {
        const cs = getComputedStyle(cur);
        const bg = parseRgb(cs.backgroundColor);
        if (bg && cs.backgroundColor !== "rgba(0, 0, 0, 0)") return bg;
        cur = cur.parentElement;
      }
      return [255, 255, 255];
    }
    const textEls = document.querySelectorAll("p, span, h1, h2, h3, h4, h5, td, th, li, label, button, a");
    let lowContrastCount = 0;
    for (const el of textEls) {
      const text = el.textContent?.trim();
      if (!text || text.length < 2) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      const fg = parseRgb(cs.color);
      if (!fg) continue;
      const bg = bgChain(el);
      if (dist(fg, bg) < 25) {
        lowContrastCount += 1;
        if (lowContrastCount <= 10) {
          warnings.push({
            kind: "low_contrast_text",
            text: text.slice(0, 60),
            fg: cs.color,
            bg: `rgb(${bg.join(",")})`,
          });
        }
      }
    }
    if (lowContrastCount > 10) {
      warnings.push({
        kind: "low_contrast_overflow",
        count: lowContrastCount - 10,
      });
    }

    // 3. Horizontal overflow del body (excluyendo elementos hijos con overflow-x-auto)
    const body = document.body;
    const docW = document.documentElement.clientWidth;
    const bodyScrollW = body.scrollWidth;
    if (bodyScrollW > docW + 4) {
      // Buscamos hijos directos del body que sean los causantes.
      const offenders = [];
      const all = body.querySelectorAll("*");
      for (const el of all) {
        const rect = el.getBoundingClientRect();
        if (rect.right > docW + 4) {
          const cs = getComputedStyle(el);
          const inOverflowScrollable = cs.overflowX === "auto" || cs.overflowX === "scroll";
          // Check if any ancestor handles overflow
          let anc = el.parentElement;
          let ancestorScrolls = false;
          while (anc && anc !== body) {
            const acs = getComputedStyle(anc);
            if (acs.overflowX === "auto" || acs.overflowX === "scroll") {
              ancestorScrolls = true;
              break;
            }
            anc = anc.parentElement;
          }
          if (!inOverflowScrollable && !ancestorScrolls) {
            offenders.push({
              tag: el.tagName,
              cls: (el.getAttribute("class") ?? "").slice(0, 100),
              right: Math.round(rect.right),
              docW,
            });
            if (offenders.length >= 3) break;
          }
        }
      }
      warnings.push({
        kind: "body_overflow_x",
        bodyScrollW,
        docW,
        offenders,
      });
    }

    return warnings;
  });
}

// ─── Main loop ───────────────────────────────────────────────────────────────

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const baseUrl = await detectBaseUrl();
  const cookieValue = buildSignedSessionCookie();
  console.log(`[ui-qa] baseUrl=${baseUrl}`);
  console.log(`[ui-qa] out=${path.resolve(OUT_DIR)}`);
  console.log(`[ui-qa] runs=${ROUTES.length * VIEWPORTS.length * THEMES.length}`);

  const browser = await chromium.launch({ headless: true });
  const findings = [];
  let runIdx = 0;
  const totalRuns = ROUTES.length * VIEWPORTS.length * THEMES.length;

  for (const viewport of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      colorScheme: "light",
    });
    // Inject cookie for the domain.
    const urlObj = new URL(baseUrl);
    await ctx.addCookies([
      {
        name: COOKIE_NAME,
        value: cookieValue,
        domain: urlObj.hostname,
        path: "/",
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
      },
    ]);

    for (const theme of THEMES) {
      for (const route of ROUTES) {
        runIdx += 1;
        const slug = slugForRoute(route);
        const screenshotPath = path.join(
          OUT_DIR,
          `${slug}-${theme}-${viewport.name}.png`
        );
        const consoleErrors = [];
        const pageErrors = [];
        const responseProblems = [];

        const page = await ctx.newPage();
        page.on("console", (msg) => {
          if (msg.type() === "error") consoleErrors.push(msg.text());
        });
        page.on("pageerror", (err) => {
          pageErrors.push(String(err?.stack ?? err));
        });
        page.on("response", (res) => {
          if (res.url().startsWith(baseUrl) && res.status() >= 500) {
            responseProblems.push({ url: res.url(), status: res.status() });
          }
        });

        // Apply theme via initScript before any navigation runs.
        // app/layout.tsx tiene un blocking script que lee localStorage.theme y
        // setea data-theme antes del primer paint. Para que la matriz dark/light
        // realmente cambie, hay que setear ese key.
        await page.addInitScript((t) => {
          try {
            window.localStorage?.setItem("theme", t);
            document.documentElement.setAttribute("data-theme", t);
          } catch {
            // ignore
          }
        }, theme);

        let httpStatus = 0;
        let visualWarnings = [];
        let mojibakeHits = [];
        let started = Date.now();
        try {
          const response = await page.goto(`${baseUrl}${route}`, {
            waitUntil: "domcontentloaded",
            timeout: 30_000,
          });
          httpStatus = response?.status() ?? 0;
          // Hydration + fetch budget acotado para no atascarse en rutas con polling.
          await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
          // Re-apply theme post-hydration en caso de override en mount.
          await page.evaluate((t) => {
            document.documentElement.setAttribute("data-theme", t);
          }, theme);
          await page.waitForTimeout(250);

          // Mojibake scan in raw HTML.
          const html = await page.content();
          for (const pat of MOJIBAKE_PATTERNS) {
            const m = html.match(pat);
            if (m) mojibakeHits.push(m[0]);
          }

          visualWarnings = await visualWarningsInPage(page);

          await page.screenshot({
            path: screenshotPath,
            fullPage: true,
          });
        } catch (err) {
          pageErrors.push(`navigation_failure: ${err?.message ?? String(err)}`);
        }

        const elapsed = Date.now() - started;
        const filteredConsole = consoleErrors.filter(
          (m) =>
            !m.includes("Failed to load resource") || // generic network noise
            CRITICAL_CONSOLE.some((p) => m.includes(p))
        );
        const finding = {
          route,
          theme,
          viewport: viewport.name,
          screenshot: screenshotPath,
          httpStatus,
          elapsedMs: elapsed,
          consoleErrors: filteredConsole,
          pageErrors,
          responseProblems,
          mojibakeHits,
          visualWarnings,
        };
        findings.push(finding);
        const firstErr = pageErrors[0]?.slice(0, 120).replace(/\s+/g, " ") ?? "";
        console.log(
          `[ui-qa] ${runIdx}/${totalRuns} ${theme}/${viewport.name} ${route} → ${httpStatus} ${
            pageErrors.length ? `PAGE_ERR(${firstErr})` : ""
          }${visualWarnings.length ? ` warn=${visualWarnings.length}` : ""}${
            mojibakeHits.length ? ` mojibake=${mojibakeHits.length}` : ""
          }`
        );
        await page.close();
      }
    }
    await ctx.close();
  }
  await browser.close();

  // ── Build report ──
  await writeFile(
    path.join(OUT_DIR, "findings.json"),
    JSON.stringify(findings, null, 2),
    "utf-8"
  );

  function fmt(n) {
    return String(n).padStart(3, " ");
  }

  const okCount = findings.filter(
    (f) =>
      f.httpStatus === 200 &&
      f.pageErrors.length === 0 &&
      f.mojibakeHits.length === 0
  ).length;
  const errorRuns = findings.filter(
    (f) => f.httpStatus !== 200 || f.pageErrors.length > 0
  );
  const consoleWarnRuns = findings.filter((f) => f.consoleErrors.length > 0);
  const mojibakeRuns = findings.filter((f) => f.mojibakeHits.length > 0);
  const visualWarnRuns = findings.filter((f) => f.visualWarnings.length > 0);
  const overflowRuns = findings.filter((f) =>
    f.visualWarnings.some((w) => w.kind === "body_overflow_x")
  );
  const lowContrastRuns = findings.filter((f) =>
    f.visualWarnings.some(
      (w) => w.kind === "low_contrast_text" || w.kind === "low_contrast_overflow"
    )
  );
  const invisibleInteractableRuns = findings.filter((f) =>
    f.visualWarnings.some(
      (w) => w.kind === "interactable_opacity_0" || w.kind === "interactable_zero_box"
    )
  );

  const lines = [];
  lines.push(`# UI Browser QA — report`);
  lines.push("");
  lines.push(`Base URL: \`${baseUrl}\``);
  lines.push(`Total runs: **${findings.length}** (${ROUTES.length} routes × ${THEMES.length} themes × ${VIEWPORTS.length} viewports)`);
  lines.push(`Generated at: \`${new Date().toISOString()}\``);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`| Métrica | Cantidad |`);
  lines.push(`|---|---|`);
  lines.push(`| ✅ OK (200, sin page errors, sin mojibake) | ${okCount}/${findings.length} |`);
  lines.push(`| ❌ HTTP error o page error | ${errorRuns.length} |`);
  lines.push(`| 🟡 Console errors filtrados | ${consoleWarnRuns.length} |`);
  lines.push(`| 🔤 Mojibake detectado | ${mojibakeRuns.length} |`);
  lines.push(`| 👁️  Visual warnings | ${visualWarnRuns.length} |`);
  lines.push(`| ↔️  Body overflow horizontal | ${overflowRuns.length} |`);
  lines.push(`| 🌫️  Bajo contraste detectado | ${lowContrastRuns.length} |`);
  lines.push(`| 🫥 Interactivos invisibles | ${invisibleInteractableRuns.length} |`);
  lines.push("");

  if (errorRuns.length > 0) {
    lines.push("## Rutas con error");
    lines.push("");
    for (const f of errorRuns) {
      lines.push(
        `- \`${f.route}\` (${f.theme}/${f.viewport}) → HTTP ${f.httpStatus}${
          f.pageErrors.length ? ` · page errors=${f.pageErrors.length}` : ""
        }`
      );
      for (const e of f.pageErrors.slice(0, 2)) {
        lines.push(`  - \`${e.slice(0, 200).replace(/\n/g, " ")}\``);
      }
    }
    lines.push("");
  }

  if (mojibakeRuns.length > 0) {
    lines.push("## Mojibake detectado");
    lines.push("");
    for (const f of mojibakeRuns) {
      lines.push(`- \`${f.route}\` (${f.theme}/${f.viewport}): \`${f.mojibakeHits.join("`, `")}\``);
    }
    lines.push("");
  }

  if (overflowRuns.length > 0) {
    lines.push("## Body overflow horizontal");
    lines.push("");
    for (const f of overflowRuns) {
      const w = f.visualWarnings.find((x) => x.kind === "body_overflow_x");
      lines.push(
        `- \`${f.route}\` (${f.theme}/${f.viewport}): bodyScrollW=${w.bodyScrollW} vs docW=${w.docW}`
      );
      for (const o of (w.offenders ?? []).slice(0, 2)) {
        lines.push(`  - <${o.tag}> right=${o.right} class=\`${o.cls}\``);
      }
    }
    lines.push("");
  }

  if (invisibleInteractableRuns.length > 0) {
    lines.push("## Interactivos invisibles (zero box / opacity 0)");
    lines.push("");
    for (const f of invisibleInteractableRuns.slice(0, 20)) {
      const ws = f.visualWarnings.filter(
        (w) => w.kind === "interactable_opacity_0" || w.kind === "interactable_zero_box"
      );
      for (const w of ws.slice(0, 3)) {
        lines.push(
          `- \`${f.route}\` (${f.theme}/${f.viewport}) <${w.tag}> "${w.text}" ${
            w.kind === "interactable_zero_box" ? `box=${w.width}×${w.height}` : "opacity=0"
          }`
        );
      }
    }
    lines.push("");
  }

  if (lowContrastRuns.length > 0) {
    lines.push("## Bajo contraste detectado (heurístico)");
    lines.push("");
    lines.push("Suma fg-bg < 25 (Manhattan) — los casos legítimos pueden falsearse cuando hay transparencia o gradiente.");
    lines.push("");
    const topByRoute = new Map();
    for (const f of lowContrastRuns) {
      const items = f.visualWarnings.filter((w) => w.kind === "low_contrast_text");
      const overflow = f.visualWarnings.find((w) => w.kind === "low_contrast_overflow");
      const key = `${f.route}/${f.theme}/${f.viewport}`;
      topByRoute.set(key, { items: items.slice(0, 4), extra: overflow?.count ?? 0 });
    }
    let printed = 0;
    for (const [key, val] of topByRoute) {
      if (printed >= 12) break;
      lines.push(`- \`${key}\`:`);
      for (const it of val.items) {
        lines.push(`  - "${it.text}" fg=${it.fg} bg=${it.bg}`);
      }
      if (val.extra > 0) lines.push(`  - … +${val.extra} más`);
      printed += 1;
    }
    lines.push("");
  }

  lines.push("## Screenshots");
  lines.push("");
  lines.push(`Total generados: ${findings.length}`);
  lines.push("");
  lines.push(`Carpeta: \`${OUT_DIR}/\``);
  lines.push("");
  lines.push("## Veredicto provisional");
  lines.push("");
  const blocker = errorRuns.length > 0 || mojibakeRuns.length > 0;
  lines.push(blocker ? "❌ NO SEGURO PARA PUSH — hay errores HTTP / mojibake real" : "✅ SEGURO (a confirmar tras revisión manual de screenshots).");

  const reportPath = path.join(OUT_DIR, "report.md");
  await writeFile(reportPath, lines.join("\n"), "utf-8");
  console.log(`[ui-qa] report → ${reportPath}`);

  if (blocker) process.exit(2);
}

main().catch((err) => {
  console.error("[ui-qa] fatal:", err);
  process.exit(1);
});
