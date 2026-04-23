/* eslint-disable no-console */
/**
 * Convierte HTML crudo (docs/zeta/raw/*.html) a Markdown limpio (docs/zeta/markdown/).
 * No modifica raw/ ni el crawler. Lee todos los .html del directorio raw.
 */

const fs = require("fs/promises");
const path = require("path");
const cheerio = require("cheerio");
const TurndownService = require("turndown");
const { gfm } = require("turndown-plugin-gfm");

const RAW_DIR = path.resolve(process.cwd(), "docs/zeta/raw");
const RAW_INDEX_PATH = path.join(RAW_DIR, "index.json");
const OUT_DIR = path.resolve(process.cwd(), "docs/zeta/markdown");
const OUT_INDEX_PATH = path.join(OUT_DIR, "index.json");

const AYUDA_PREFIX = "https://zetasoftware.info/ayuda/";

/**
 * Primer segmento de ruta bajo `/ayuda/` (p. ej. `apis`, `configuracion`).
 * Sirve para filtrar en UI o motores sin parsear URLs; `null` si no aplica.
 */
function deriveAyudaBranch(urlStr) {
  if (!urlStr || typeof urlStr !== "string") return null;
  try {
    const u = new URL(urlStr);
    const parts = u.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
    if (parts[0] !== "ayuda" || !parts[1]) return null;
    return String(parts[1]).toLowerCase();
  } catch {
    return null;
  }
}

function normalizeWhitespace(text) {
  return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Mapa saved_file (relativo repo) → metadata del crawl. */
async function loadRawIndexMap() {
  const map = new Map();
  try {
    const raw = await fs.readFile(RAW_INDEX_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return map;
    for (const row of parsed) {
      if (row && typeof row.saved_file === "string") {
        map.set(row.saved_file, row);
      }
    }
  } catch {
    // Sin index: se infiere todo desde HTML.
  }
  return map;
}

function extractTitleFromHtml($) {
  const t = $("title").first().text().trim();
  if (t) return t;
  const h1 = $("h1").first().text().trim();
  return h1 || null;
}

function extractMainContent(html) {
  const $ = cheerio.load(html, { decodeEntities: false });

  $(
    "script, style, noscript, iframe, svg, canvas, form, button, input, select, textarea"
  ).remove();

  $(
    "header, footer, nav, aside, .sidebar, .menu, .navbar, .breadcrumbs, .breadcrumb, .pagination, .toc, .table-of-contents, .site-header, .site-footer"
  ).remove();

  const candidates = [
    "main",
    "article",
    ".post-content",
    ".entry-content",
    ".content",
    "#content",
    ".page-content",
    ".documentation",
  ];

  let contentNode = null;
  for (const sel of candidates) {
    const node = $(sel).first();
    if (node.length && node.text().trim().length > 200) {
      contentNode = node;
      break;
    }
  }

  if (!contentNode) {
    contentNode = $("body");
  }

  contentNode
    .find(
      ".nav, .navigation, .share, .social, .related, .ads, .advertisement, .comments, .comment, .cookie, .newsletter"
    )
    .remove();

  return contentNode.html() || "";
}

function collectInternalAyudaLinks(mainHtml, baseUrl) {
  const $ = cheerio.load(mainHtml || "", { decodeEntities: false });
  const seen = new Set();
  const out = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
    let abs;
    try {
      abs = new URL(href, baseUrl || AYUDA_PREFIX).href;
    } catch {
      return;
    }
    if (!abs.startsWith(AYUDA_PREFIX)) return;
    const clean = abs.split("#")[0];
    if (seen.has(clean)) return;
    seen.add(clean);
    const label = $(el).text().replace(/\s+/g, " ").trim() || clean;
    out.push({ url: clean, label });
  });

  out.sort((a, b) => a.url.localeCompare(b.url));
  return out;
}

function formatLinksSection(links) {
  if (!links.length) {
    return "_No se detectaron enlaces internos bajo /ayuda/._\n";
  }
  return links.map((l) => `- [${l.label.replace(/]/g, "\\]")}](${l.url})`).join("\n") + "\n";
}

function createTurndown() {
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    emDelimiter: "_",
    bulletListMarker: "-",
  });
  service.use(gfm);

  service.addRule("fencedCodeBlocks", {
    filter: (node) => node.nodeName === "PRE",
    replacement: (_content, node) => {
      const codeNode = node.firstChild && node.firstChild.nodeName === "CODE" ? node.firstChild : node;
      const codeText = codeNode.textContent || "";
      return `\n\n\`\`\`\n${codeText.replace(/\n$/, "")}\n\`\`\`\n\n`;
    },
  });

  return service;
}

function buildMarkdownDocument({ title, urlOriginal, urlFinal, bodyMd, linksMd }) {
  const uo = urlOriginal || "_(no disponible)_";
  const uf = urlFinal || "_(no disponible)_";
  return `# ${title}

Fuente:
- URL original: ${uo}
- URL final: ${uf}

---

## Contenido

${bodyMd}

---

## Links relacionados

${linksMd}`;
}

async function run() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const indexMap = await loadRawIndexMap();
  const turndown = createTurndown();

  const names = (await fs.readdir(RAW_DIR))
    .filter((n) => n.endsWith(".html"))
    .sort();

  const outIndex = [];
  let ok = 0;
  let errors = 0;

  for (let i = 0; i < names.length; i++) {
    const fileName = names[i];
    const sourceRel = path.posix.join("docs/zeta/raw", fileName.replace(/\\/g, "/"));
    const sourcePath = path.join(RAW_DIR, fileName);
    const meta = indexMap.get(sourceRel) || {};
    const baseUrl = meta.url_final || meta.url_original || AYUDA_PREFIX;
    const processedAt = new Date().toISOString();

    const stem = path.basename(fileName, ".html");
    const outputRel = path.posix.join("docs/zeta/markdown", `${stem}.md`);
    const outputPath = path.join(OUT_DIR, `${stem}.md`);

    try {
      const html = await fs.readFile(sourcePath, "utf8");
      const $doc = cheerio.load(html, { decodeEntities: false });
      let title = String(meta.title || "").trim() || extractTitleFromHtml($doc) || "Sin título";

      const mainHtml = extractMainContent(html);
      const bodyMd =
        mainHtml.trim().length > 0
          ? normalizeWhitespace(turndown.turndown(mainHtml))
          : "_No se pudo extraer contenido principal; revisá el HTML fuente._";

      const links = collectInternalAyudaLinks(mainHtml, baseUrl);
      const linksMd = formatLinksSection(links);

      const fullMd = buildMarkdownDocument({
        title,
        urlOriginal: meta.url_original || null,
        urlFinal: meta.url_final || null,
        bodyMd,
        linksMd,
      });

      await fs.writeFile(outputPath, `${fullMd}\n`, "utf8");

      const canonUrl = meta.url_final || meta.url_original || null;
      outIndex.push({
        source_html: sourceRel,
        output_md: outputRel,
        url_original: meta.url_original || null,
        url_final: meta.url_final || null,
        title,
        processed_at: processedAt,
        ayuda_branch: deriveAyudaBranch(canonUrl),
      });
      ok += 1;
      if ((i + 1) % 25 === 0 || i === names.length - 1) {
        console.log(`[zeta:md] ${i + 1}/${names.length} OK → ${outputRel}`);
      }
    } catch (err) {
      errors += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[zeta:md] ERROR ${sourceRel}: ${msg}`);
      const canonUrlErr = meta.url_final || meta.url_original || null;
      outIndex.push({
        source_html: sourceRel,
        output_md: null,
        url_original: meta.url_original || null,
        url_final: meta.url_final || null,
        title: meta.title || null,
        processed_at: processedAt,
        error: msg,
        ayuda_branch: deriveAyudaBranch(canonUrlErr),
      });
    }
  }

  outIndex.sort((a, b) => String(a.source_html).localeCompare(String(b.source_html)));
  await fs.writeFile(OUT_INDEX_PATH, `${JSON.stringify(outIndex, null, 2)}\n`, "utf8");

  console.log("\n[zeta:md] Resumen");
  console.log(`[zeta:md] Procesados OK: ${ok}`);
  console.log(`[zeta:md] Errores: ${errors}`);
  console.log(`[zeta:md] Total archivos .html: ${names.length}`);
  console.log(`[zeta:md] Markdown: ${OUT_DIR}`);
  console.log(`[zeta:md] Índice: ${OUT_INDEX_PATH}`);
}

run().catch((e) => {
  console.error("[zeta:md] Fatal:", e);
  process.exitCode = 1;
});
