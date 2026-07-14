import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guardia arquitectónica FASE 1: los módulos migrados a la capa canónica NO
 * deben importar el modelo legacy de cobranza por `issue_date`. El aging
 * operativo se calcula por `due_date` vía `@/lib/financial/canonical`.
 */

const ROOT = process.cwd();
const LEGACY_IMPORT = "collection-aging";

function readIfExists(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

/** Archivos/carpetas que ya migraron y no pueden reintroducir el import legacy. */
function migratedFiles(): string[] {
  const files: string[] = [join(ROOT, "lib/copilot/client-360-aging.ts")];
  const canonicalDir = join(ROOT, "lib/financial/canonical");
  for (const name of readdirSync(canonicalDir)) {
    if (name.endsWith(".ts") && !name.endsWith(".test.ts")) {
      files.push(join(canonicalDir, name));
    }
  }
  return files;
}

describe("collection-aging deprecation guard", () => {
  it("el modelo legacy está marcado @deprecated", () => {
    const src = readIfExists(join(ROOT, "lib/collection-aging/collection-aging-model.ts"));
    expect(src).toContain("@deprecated");
  });

  it("ningún módulo migrado importa collection-aging", () => {
    const offenders: string[] = [];
    for (const file of migratedFiles()) {
      const src = readIfExists(file);
      // Detecta imports (no comentarios que mencionen el nombre en prosa).
      const importRe = new RegExp(`(import|require)[^\\n]*${LEGACY_IMPORT}`);
      if (importRe.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
