/* eslint-disable no-console */
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const cheerio = require("cheerio");

/** Prefijo estricto del crawl (solo HTML bajo esta rama). */
const ALLOWED_PREFIX = "https://zetasoftware.info/ayuda/";

/** Semilla prioritaria: documentación general de APIs (además de la página bajo Configuración). */
const PRIORITY_SEED = "https://zetasoftware.info/ayuda/apis/";

/** Semilla por defecto (página de APIs bajo empresa); se mantiene por compatibilidad. */
const FALLBACK_SEED =
  process.env.ZETA_CRAWL_START_URL ||
  "https://zetasoftware.info/ayuda/configuracion/empresa/apis/";

const OUTPUT_DIR = path.resolve(process.cwd(), "docs/zeta/raw");
const INDEX_PATH = path.join(OUTPUT_DIR, "index.json");
const DELAY_MS = Number(process.env.ZETA_CRAWL_DELAY_MS || "600");
/** Límite alto por defecto para cubrir ramas grandes (p. ej. /ayuda/apis/) sin quedar cortos. */
const MAX_PAGES = Number(process.env.ZETA_CRAWL_MAX_PAGES || "400");

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
]);

const NON_HTML_EXTENSIONS = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".css",
  ".js",
  ".mjs",
  ".json",
  ".xml",
  ".zip",
  ".rar",
  ".7z",
  ".mp4",
  ".mp3",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".ico",
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeSlug(input) {
  const normalized = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "page";
}

function shortHash(input) {
  return crypto.createHash("sha1").update(input).digest("hex").slice(0, 8);
}

function normalizeUrl(rawUrl, baseUrl = PRIORITY_SEED) {
  try {
    const url = new URL(rawUrl, baseUrl);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    const pathname = url.pathname.replace(/\/{2,}/g, "/");
    url.pathname = pathname.endsWith("/") ? pathname : `${pathname}/`;
    if (![...url.searchParams.keys()].length) {
      url.search = "";
    }
    return url.toString();
  } catch {
    return null;
  }
}

function shouldVisit(urlStr) {
  if (!urlStr.startsWith(ALLOWED_PREFIX)) return false;
  const url = new URL(urlStr);
  const pathname = url.pathname.toLowerCase();
  const ext = path.extname(pathname);
  if (ext && NON_HTML_EXTENSIONS.has(ext)) return false;
  return true;
}

function buildOutputFileName(urlStr, ordinal) {
  const url = new URL(urlStr);
  const cleanPath = url.pathname.replace(/^\/+|\/+$/g, "");
  const slugBase = safeSlug(cleanPath || "ayuda-root");
  const hash = shortHash(urlStr);
  return `${String(ordinal).padStart(4, "0")}-${slugBase}-${hash}.html`;
}

/**
 * Lista de URLs iniciales. Orden: prioridad primero (/ayuda/apis/), luego fallback.
 * Override: `ZETA_CRAWL_START_URLS` (coma-separado, se normalizan y deduplican en orden).
 */
function resolveSeedUrls() {
  const raw = process.env.ZETA_CRAWL_START_URLS;
  if (raw && String(raw).trim()) {
    return String(raw)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [PRIORITY_SEED, FALLBACK_SEED];
}

function buildInitialQueue(seen) {
  const out = [];
  const dup = new Set();
  for (const seed of resolveSeedUrls()) {
    const n = normalizeUrl(seed);
    if (!n || !shouldVisit(n)) {
      throw new Error(`Semilla inválida o fuera de ${ALLOWED_PREFIX}: ${seed}`);
    }
    if (dup.has(n)) continue;
    dup.add(n);
    out.push(n);
    if (!seen.has(n)) seen.add(n);
  }
  return out;
}

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

async function loadIndex() {
  try {
    const raw = await fs.readFile(INDEX_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

async function saveIndex(entries) {
  const sorted = [...entries].sort((a, b) => a.url_original.localeCompare(b.url_original));
  await fs.writeFile(INDEX_PATH, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
}

function extractTitle(html) {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim();
  if (title) return title;
  const h1 = $("h1").first().text().trim();
  return h1 || null;
}

function extractInternalLinks(html, currentUrl) {
  const $ = cheerio.load(html);
  const links = new Set();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const normalized = normalizeUrl(href, currentUrl);
    if (!normalized) return;
    if (!shouldVisit(normalized)) return;
    links.add(normalized);
  });
  return [...links];
}

async function run() {
  await ensureOutputDir();
  const existingIndex = await loadIndex();
  const byOriginalUrl = new Map(existingIndex.map((item) => [item.url_original, item]));
  const seen = new Set(existingIndex.map((item) => item.url_original));

  const queue = buildInitialQueue(seen);
  const results = [...existingIndex];
  let crawledThisRun = 0;

  console.log("[zeta:crawl] Inicio");
  console.log(`[zeta:crawl] Output: ${OUTPUT_DIR}`);
  console.log(`[zeta:crawl] Límite: ${MAX_PAGES}, Delay: ${DELAY_MS}ms`);
  console.log(`[zeta:crawl] Semillas (${queue.length}):`);
  for (const u of queue) console.log(`[zeta:crawl]   - ${u}`);

  while (queue.length > 0 && crawledThisRun < MAX_PAGES) {
    const current = queue.shift();
    if (!current) break;

    const existing = byOriginalUrl.get(current);
    const cacheOk =
      existing &&
      existing.status >= 200 &&
      existing.status < 300 &&
      typeof existing.saved_file === "string";

    if (cacheOk) {
      try {
        const abs = path.resolve(process.cwd(), existing.saved_file);
        const html = await fs.readFile(abs, "utf8");
        const base =
          normalizeUrl(existing.url_final || current, current) || current;
        const nextLinks = extractInternalLinks(html, base);
        let added = 0;
        for (const link of nextLinks) {
          if (seen.has(link)) continue;
          seen.add(link);
          queue.push(link);
          added += 1;
        }
        if (added > 0) {
          console.log(
            `[zeta:crawl] (índice) ${current} → +${added} URL(s) nuevas en cola (sin redescargar)`
          );
        }
        continue;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(
          `[zeta:crawl] No se pudo leer HTML en disco para ${current}, se descarga de red: ${msg}`
        );
      }
    }

    const startedAt = new Date().toISOString();
    let status = 0;
    let finalUrl = current;
    let title = null;
    let savedFile = null;
    let errorMessage = null;

    try {
      const res = await fetch(current, {
        headers: { "user-agent": "summer87-zeta-crawler/1.0" },
      });
      status = res.status;
      finalUrl = normalizeUrl(res.url || current, current) || res.url || current;
      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      const html = await res.text();

      if (!contentType.includes("text/html")) {
        throw new Error(`Contenido no HTML (${contentType || "sin content-type"})`);
      }

      title = extractTitle(html);
      const fileName = buildOutputFileName(current, results.length + 1);
      const fullPath = path.join(OUTPUT_DIR, fileName);
      await fs.writeFile(fullPath, html, "utf8");
      savedFile = `docs/zeta/raw/${fileName}`;

      const nextLinks = extractInternalLinks(html, finalUrl);
      for (const link of nextLinks) {
        if (seen.has(link)) continue;
        seen.add(link);
        queue.push(link);
      }

      crawledThisRun += 1;
      console.log(
        `[zeta:crawl] ${crawledThisRun}/${MAX_PAGES} ${status} ${current} -> ${savedFile}`
      );
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`[zeta:crawl] ERROR ${current}: ${errorMessage}`);
    }

    const entry = {
      url_original: current,
      url_final: finalUrl,
      status,
      title,
      saved_file: savedFile,
      crawled_at: startedAt,
      error: errorMessage,
    };

    const prevIdx = results.findIndex((item) => item.url_original === current);
    if (prevIdx >= 0) {
      results[prevIdx] = entry;
    } else {
      results.push(entry);
    }
    byOriginalUrl.set(current, entry);
    await saveIndex(results);
    await sleep(DELAY_MS);
  }

  console.log("\n[zeta:crawl] Finalizado");
  console.log(`[zeta:crawl] Páginas descargadas en esta ejecución: ${crawledThisRun}`);
  console.log(`[zeta:crawl] Archivo índice: ${INDEX_PATH}`);
}

run().catch((error) => {
  console.error("[zeta:crawl] Fatal:", error);
  process.exitCode = 1;
});
