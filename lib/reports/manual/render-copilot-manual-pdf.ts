// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require("pdfkit/js/pdfkit.standalone.js") as new (
  opts?: PDFKit.PDFDocumentOptions
) => PDFKit.PDFDocument;

import {
  COPILOT_MANUAL_PRODUCT,
  COPILOT_MANUAL_TAGLINE,
  COPILOT_MANUAL_TITLE,
  COPILOT_MANUAL_TOC_ORDER,
  getCopilotManualSectionsForPdf,
} from "@/lib/copilot-manual-content";
import type {
  CopilotManualBlock,
  CopilotManualSection,
} from "@/lib/copilot-manual/types";

const COLORS = {
  ink: "#1a1a1a",
  muted: "#6b7280",
  accent: "#1f6b4a",
  border: "#d1d5db",
  calloutTip: "#ecfdf5",
  calloutWarn: "#fffbeb",
  calloutInfo: "#eff6ff",
};

const PAGE = { margin: 48, width: 595, height: 842 };
const FOOTER_RESERVE = 40;
const MAX_Y = PAGE.height - PAGE.margin - FOOTER_RESERVE;
const CONTENT_W = PAGE.width - PAGE.margin * 2;

const FOOTER_TEXT = `${COPILOT_MANUAL_PRODUCT} · ${COPILOT_MANUAL_TITLE}`;

/** Normaliza texto para PDF (flechas, comillas, espacios). */
export function normalizeCopilotManualPdfText(text: string): string {
  return text
    .replace(/!\s*[''`]/g, "→")
    .replace(/[''`]/g, "'")
    .replace(/[""]/g, '"')
    .replace(/\u00AB/g, '"')
    .replace(/\u00BB/g, '"')
    .replace(/\s*→\s*/g, " → ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export type RenderCopilotManualPdfOptions = {
  generatedAt?: Date;
};

function formatGeneratedDate(d: Date): string {
  return d.toLocaleDateString("es-UY", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function renderFooter(doc: PDFKit.PDFDocument, pageNum: number) {
  const y = PAGE.height - PAGE.margin - 20;
  doc
    .strokeColor(COLORS.border)
    .moveTo(PAGE.margin, y - 6)
    .lineTo(PAGE.width - PAGE.margin, y - 6)
    .stroke();
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(8)
    .text(FOOTER_TEXT, PAGE.margin, y, { width: CONTENT_W * 0.7, align: "left" });
  doc.text(String(pageNum), PAGE.margin, y, { width: CONTENT_W, align: "right" });
}

type PdfCtx = {
  doc: PDFKit.PDFDocument;
  y: number;
  pageNum: number;
};

function breakPage(ctx: PdfCtx) {
  renderFooter(ctx.doc, ctx.pageNum);
  ctx.doc.addPage();
  ctx.pageNum += 1;
  ctx.y = PAGE.margin;
}

function ensureSpace(ctx: PdfCtx, needed: number) {
  if (ctx.y + needed > MAX_Y) breakPage(ctx);
}

function drawSectionTitle(ctx: PdfCtx, title: string, level: 1 | 2 = 1) {
  ensureSpace(ctx, level === 1 ? 36 : 28);
  ctx.doc
    .fillColor(level === 1 ? COLORS.accent : COLORS.ink)
    .font("Helvetica-Bold")
    .fontSize(level === 1 ? 16 : 12)
    .text(title, PAGE.margin, ctx.y, { width: CONTENT_W });
  ctx.y += level === 1 ? 22 : 18;
  if (level === 1) {
    ctx.doc
      .strokeColor(COLORS.border)
      .moveTo(PAGE.margin, ctx.y)
      .lineTo(PAGE.width - PAGE.margin, ctx.y)
      .stroke();
    ctx.y += 10;
  }
}

function drawParagraph(ctx: PdfCtx, text: string) {
  const t = normalizeCopilotManualPdfText(text);
  ctx.doc.font("Helvetica").fontSize(10).fillColor(COLORS.ink);
  const h = ctx.doc.heightOfString(t, { width: CONTENT_W, lineGap: 4 });
  ensureSpace(ctx, h + 10);
  ctx.doc.text(t, PAGE.margin, ctx.y, { width: CONTENT_W, lineGap: 4 });
  ctx.y += h + 12;
}

function drawBullets(ctx: PdfCtx, items: string[]) {
  const bulletIndent = 14;
  const textW = CONTENT_W - bulletIndent;
  ctx.doc.font("Helvetica").fontSize(10).fillColor(COLORS.ink);
  for (const raw of items) {
    const item = normalizeCopilotManualPdfText(raw);
    const h = ctx.doc.heightOfString(item, { width: textW, lineGap: 3 });
    ensureSpace(ctx, h + 8);
    ctx.doc.circle(PAGE.margin + 4, ctx.y + 5, 2).fill(COLORS.accent);
    ctx.doc.text(item, PAGE.margin + bulletIndent, ctx.y, { width: textW, lineGap: 3 });
    ctx.y += h + 10;
  }
  ctx.y += 6;
}

function drawSteps(ctx: PdfCtx, items: string[]) {
  const numW = 18;
  const textW = CONTENT_W - numW - 4;
  ctx.doc.font("Helvetica").fontSize(10).fillColor(COLORS.ink);
  items.forEach((raw, i) => {
    const item = normalizeCopilotManualPdfText(raw);
    const h = ctx.doc.heightOfString(item, { width: textW, lineGap: 3 });
    ensureSpace(ctx, h + 8);
    ctx.doc
      .font("Helvetica-Bold")
      .fillColor(COLORS.accent)
      .text(String(i + 1), PAGE.margin, ctx.y, { width: numW });
    ctx.doc.font("Helvetica").fillColor(COLORS.ink).text(item, PAGE.margin + numW + 4, ctx.y, {
      width: textW,
      lineGap: 2,
    });
    ctx.y += h + 8;
  });
  ctx.y += 4;
}

function drawRoles(
  ctx: PdfCtx,
  entries: Array<{ role: string; label: string; description: string }>
) {
  for (const { label, description } of entries) {
    const title = normalizeCopilotManualPdfText(label);
    const desc = normalizeCopilotManualPdfText(description);
    ctx.doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.accent);
    const tH = ctx.doc.heightOfString(title, { width: CONTENT_W });
    ctx.doc.font("Helvetica").fontSize(9.5).fillColor(COLORS.ink);
    const dH = ctx.doc.heightOfString(desc, { width: CONTENT_W, lineGap: 2 });
    ensureSpace(ctx, tH + dH + 14);
    ctx.doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.accent).text(title, PAGE.margin, ctx.y);
    ctx.y += tH + 4;
    ctx.doc.font("Helvetica").fontSize(9.5).fillColor(COLORS.ink).text(desc, PAGE.margin, ctx.y, {
      width: CONTENT_W,
      lineGap: 2,
    });
    ctx.y += dH + 12;
  }
}

function drawStatus(
  ctx: PdfCtx,
  entries: Array<{ level: string; title: string; description: string }>
) {
  for (const { title, description } of entries) {
    const line = `${normalizeCopilotManualPdfText(title)}: ${normalizeCopilotManualPdfText(description)}`;
    drawParagraph(ctx, line);
  }
}

function drawCallout(ctx: PdfCtx, variant: "tip" | "warning" | "info", text: string) {
  const normalized = normalizeCopilotManualPdfText(text);
  const bg =
    variant === "warning"
      ? COLORS.calloutWarn
      : variant === "info"
        ? COLORS.calloutInfo
        : COLORS.calloutTip;
  ctx.doc.font("Helvetica").fontSize(9.5).fillColor(COLORS.ink);
  const h = ctx.doc.heightOfString(normalized, { width: CONTENT_W - 16, lineGap: 3 });
  const boxH = h + 16;
  ensureSpace(ctx, boxH + 10);
  ctx.doc.roundedRect(PAGE.margin, ctx.y, CONTENT_W, boxH, 4).fill(bg);
  ctx.doc.text(normalized, PAGE.margin + 8, ctx.y + 8, {
    width: CONTENT_W - 16,
    lineGap: 3,
  });
  ctx.y += boxH + 12;
}

function drawGlossary(ctx: PdfCtx, entries: Array<{ term: string; definition: string }>) {
  for (const { term: rawTerm, definition: rawDef } of entries) {
    const term = normalizeCopilotManualPdfText(rawTerm);
    const definition = normalizeCopilotManualPdfText(rawDef);
    ctx.doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.ink);
    const termH = ctx.doc.heightOfString(term, { width: CONTENT_W });
    ctx.doc.font("Helvetica").fontSize(9.5).fillColor(COLORS.muted);
    const defH = ctx.doc.heightOfString(definition, { width: CONTENT_W, lineGap: 2 });
    ensureSpace(ctx, termH + defH + 10);
    ctx.doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.ink).text(term, PAGE.margin, ctx.y, {
      width: CONTENT_W,
    });
    ctx.y += termH + 2;
    ctx.doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(COLORS.muted)
      .text(definition, PAGE.margin, ctx.y, { width: CONTENT_W, lineGap: 2 });
    ctx.y += defH + 10;
  }
}

function drawBlocks(ctx: PdfCtx, blocks: CopilotManualBlock[]) {
  for (const block of blocks) {
    switch (block.type) {
      case "paragraph":
        drawParagraph(ctx, block.text);
        break;
      case "bullets":
        drawBullets(ctx, block.items);
        break;
      case "steps":
        drawSteps(ctx, block.items);
        break;
      case "callout":
        drawCallout(ctx, block.variant, block.text);
        break;
      case "subsection":
        drawSectionTitle(ctx, block.title, 2);
        drawBlocks(ctx, block.blocks);
        break;
      case "glossary":
        drawGlossary(ctx, block.entries);
        break;
      case "roles":
        drawRoles(ctx, block.entries);
        break;
      case "status":
        drawStatus(ctx, block.entries);
        break;
      default:
        break;
    }
  }
}

function renderCover(ctx: PdfCtx, generatedAt: Date) {
  const { doc } = ctx;
  let y = PAGE.margin + 80;
  doc.fillColor(COLORS.accent).font("Helvetica-Bold").fontSize(26).text(COPILOT_MANUAL_PRODUCT, PAGE.margin, y, {
    width: CONTENT_W,
  });
  y += 40;
  doc.fillColor(COLORS.ink).fontSize(20).text(COPILOT_MANUAL_TITLE, PAGE.margin, y, { width: CONTENT_W });
  y += 36;
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor(COLORS.muted)
    .text(`Versión del documento · ${formatGeneratedDate(generatedAt)}`, PAGE.margin, y);
  y += 28;
  doc.fontSize(11).fillColor(COLORS.ink).text(COPILOT_MANUAL_TAGLINE, PAGE.margin, y, {
    width: CONTENT_W,
    lineGap: 4,
  });
  ctx.y = PAGE.height - PAGE.margin - 60;
  doc
    .fontSize(9)
    .fillColor(COLORS.muted)
    .text("Documento generado automáticamente desde Copilot.", PAGE.margin, ctx.y, { width: CONTENT_W });
  renderFooter(doc, ctx.pageNum);
  doc.addPage();
  ctx.pageNum += 1;
  ctx.y = PAGE.margin;
}

function renderToc(ctx: PdfCtx) {
  drawSectionTitle(ctx, "Índice", 1);
  const sections = getCopilotManualSectionsForPdf();
  COPILOT_MANUAL_TOC_ORDER.forEach((entry, i) => {
    const title = entry.title;
    ensureSpace(ctx, 16);
    ctx.doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(COLORS.ink)
      .text(`${i + 1}. ${title}`, PAGE.margin + 8, ctx.y, { width: CONTENT_W - 16 });
    ctx.y += 16;
  });
  void sections;
  breakPage(ctx);
}

function renderSection(ctx: PdfCtx, section: CopilotManualSection) {
  breakPage(ctx);
  drawSectionTitle(ctx, section.title, 1);
  drawBlocks(ctx, section.blocks);
  ctx.y += 12;
}

export function renderCopilotManualPdf(
  options: RenderCopilotManualPdfOptions = {}
): Promise<Buffer> {
  const generatedAt = options.generatedAt ?? new Date();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: PAGE.margin,
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const ctx: PdfCtx = { doc, y: PAGE.margin, pageNum: 1 };

    renderCover(ctx, generatedAt);
    renderToc(ctx);

    for (const section of getCopilotManualSectionsForPdf()) {
      ensureSpace(ctx, 40);
      renderSection(ctx, section);
      if (ctx.y > MAX_Y - 80) breakPage(ctx);
    }

    renderFooter(ctx.doc, ctx.pageNum);
    doc.end();
  });
}
