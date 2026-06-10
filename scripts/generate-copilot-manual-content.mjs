/**
 * Valida el Manual de uso Copilot (NO regenera contenido).
 *
 * Fuente de verdad editable:
 *   lib/copilot-manual/sections.generated.ts
 *
 * Complementos:
 *   lib/copilot-manual/glossary-extra.ts
 *   lib/copilot-manual-content.ts (TOC, web/PDF wiring)
 *
 * La generación desde app/copilot/manual/page.tsx fue retirada: page.tsx ya no
 * contiene const SECTIONS y ejecutar el generador legacy sobrescribía el manual.
 *
 * Usage:
 *   node scripts/generate-copilot-manual-content.mjs           # validate (default)
 *   node scripts/generate-copilot-manual-content.mjs --check   # validate only
 *   node scripts/generate-copilot-manual-content.mjs --dry-run # alias of --check
 */
import { runManualEncodingCheck, validateManualFile } from "./copilot-manual-encoding-guard.mjs";

const args = process.argv.slice(2);
const checkMode =
  args.length === 0 ||
  args.includes("--check") ||
  args.includes("--dry-run");

if (args.includes("--write") || args.includes("--generate")) {
  console.error(
    "FAIL: generation is disabled. Edit lib/copilot-manual/sections.generated.ts directly in UTF-8."
  );
  console.error("Then run: node scripts/generate-copilot-manual-content.mjs --check");
  process.exit(1);
}

if (!checkMode) {
  console.error("Unknown option. Use --check or --dry-run (default is validate-only).");
  process.exit(1);
}

const preview = validateManualFile();
if (!preview.ok) {
  console.error("FAIL: manual validation:");
  for (const e of preview.errors) console.error(`  - ${e}`);
  process.exit(1);
}

const sectionCount = (preview.text?.match(/^\s+id:\s+"[^"]+"/gm) ?? []).length;
console.log(
  `OK: manual source valid (${sectionCount} sections, UTF-8, no mojibake). No files written.`
);

process.exit(runManualEncodingCheck());
