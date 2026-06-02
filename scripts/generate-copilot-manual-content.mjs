/**
 * Generates lib/copilot-manual/sections.generated.ts from app/copilot/manual/page.tsx
 * Run: node scripts/generate-copilot-manual-content.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const pagePath = path.join(ROOT, "app/copilot/manual/page.tsx");
const outPath = path.join(ROOT, "lib/copilot-manual/sections.generated.ts");
const src = fs.readFileSync(pagePath, "utf8");

function unescapeJs(s) {
  return s
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/&ldquo;/g, "\u00AB")
    .replace(/&rdquo;/g, "\u00BB")
    .replace(/&quot;/g, '"')
    .replace(/«/g, "\u00AB")
    .replace(/»/g, "\u00BB")
    .replace(/<strong>/g, "")
    .replace(/<\/strong>/g, "")
    .replace(/<em>/g, "")
    .replace(/<\/em>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\{\s*\\?"\s*\\?"\s*\}/g, " ")
    .replace(/\{\s*"\\?"\s*\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractStringArray(inner) {
  const strings = [];
  const strRe = /"((?:\\.|[^"\\])*)"/g;
  let sm;
  while ((sm = strRe.exec(inner))) {
    strings.push(unescapeJs(sm[1]));
  }
  return strings;
}

function extractBulletsOrSteps(block, tag) {
  const re = new RegExp(`<${tag}[^>]*items=\\{\\[([\\s\\S]*?)\\]\\}`, "g");
  const items = [];
  let m;
  while ((m = re.exec(block))) {
    const parsed = extractStringArray(m[1]);
    if (parsed.length) items.push(parsed);
  }
  return items;
}

function extractCallouts(block) {
  const callouts = [];
  const re = /<Callout variant="(tip|warning|info)">([\s\S]*?)<\/Callout>/g;
  let m;
  while ((m = re.exec(block))) {
    callouts.push({ variant: m[1], text: unescapeJs(m[2]) });
  }
  return callouts;
}

function extractLabeledRows(block) {
  const entries = [];
  const re =
    /\{\s*(?:term|label):\s*"([^"]+)"[\s\S]*?(?:def|desc):\s*"((?:\\.|[^"\\])*)"\s*\}/g;
  let m;
  while ((m = re.exec(block))) {
    entries.push({ term: unescapeJs(m[1]), definition: unescapeJs(m[2]) });
  }
  return entries;
}

function extractRoleCards(block) {
  const roles = [];
  const re =
    /role:\s*"([^"]+)"[\s\S]*?label:\s*"([^"]+)"[\s\S]*?desc:\s*"((?:\\.|[^"\\])*)"/g;
  let m;
  while ((m = re.exec(block))) {
    roles.push({
      role: m[1],
      label: unescapeJs(m[2]),
      description: unescapeJs(m[3]),
    });
  }
  return roles;
}

function extractStatusRows(block) {
  const rows = [];
  const re =
    /pill:\s*"(ok|warning|critical)"[\s\S]*?title:\s*"([^"]+)"[\s\S]*?desc:\s*"((?:\\.|[^"\\])*)"/g;
  let m;
  while ((m = re.exec(block))) {
    rows.push({
      level: m[1],
      title: unescapeJs(m[2]),
      description: unescapeJs(m[3]),
    });
  }
  return rows;
}

function extractSubsectionBoxes(block) {
  const boxes = [];
  const re =
    /<div className=\{`\$\{C\.card\}[^`]*`[^>]*>([\s\S]*?)<\/div>\s*(?=<(?:div className=\{`\$\{C\.card\}|Callout|<div className="flex|<\/>))/g;
  let m;
  while ((m = re.exec(block))) {
    const inner = m[1];
    const titleM = inner.match(
      /text-\[11px\][^>]*>\s*([^<]+)\s*<\/p>/
    );
    if (!titleM) continue;
    const title = titleM[1].trim();
    const subBlocks = [];

    const introP = inner.match(
      /<p className="(?:mb-3 )?text-sm[^"]*"[^>]*>([\s\S]*?)<\/p>/
    );
    if (introP) {
      const t = unescapeJs(introP[1]);
      if (t.length > 15) subBlocks.push({ type: "paragraph", text: t });
    }

    const bullets = extractBulletsOrSteps(inner, "Bullets");
    for (const items of bullets) {
      subBlocks.push({ type: "bullets", items });
    }
    const steps = extractBulletsOrSteps(inner, "Steps");
    for (const items of steps) {
      subBlocks.push({ type: "steps", items });
    }

    const labeled = extractLabeledRows(inner);
    if (labeled.length) subBlocks.push({ type: "labeled", entries: labeled });

    const innerCallouts = extractCallouts(inner);
    for (const c of innerCallouts) {
      subBlocks.push({ type: "callout", variant: c.variant, text: c.text });
    }

    const exampleM = inner.match(
      /rounded-xl bg-slate-50[\s\S]*?<p className="leading-relaxed">([\s\S]*?)<\/p>/
    );
    if (exampleM) {
      subBlocks.push({
        type: "callout",
        variant: "info",
        text: `Ejemplo: ${unescapeJs(exampleM[1])}`,
      });
    }

    if (subBlocks.length) boxes.push({ title, blocks: subBlocks });
  }
  return boxes;
}

function extractTopParagraphs(block) {
  const paras = [];
  const re = /<p className="text-sm leading-relaxed[^"]*"[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = re.exec(block))) {
    const t = unescapeJs(m[1]);
    if (t.length > 20) paras.push(t);
  }
  return paras;
}

function extractStandaloneBullets(block) {
  const all = extractBulletsOrSteps(block, "Bullets");
  const inSub = JSON.stringify(extractSubsectionBoxes(block));
  return all.filter((items) => {
    const key = items[0]?.slice(0, 40);
    return !inSub.includes(key);
  });
}

function parseSectionChunk(chunk) {
  const blocks = [];
  const idM = chunk.match(/id:\s*"([^"]+)"/);
  const titleM = chunk.match(/title:\s*"([^"]+)"/);
  const id = idM?.[1] ?? "unknown";
  const title = titleM?.[1] ?? id;

  const contentM = chunk.match(/content:\s*\(\s*<>[\s\S]*?<\/>\s*\),/);
  const inner = contentM ? contentM[0] : chunk;

  for (const p of extractTopParagraphs(inner).slice(0, 2)) {
    blocks.push({ type: "paragraph", text: p });
  }

  for (const c of extractCallouts(inner)) {
    if (!inner.includes(`rounded-2xl border`) || inner.indexOf(c.text.slice(0, 30)) < 500) {
      blocks.push({ type: "callout", variant: c.variant, text: c.text });
    }
  }

  const roles = extractRoleCards(inner);
  if (roles.length) {
    blocks.push({ type: "roles", entries: roles });
  }

  const status = extractStatusRows(inner);
  if (status.length) {
    blocks.push({ type: "status", entries: status });
  }

  for (const box of extractSubsectionBoxes(inner)) {
    blocks.push({ type: "subsection", title: box.title, blocks: box.blocks });
  }

  for (const items of extractStandaloneBullets(inner)) {
    blocks.push({ type: "bullets", items });
  }

  const extraParas = extractTopParagraphs(inner).slice(2);
  for (const p of extraParas) {
    if (!blocks.some((b) => b.type === "paragraph" && b.text === p)) {
      blocks.push({ type: "paragraph", text: p });
    }
  }

  const labeledAll = extractLabeledRows(inner);
  if (labeledAll.length && !blocks.some((b) => b.type === "glossary")) {
    blocks.push({ type: "glossary", entries: labeledAll });
  }

  return { id, title, blocks };
}

function extractFaq(src) {
  const faqStart = src.indexOf("const FAQ:");
  const faqEnd = src.indexOf("function FaqBlock");
  const chunk = src.slice(faqStart, faqEnd);
  const items = [];
  const re = /q:\s*"((?:\\.|[^"\\])*)",[\s\S]*?a:\s*(?:"((?:\\.|[^"\\])*)"|([\s\S]*?)(?=,\s*\n\s*\{|\n\];))/g;
  let m;
  while ((m = re.exec(chunk))) {
    const q = unescapeJs(m[1]);
    let a;
    if (m[2]) {
      a = unescapeJs(m[2]);
    } else {
      const raw = m[3] ?? "";
      const navM = raw.match(/label="([^"]+)"[^/]*\/>\s*\.\s*<\/span>/);
      const navM2 = raw.match(/label="([^"]+)"/g);
      if (navM2?.length) {
        const labels = navM2.map((x) => x.match(/label="([^"]+)"/)[1]);
        const hrefM = raw.match(/href="([^"]+)"/g);
        const hrefs = hrefM?.map((x) => x.match(/href="([^"]+)"/)[1]) ?? [];
        a = labels
          .map((l, i) => `${l} (${hrefs[i] ?? "/copilot"})`)
          .join(" y ");
        if (raw.includes("En ")) a = `En ${a}.`;
      } else {
        a = unescapeJs(raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
      }
    }
    if (q && a) items.push({ q, a });
  }
  return items;
}

function extractFiveMinute(src) {
  const m = src.match(
    /Copilot en 5 minutos[\s\S]*?<Steps\s+items=\{\[([\s\S]*?)\]\}/
  );
  return m ? extractStringArray(m[1]) : [];
}

function extractDailyFlow(src) {
  const m = src.match(
    /Flujo recomendado del día[\s\S]*?\[\s*\{[\s\S]*?\}\s*\]\.map\(\(row\)/
  );
  if (!m) return [];
  const block = m[0];
  const steps = [];
  const rowRe =
    /step:\s*(\d+)[\s\S]*?label:\s*"([^"]+)"[\s\S]*?desc:\s*"([^"]+)"[\s\S]*?href:\s*"([^"]+)"/g;
  let rm;
  while ((rm = rowRe.exec(block))) {
    steps.push({
      step: Number(rm[1]),
      label: rm[2],
      description: rm[3],
      href: rm[4],
    });
  }
  return steps;
}

function tsString(s) {
  return JSON.stringify(s).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function emitBlocks(blocks, indent) {
  const lines = [];
  for (const b of blocks) {
    switch (b.type) {
      case "paragraph":
        lines.push(`${indent}{ type: "paragraph", text: ${tsString(b.text)} },`);
        break;
      case "bullets":
        lines.push(
          `${indent}{ type: "bullets", items: ${JSON.stringify(b.items)} },`
        );
        break;
      case "steps":
        lines.push(
          `${indent}{ type: "steps", items: ${JSON.stringify(b.items)} },`
        );
        break;
      case "callout":
        lines.push(
          `${indent}{ type: "callout", variant: ${JSON.stringify(b.variant)}, text: ${tsString(b.text)} },`
        );
        break;
      case "subsection":
        lines.push(`${indent}{`);
        lines.push(`${indent}  type: "subsection",`);
        lines.push(`${indent}  title: ${tsString(b.title)},`);
        lines.push(`${indent}  blocks: [`);
        lines.push(...emitBlocks(b.blocks, indent + "    "));
        lines.push(`${indent}  ],`);
        lines.push(`${indent}},`);
        break;
      case "labeled":
      case "glossary":
        lines.push(
          `${indent}{ type: "glossary", entries: ${JSON.stringify(b.entries)} },`
        );
        break;
      case "roles":
        lines.push(
          `${indent}{ type: "roles", entries: ${JSON.stringify(b.entries)} },`
        );
        break;
      case "status":
        lines.push(
          `${indent}{ type: "status", entries: ${JSON.stringify(b.entries)} },`
        );
        break;
      default:
        break;
    }
  }
  return lines;
}

const sectionsSrc = src.slice(
  src.indexOf("const SECTIONS:"),
  src.indexOf("// ─── FAQ")
);
const allMatches = [...sectionsSrc.matchAll(/\{\s*\n\s*id:\s*"([^"]+)"/g)].map(
  (m) => ({ index: m.index + src.indexOf("const SECTIONS:"), id: m[1] })
);

const sections = [];
for (let i = 0; i < allMatches.length; i++) {
  const start = allMatches[i].index;
  const end =
    i + 1 < allMatches.length ? allMatches[i + 1].index : src.indexOf("// ─── FAQ");
  const chunk = src.slice(start, end);
  sections.push(parseSectionChunk(chunk));
}

const faq = extractFaq(src);
const fiveMinute = extractFiveMinute(src);
const dailyFlow = extractDailyFlow(src);

const loginSection = {
  id: "inicio-sesion",
  title: "Inicio de sesión",
  blocks: [
    {
      type: "paragraph",
      text: "El acceso a Copilot es con usuario y PIN en la pantalla de login. No usa enlaces externos ni registro público.",
    },
    {
      type: "steps",
      items: [
        "Ir a /login.",
        "Ingresar Usuario y PIN provistos por quien administra el workspace.",
        "Pulsar Entrar.",
        "Si las credenciales son válidas, Copilot redirige a /copilot/hoy.",
      ],
    },
    {
      type: "bullets",
      items: [
        "Superadmin, usuario y demo_readonly usan el mismo formulario; el rol define permisos después del login.",
        "En solo lectura verás un badge en la barra superior (Solo lectura o Demo en móvil).",
        "Superadmin no tiene badge y puede modificar datos operativos.",
      ],
    },
  ],
};

const importadorSection = {
  id: "importador-santander",
  title: "Importador bancario Santander",
  tocTitle: "Importador bancario Santander",
  blocks: [
    {
      type: "paragraph",
      text: "En Tesorería → Movimientos podés subir extractos CSV, Excel o PDF exportados desde Santander para conciliar con Copilot y Zeta.",
    },
    {
      type: "bullets",
      items: [
        "Formatos: CSV, Excel (XLSX) y PDF con texto extraíble (sin OCR).",
        "Detección USD y UYU según el extracto.",
        "Usuario y demo_readonly: vista previa permitida (no persiste ni modifica caja).",
        "Guardar o importar extracto: solo superadmin.",
        "Cuenta del extracto debe ser compatible con la cuenta seleccionada; si no, el guardado se bloquea.",
        "Estados por fila: Coincide, Falta en Copilot, Falta en Zeta, Posible coincidencia.",
        "Preview no crea recibos en Zeta ni movimientos de caja automáticos.",
        "Para impactar caja registrá o confirmá el movimiento en Tesorería por separado.",
      ],
    },
    {
      type: "callout",
      variant: "warning",
      text: "Guardar requiere superadmin. La vista previa no modifica caja.",
    },
  ],
};

const rutinasSection = {
  id: "rutinas",
  title: "Rutinas recomendadas",
  blocks: [
    {
      type: "subsection",
      title: "Copilot en 5 minutos",
      blocks: [{ type: "steps", items: fiveMinute }],
    },
    {
      type: "subsection",
      title: "Flujo recomendado del día",
      blocks: [
        {
          type: "paragraph",
          text: "Si solo tenés 10 minutos, hacé esto en orden.",
        },
        {
          type: "steps",
          items: dailyFlow.map(
            (r) => `${r.step}. ${r.label} — ${r.description} (${r.href})`
          ),
        },
      ],
    },
  ],
};

const faqSection = {
  id: "faq",
  title: "Preguntas frecuentes",
  blocks: faq.map((item) => ({
    type: "subsection",
    title: item.q,
    blocks: [{ type: "paragraph", text: item.a }],
  })),
};

const glosarioDeuda = sections.find((s) => s.id === "glosario-deuda");
const glosarioDeudaChunk = sectionsSrc.slice(
  sectionsSrc.indexOf('id: "glosario-deuda"'),
  sectionsSrc.length
);
const glosarioEntries = extractLabeledRows(glosarioDeudaChunk);
const glosarioBlocks = glosarioDeuda?.blocks?.filter((b) => b.type !== "glossary") ?? [
  {
    type: "paragraph",
    text: "Referencia rápida de los términos que Copilot usa para describir la deuda de clientes.",
  },
];
if (glosarioEntries.length) {
  glosarioBlocks.push({ type: "glossary", entries: glosarioEntries });
}
const glosarioSection = {
  id: "glosario",
  title: "Glosario — Términos de deuda de clientes",
  blocks: glosarioBlocks,
};

const allSections = [
  ...sections.filter((s) => s.id !== "glosario-deuda"),
  loginSection,
  importadorSection,
  rutinasSection,
  faqSection,
  { ...glosarioSection, id: "glosario" },
];

const out = `/* eslint-disable max-lines -- auto-generated from app/copilot/manual/page.tsx */
/** Generated by scripts/generate-copilot-manual-content.mjs — do not edit by hand. */
import type { CopilotManualSection } from "./types";

export const COPILOT_MANUAL_GENERATED_SECTIONS: CopilotManualSection[] = [
${allSections
  .map((s) => {
    return `  {
    id: ${JSON.stringify(s.id)},
    title: ${JSON.stringify(s.title)},
    includeInToc: true,
    blocks: [
${emitBlocks(s.blocks, "      ").join("\n")}
    ],
  },`;
  })
  .join("\n")}
];

export const COPILOT_MANUAL_FIVE_MINUTE_STEPS: string[] = ${JSON.stringify(fiveMinute, null, 2)};

export const COPILOT_MANUAL_DAILY_FLOW = ${JSON.stringify(dailyFlow, null, 2)} as const;

export const COPILOT_MANUAL_FAQ: Array<{ q: string; a: string }> = ${JSON.stringify(faq, null, 2)};
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out, "utf8");
console.log(
  `Wrote ${allSections.length} sections (${sections.length} from page + extras) to ${outPath}`
);
