/**
 * Validación UTF-8 y contenido mínimo del Manual de uso Copilot.
 * Fuente de verdad: lib/copilot-manual/sections.generated.ts
 */
import fs from "node:fs";
import path from "node:path";

export const MANUAL_SECTIONS_PATH = path.join(
  process.cwd(),
  "lib/copilot-manual/sections.generated.ts"
);

/** Patrones típicos de corrupción UTF-8 / mojibake en copy en español. */
export const CORRUPT_PATTERNS = [
  { name: "???", re: /\?\?\?/ },
  { name: "Tesorer?a", re: /Tesorer\?a/ },
  { name: "per?odo", re: /per\?odo/ },
  { name: "men? lateral", re: /men\? lateral/ },
  { name: "mojibake Ã", re: /Ã[¡©­³º±]/ },
  { name: "mojibake â€", re: /â€[""—–]/ },
];

export const REQUIRED_EXPORTS = [
  "export const COPILOT_MANUAL_GENERATED_SECTIONS",
  "export const COPILOT_MANUAL_FIVE_MINUTE_STEPS",
  "export const COPILOT_MANUAL_DAILY_FLOW",
  "export const COPILOT_MANUAL_FAQ",
];

export const REQUIRED_MARKERS = [
  "¿Qué es Summer87 Copilot?",
  "Cómo moverse por Copilot",
];

/** Mínimo de secciones con id explícito en el array generado. */
export const MIN_SECTION_COUNT = 20;

/** Tamaño mínimo del archivo (bytes) — evita sobrescritura accidental vacía. */
export const MIN_FILE_BYTES = 40_000;

/**
 * @param {string} text
 * @returns {string[]}
 */
export function findMojibakeHits(text) {
  return CORRUPT_PATTERNS.filter(({ re }) => re.test(text)).map(({ name }) => name);
}

/**
 * @param {Buffer} buf
 * @returns {{ ok: true, text: string } | { ok: false, errors: string[] }}
 */
export function decodeUtf8Strict(buf) {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return { ok: true, text };
  } catch {
    return { ok: false, errors: ["sections.generated.ts is not valid UTF-8"] };
  }
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function validateManualStructure(text) {
  const errors = [];

  if (text.trim().length === 0) {
    errors.push("sections.generated.ts is empty");
    return errors;
  }

  for (const exp of REQUIRED_EXPORTS) {
    if (!text.includes(exp)) {
      errors.push(`missing required export: ${exp}`);
    }
  }

  for (const marker of REQUIRED_MARKERS) {
    if (!text.includes(marker)) {
      errors.push(`missing required content marker: ${marker}`);
    }
  }

  const sectionIds = text.match(/^\s+id:\s+"[^"]+"/gm) ?? [];
  if (sectionIds.length < MIN_SECTION_COUNT) {
    errors.push(
      `too few manual sections (${sectionIds.length} < ${MIN_SECTION_COUNT}) — possible truncated file`
    );
  }

  const mojibake = findMojibakeHits(text);
  if (mojibake.length) {
    errors.push(`mojibake patterns: ${mojibake.join(", ")}`);
  }

  return errors;
}

/**
 * @param {string} [filePath]
 * @returns {{ ok: boolean, errors: string[], text?: string }}
 */
export function validateManualFile(filePath = MANUAL_SECTIONS_PATH) {
  if (!fs.existsSync(filePath)) {
    return { ok: false, errors: [`file not found: ${filePath}`] };
  }

  const buf = fs.readFileSync(filePath);
  if (buf.length < MIN_FILE_BYTES) {
    return {
      ok: false,
      errors: [
        `file too small (${buf.length} bytes < ${MIN_FILE_BYTES}) — refusing empty/truncated manual`,
      ],
    };
  }

  const decoded = decodeUtf8Strict(buf);
  if (!decoded.ok) {
    return { ok: false, errors: decoded.errors };
  }

  const structureErrors = validateManualStructure(decoded.text);
  if (structureErrors.length) {
    return { ok: false, errors: structureErrors };
  }

  return { ok: true, errors: [], text: decoded.text };
}

/**
 * @param {string} [filePath]
 * @returns {number} exit code
 */
export function runManualEncodingCheck(filePath = MANUAL_SECTIONS_PATH) {
  const result = validateManualFile(filePath);
  if (!result.ok) {
    console.error("FAIL: copilot manual encoding/structure check:");
    for (const e of result.errors) console.error(`  - ${e}`);
    return 1;
  }
  console.log("OK: copilot manual encoding check passed");
  return 0;
}
