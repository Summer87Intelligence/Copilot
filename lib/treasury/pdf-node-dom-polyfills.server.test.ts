import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * BANK-PDF-IMPORT-SERVERLESS-CANVAS-FIX-001 — cobertura del polyfill puro de DOMMatrix
 * usado para que `pdfjs-dist` no crashee al importarse en un runtime (Vercel serverless)
 * donde `@napi-rs/canvas` no resuelve (`const SCALE_MATRIX = new DOMMatrix();` a nivel
 * de módulo en pdfjs-dist/legacy/build/pdf.mjs). Prueba directamente la matemática de la
 * matriz 2x3 (afín) contra la semántica estándar de DOMMatrix (CSS Geometry Interfaces),
 * ya que ese es el contrato real que pdfjs-dist espera de `globalThis.DOMMatrix`. No
 * depende de PDFs ni de canvas — la clase se prueba de forma aislada.
 */
const { NodeDomMatrixPolyfill } = await import("@/lib/treasury/pdf-node-dom-polyfills.server");

describe("pdf-node-dom-polyfills — instala globalThis.DOMMatrix", () => {
  it("el import del módulo asigna globalThis.DOMMatrix cuando no hay uno real", () => {
    expect(typeof globalThis.DOMMatrix).toBe("function");
  });
});

describe("NodeDomMatrixPolyfill — semántica DOMMatrix 2D", () => {
  it("new DOMMatrix() sin argumentos es la identidad", () => {
    const m = new NodeDomMatrixPolyfill();
    expect(m).toMatchObject({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    expect(m.isIdentity).toBe(true);
  });

  it("construye desde un array [a,b,c,d,e,f]", () => {
    const m = new NodeDomMatrixPolyfill([2, 0, 0, 3, 10, 20]);
    expect(m).toMatchObject({ a: 2, b: 0, c: 0, d: 3, e: 10, f: 20 });
    expect(m.isIdentity).toBe(false);
  });

  it("translateSelf mueve (e,f) sin cambiar la escala", () => {
    const m = new NodeDomMatrixPolyfill().translateSelf(5, 7);
    expect(m).toMatchObject({ a: 1, b: 0, c: 0, d: 1, e: 5, f: 7 });
  });

  it("scaleSelf escala a y d", () => {
    const m = new NodeDomMatrixPolyfill().scaleSelf(2, 4);
    expect(m).toMatchObject({ a: 2, d: 4 });
  });

  it("invertSelf de una matriz de escala produce la escala recíproca", () => {
    const m = new NodeDomMatrixPolyfill([2, 0, 0, 4, 0, 0]).invertSelf();
    expect(m.a).toBeCloseTo(0.5);
    expect(m.d).toBeCloseTo(0.25);
  });

  it("invertSelf de una matriz no invertible produce NaN (per spec)", () => {
    const m = new NodeDomMatrixPolyfill([0, 0, 0, 0, 0, 0]).invertSelf();
    expect(Number.isNaN(m.a)).toBe(true);
  });

  it("transformPoint aplica la transformación afín completa", () => {
    const m = new NodeDomMatrixPolyfill([2, 0, 0, 2, 10, 10]);
    const p = m.transformPoint({ x: 1, y: 1 });
    expect(p).toMatchObject({ x: 12, y: 12 });
  });

  it("multiply aplica la matriz de la derecha primero, luego la de la izquierda", () => {
    const scale = new NodeDomMatrixPolyfill([2, 0, 0, 2, 0, 0]);
    const translate = new NodeDomMatrixPolyfill([1, 0, 0, 1, 5, 5]);
    const combined = scale.multiply(translate);
    const p = combined.transformPoint({ x: 0, y: 0 });
    expect(p).toMatchObject({ x: 10, y: 10 });
  });

  it("rotateSelf de 90 grados intercambia los ejes", () => {
    const m = new NodeDomMatrixPolyfill().rotateSelf(90);
    const p = m.transformPoint({ x: 1, y: 0 });
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
  });

  it("clone produce una copia independiente", () => {
    const m = new NodeDomMatrixPolyfill([2, 0, 0, 2, 0, 0]);
    const c = m.clone();
    c.translateSelf(1, 1);
    expect(m.e).toBe(0);
    expect(c.e).not.toBe(0);
  });
});
