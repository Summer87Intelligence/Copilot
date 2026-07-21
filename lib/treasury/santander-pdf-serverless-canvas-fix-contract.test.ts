import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * BANK-PDF-IMPORT-SERVERLESS-CANVAS-FIX-001 — contrato estático que evita una regresión
 * silenciosa: si alguien reordena los imports de `santander-pdf-text-extract.server.ts`
 * (pdf-parse antes que el polyfill) o retira la config de next.config.ts, el import PDF
 * volvería a crashear en Vercel exactamente como se reprodujo esta fase (`ReferenceError:
 * DOMMatrix is not defined` al importar pdfjs-dist), sin que ningún test unitario lo
 * detecte (el polyfill en sí seguiría siendo correcto, solo dejaría de aplicarse a tiempo).
 */

const textExtractSrc = readFileSync(
  join(process.cwd(), "lib", "treasury", "santander-pdf-text-extract.server.ts"),
  "utf8"
);

const nextConfigSrc = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");

const previewRouteSrc = readFileSync(
  join(process.cwd(), "app", "api", "copilot", "bank-movements", "imports", "preview", "route.ts"),
  "utf8"
);

describe("santander-pdf-text-extract.server.ts — orden de imports", () => {
  it("importa el polyfill de DOMMatrix ANTES que pdf-parse", () => {
    const polyfillIndex = textExtractSrc.indexOf("pdf-node-dom-polyfills.server");
    const pdfParseIndex = textExtractSrc.indexOf('from "pdf-parse"');
    expect(polyfillIndex).toBeGreaterThan(-1);
    expect(pdfParseIndex).toBeGreaterThan(-1);
    expect(polyfillIndex).toBeLessThan(pdfParseIndex);
  });
});

describe("next.config.ts — tracing del import PDF en Vercel", () => {
  it("declara @napi-rs/canvas como serverExternalPackages junto con pdf-parse/pdfjs-dist", () => {
    const match = /serverExternalPackages:\s*\[([^\]]+)\]/.exec(nextConfigSrc);
    expect(match).not.toBeNull();
    const list = match![1]!;
    expect(list).toContain('"pdf-parse"');
    expect(list).toContain('"pdfjs-dist"');
    expect(list).toContain('"@napi-rs/canvas"');
  });

  it("incluye el binario Linux de @napi-rs/canvas en el tracing de la route de preview", () => {
    const routeBlock = /"\/api\/copilot\/bank-movements\/imports\/preview":\s*\[([^\]]+)\]/.exec(nextConfigSrc);
    expect(routeBlock).not.toBeNull();
    const globs = routeBlock![1]!;
    expect(globs).toContain("@napi-rs/canvas-linux-x64-gnu");
  });
});

describe("route de preview de import — runtime Node (no Edge)", () => {
  it('declara export const runtime = "nodejs"', () => {
    expect(previewRouteSrc).toMatch(/export const runtime\s*=\s*"nodejs"/);
  });
});
