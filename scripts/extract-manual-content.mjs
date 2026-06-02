/**
 * One-off helper: extracts manual section structure from page.tsx into JSON.
 * Run: node scripts/extract-manual-content.mjs
 */
import fs from "node:fs";
import path from "node:path";

const pagePath = path.join(process.cwd(), "app/copilot/manual/page.tsx");
const src = fs.readFileSync(pagePath, "utf8");

function unescapeJs(s) {
  return s
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/«/g, '"')
    .replace(/»/g, '"');
}

function extractStringArrays(block) {
  const items = [];
  const re = /items=\{\[([\s\S]*?)\]\}/g;
  let m;
  while ((m = re.exec(block))) {
    const inner = m[1];
    const strings = [];
    const strRe = /"((?:\\.|[^"\\])*)"/g;
    let sm;
    while ((sm = strRe.exec(inner))) {
      strings.push(unescapeJs(sm[1]));
    }
    if (strings.length) items.push(strings);
  }
  return items;
}

function extractParagraphs(block) {
  const paras = [];
  const re = /<p[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = re.exec(block))) {
    let t = m[1]
      .replace(/<[^>]+>/g, "")
      .replace(/\{[^}]+\}/g, "")
      .trim();
    t = unescapeJs(t.replace(/"/g, ""));
    if (t.length > 20 && !t.startsWith("text-[") && !t.includes("className")) {
      paras.push(t);
    }
  }
  return paras;
}

function extractSubsectionTitles(block) {
  const titles = [];
  const re = /text-\[11px\][^>]*>\s*([^<]+)\s*<\/p>/g;
  let m;
  while ((m = re.exec(block))) {
    const t = m[1].trim();
    if (t && t.length < 120) titles.push(t);
  }
  return titles;
}

const sectionRe = /\{\s*id:\s*"([^"]+)",[\s\S]*?title:\s*"([^"]+)",[\s\S]*?content:\s*\(\s*<>[\s\S]*?<\/>\s*\),/g;

const sections = [];
let match;
const allMatches = [...src.matchAll(/\{\s*id:\s*"([^"]+)"/g)];
for (let i = 0; i < allMatches.length; i++) {
  const id = allMatches[i][1];
  if (id === "openIds" || id === "acciones") continue;
  const start = allMatches[i].index;
  const end = i + 1 < allMatches.length ? allMatches[i + 1].index : src.indexOf("const FAQ");
  const chunk = src.slice(start, end);
  const titleM = chunk.match(/title:\s*"([^"]+)"/);
  const title = titleM ? titleM[1] : id;
  const bulletGroups = extractStringArrays(chunk);
  const paras = extractParagraphs(chunk);
  const subTitles = extractSubsectionTitles(chunk);

  sections.push({ id, title, bulletGroups, paras, subTitles });
}

const out = path.join(process.cwd(), "scripts/manual-extract-preview.json");
fs.writeFileSync(out, JSON.stringify(sections, null, 2), "utf8");
console.log(`Wrote ${sections.length} sections to ${out}`);
