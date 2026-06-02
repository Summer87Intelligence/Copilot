/**
 * Diagnóstico de extracción de texto de un PDF Santander.
 * Usa el mismo extractor que la app (pdf-parse v2).
 *
 * Uso:
 *   node scripts/debug-santander-pdf.mjs "ruta/al/umsatz.pdf"
 *
 * No commitear datos del PDF. El script no guarda nada.
 */

import { readFileSync } from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

const filePath = process.argv[2];
if (!filePath) {
  console.error('Uso: node scripts/debug-santander-pdf.mjs "ruta/al/umsatz.pdf"');
  process.exit(1);
}

let buf;
try {
  buf = readFileSync(filePath);
} catch (e) {
  console.error("❌ No se pudo leer el archivo:", e.message);
  process.exit(1);
}

console.log("=".repeat(60));
console.log("DEBUG: Santander PDF text extractor");
console.log("=".repeat(60));
console.log("Archivo:", filePath);
console.log("Tamaño buffer:", buf.length, "bytes");
console.log("");

// ── getText ───────────────────────────────────────────────────────────────────
const parser = new PDFParse({ data: buf });
let textResult;
try {
  textResult = await parser.getText();
} catch (e) {
  console.error("❌ getText() falló:", e.message);
  await parser.destroy().catch(() => {});
  process.exit(1);
}

const text = textResult.text ?? "";
console.log("─".repeat(40));
console.log("getText() result:");
console.log("  text.length:", text.length);
console.log("  pages:", textResult.npage ?? "?");
console.log("");

console.log("Primeros 2000 chars:");
console.log("─".repeat(40));
console.log(JSON.stringify(text.slice(0, 2000)));
console.log("");

// Líneas
const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
console.log("─".repeat(40));
console.log(`Total líneas no vacías: ${lines.length}`);

// Líneas con fechas DD/MM/YYYY
const DATE_RE = /\b\d{2}\/\d{2}\/\d{4}\b/;
const dateLines = lines.filter((l) => DATE_RE.test(l));
console.log(`Líneas con fecha DD/MM/YYYY: ${dateLines.length}`);
if (dateLines.length > 0) {
  console.log("Primeras 10 líneas con fecha:");
  for (const l of dateLines.slice(0, 10)) {
    console.log("  >>", JSON.stringify(l.slice(0, 120)));
  }
}

// Montos formato UY (con coma decimal)
const MONEY_RE = /-?\d{1,3}(?:\.\d{3})*,\d{2}/g;
const moneyMatches = [...text.matchAll(MONEY_RE)].map((m) => m[0]);
console.log(`\nMontos formato UY encontrados: ${moneyMatches.length}`);
console.log("Primeros 20:", moneyMatches.slice(0, 20));

// ── getTable ──────────────────────────────────────────────────────────────────
console.log("");
console.log("─".repeat(40));
console.log("Intentando getTable()...");
try {
  const tableResult = await parser.getTable();
  const tables = tableResult?.tables ?? [];
  console.log(`Tablas detectadas: ${tables.length}`);
  for (let i = 0; i < Math.min(tables.length, 3); i++) {
    const t = tables[i];
    const rows = t.rows ?? t.data ?? t;
    console.log(`\nTabla ${i + 1}: ${Array.isArray(rows) ? rows.length : "?"} filas`);
    if (Array.isArray(rows)) {
      for (const row of rows.slice(0, 8)) {
        console.log("  ROW:", JSON.stringify(row));
      }
    }
  }
} catch (e) {
  console.log("getTable() no disponible o error:", e.message);
}

// ── isSantanderPdfStatementText ───────────────────────────────────────────────
console.log("");
console.log("─".repeat(40));
const normalized = text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
console.log("Markers detectados:");
console.log("  santander:", normalized.includes("santander"));
console.log("  cliente:", normalized.includes("cliente"));
console.log("  cuenta:", normalized.includes("cuenta"));
console.log("  moneda:", normalized.includes("moneda"));
console.log("  movimientos:", normalized.includes("movimientos"));
console.log("  fecha:", normalized.includes("fecha"));
console.log("  referencia:", normalized.includes("referencia"));
console.log("  debito:", normalized.includes("debito") || normalized.includes("debito"));
console.log("  credito:", normalized.includes("credito") || normalized.includes("credito"));
console.log("  saldo:", normalized.includes("saldo"));
const dateRangeRe = /\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}/;
console.log("  dateRange:", dateRangeRe.test(text));

// ── findTableStartIndex ───────────────────────────────────────────────────────
console.log("");
console.log("─".repeat(40));
console.log("Buscando encabezado de tabla (Fecha/Referencia/Débito/Crédito/Saldo)...");
for (let i = 0; i < lines.length; i++) {
  const n = lines[i].toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (n.includes("fecha") && n.includes("referencia") && (n.includes("debito") || n.includes("credito")) && n.includes("saldo")) {
    console.log(`  Encontrado en línea ${i}: ${JSON.stringify(lines[i])}`);
    console.log(`  Líneas siguientes (hasta 5):`);
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      console.log(`    [${j}]: ${JSON.stringify(lines[j])}`);
    }
    break;
  }
}

await parser.destroy().catch(() => {});
console.log("");
console.log("=".repeat(60));
console.log("Fin del diagnóstico.");
