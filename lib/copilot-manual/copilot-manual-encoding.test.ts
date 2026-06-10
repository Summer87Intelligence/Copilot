import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  COPILOT_MANUAL_GENERATED_SECTIONS,
  getCopilotManualWebSections,
} from "@/lib/copilot-manual-content";
import {
  CORRUPT_PATTERNS,
  MANUAL_SECTIONS_PATH,
  MIN_SECTION_COUNT,
  validateManualFile,
} from "../../scripts/copilot-manual-encoding-guard.mjs";

const ROOT = process.cwd();
const GENERATE_SCRIPT = join(ROOT, "scripts/generate-copilot-manual-content.mjs");
const CHECK_SCRIPT = join(ROOT, "scripts/check-copilot-manual-encoding.mjs");

function runNode(script: string, args: string[] = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

describe("copilot manual encoding", () => {
  it("sections.generated.ts passes guard validation (UTF-8, structure, no mojibake)", () => {
    const result = validateManualFile(MANUAL_SECTIONS_PATH);
    expect(result.ok, result.errors.join("; ")).toBe(true);
    expect(result.text).toContain("¿Qué es Summer87 Copilot?");
  });

  it("preserves expected Spanish accents in header comment", () => {
    const text = readFileSync(MANUAL_SECTIONS_PATH, "utf8");
    expect(text).toContain("Validar: node scripts/generate-copilot-manual-content.mjs --check");
    expect(text).toContain("¿Qué es Summer87 Copilot?");
    for (const { name, re } of CORRUPT_PATTERNS) {
      expect(text, `found corrupt pattern: ${name}`).not.toMatch(re);
    }
  });

  it("manual content module imports generated sections for web", () => {
    expect(COPILOT_MANUAL_GENERATED_SECTIONS.length).toBeGreaterThanOrEqual(
      MIN_SECTION_COUNT
    );
    const webSections = getCopilotManualWebSections();
    expect(webSections.length).toBeGreaterThan(10);
    expect(webSections.some((s) => s.id === "hoy")).toBe(true);
    expect(webSections.some((s) => s.id === "dashboard")).toBe(true);
  });

  it.each(["--check", "--dry-run"])(
    "generate script %s passes without writing files",
    (flag) => {
      const before = readFileSync(MANUAL_SECTIONS_PATH, "utf8");
      const result = runNode(GENERATE_SCRIPT, [flag]);
      const after = readFileSync(MANUAL_SECTIONS_PATH, "utf8");

      expect(result.status, result.stderr || result.stdout).toBe(0);
      expect(result.stdout).toContain("No files written");
      expect(after).toBe(before);
    }
  );

  it("generate script rejects legacy --write / --generate flags", () => {
    for (const flag of ["--write", "--generate"]) {
      const result = runNode(GENERATE_SCRIPT, [flag]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("generation is disabled");
    }
  });

  it("check-copilot-manual-encoding.mjs exits 0", () => {
    const result = runNode(CHECK_SCRIPT);
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain("OK: copilot manual encoding check passed");
  });
});
