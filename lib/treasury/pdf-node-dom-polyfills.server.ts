import "server-only";

/**
 * BANK-PDF-IMPORT-SERVERLESS-CANVAS-FIX-001.
 *
 * `pdfjs-dist`'s legacy Node build (`pdfjs-dist/legacy/build/pdf.mjs`) evaluates
 * `const SCALE_MATRIX = new DOMMatrix();` at MODULE SCOPE (not inside any function).
 * It normally gets `DOMMatrix` by requiring the optional native package
 * `@napi-rs/canvas` (see that file's `node_utils.js` section). On Vercel's Node
 * serverless runtime, `@napi-rs/canvas`'s platform-specific native binary is not
 * resolvable at runtime (`Cannot find module '@napi-rs/canvas'`), so `canvas` ends
 * up `undefined` there — and since the `DOMMatrix` polyfill assignment is itself
 * guarded ("if (!globalThis.DOMMatrix)"), pdfjs-dist only WARNS about it. But the
 * very next top-level statement unconditionally does `new DOMMatrix()`, which then
 * throws `ReferenceError: DOMMatrix is not defined` and crashes the whole module
 * import — confirmed by reproducing this exact failure locally with `@napi-rs/canvas`
 * removed. This happens even though we ONLY ever call `getTextContent()` (plain text
 * extraction), never `.render()` — the crash is unconditional at import time,
 * regardless of which pdfjs-dist API is actually used afterwards.
 *
 * Rather than depend on a native binary correctly resolving inside Vercel's
 * serverless function bundle (fragile: works today, can silently break on any
 * future Next.js/Vercel bundler change to file tracing), this provides a minimal,
 * dependency-free, pure-JS `DOMMatrix` (2D affine transform) BEFORE `pdf-parse`/
 * `pdfjs-dist` is ever imported, so pdfjs-dist's own `if (!globalThis.DOMMatrix)`
 * guard is satisfied and it never attempts to load `@napi-rs/canvas` for this.
 *
 * Scope: only `DOMMatrix` is polyfilled, because that is the only constructor
 * pdfjs-dist calls at module scope. `ImageData`/`Path2D` (also referenced by the
 * same optional-canvas block) are only ever used inside page `.render()`/image
 * code paths, which this project never calls (PDF import only extracts plain
 * text) — verified by inspecting every `new Path2D(...)`/`new ImageData(...)` call
 * site in the bundled `pdf.mjs`, all of which live inside function bodies reached
 * only from rendering, never from `getTextContent()`.
 *
 * If a real `DOMMatrix` already exists (e.g. locally on a platform where
 * `@napi-rs/canvas` DOES resolve, or in a future Node version that ships one
 * natively), this file does nothing — the guard below never overwrites it.
 */

export class NodeDomMatrixPolyfill {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;

  constructor(init?: NodeDomMatrixPolyfill | number[] | { a?: number; b?: number; c?: number; d?: number; e?: number; f?: number } | string) {
    this.a = 1;
    this.b = 0;
    this.c = 0;
    this.d = 1;
    this.e = 0;
    this.f = 0;
    if (Array.isArray(init) && init.length >= 6) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = init as number[];
    } else if (init && typeof init === "object") {
      const src = init as { a?: number; b?: number; c?: number; d?: number; e?: number; f?: number };
      this.a = src.a ?? 1;
      this.b = src.b ?? 0;
      this.c = src.c ?? 0;
      this.d = src.d ?? 1;
      this.e = src.e ?? 0;
      this.f = src.f ?? 0;
    }
  }

  get isIdentity(): boolean {
    return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0;
  }

  get is2D(): boolean {
    return true;
  }

  multiplySelf(other: NodeDomMatrixPolyfill): this {
    const o = other instanceof NodeDomMatrixPolyfill ? other : new NodeDomMatrixPolyfill(other);
    const a = this.a * o.a + this.c * o.b;
    const b = this.b * o.a + this.d * o.b;
    const c = this.a * o.c + this.c * o.d;
    const d = this.b * o.c + this.d * o.d;
    const e = this.a * o.e + this.c * o.f + this.e;
    const f = this.b * o.e + this.d * o.f + this.f;
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.e = e;
    this.f = f;
    return this;
  }

  multiply(other: NodeDomMatrixPolyfill): NodeDomMatrixPolyfill {
    return this.clone().multiplySelf(other);
  }

  preMultiplySelf(other: NodeDomMatrixPolyfill): this {
    const o = other instanceof NodeDomMatrixPolyfill ? other : new NodeDomMatrixPolyfill(other);
    const result = o.multiply(this);
    this.a = result.a;
    this.b = result.b;
    this.c = result.c;
    this.d = result.d;
    this.e = result.e;
    this.f = result.f;
    return this;
  }

  translateSelf(tx = 0, ty = 0): this {
    return this.multiplySelf(new NodeDomMatrixPolyfill([1, 0, 0, 1, tx, ty]));
  }

  translate(tx = 0, ty = 0): NodeDomMatrixPolyfill {
    return this.clone().translateSelf(tx, ty);
  }

  scaleSelf(sx = 1, sy = sx): this {
    return this.multiplySelf(new NodeDomMatrixPolyfill([sx, 0, 0, sy, 0, 0]));
  }

  scale(sx = 1, sy = sx): NodeDomMatrixPolyfill {
    return this.clone().scaleSelf(sx, sy);
  }

  rotateSelf(angleDegrees = 0): this {
    const rad = (angleDegrees * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return this.multiplySelf(new NodeDomMatrixPolyfill([cos, sin, -sin, cos, 0, 0]));
  }

  rotate(angleDegrees = 0): NodeDomMatrixPolyfill {
    return this.clone().rotateSelf(angleDegrees);
  }

  invertSelf(): this {
    const det = this.a * this.d - this.b * this.c;
    if (det === 0) {
      this.a = NaN;
      this.b = NaN;
      this.c = NaN;
      this.d = NaN;
      this.e = NaN;
      this.f = NaN;
      return this;
    }
    const a = this.d / det;
    const b = -this.b / det;
    const c = -this.c / det;
    const d = this.a / det;
    const e = -(a * this.e + c * this.f);
    const f = -(b * this.e + d * this.f);
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.e = e;
    this.f = f;
    return this;
  }

  inverse(): NodeDomMatrixPolyfill {
    return this.clone().invertSelf();
  }

  transformPoint(point: { x?: number; y?: number } = {}): { x: number; y: number; z: number; w: number } {
    const x = point.x ?? 0;
    const y = point.y ?? 0;
    return {
      x: this.a * x + this.c * y + this.e,
      y: this.b * x + this.d * y + this.f,
      z: 0,
      w: 1,
    };
  }

  clone(): NodeDomMatrixPolyfill {
    return new NodeDomMatrixPolyfill([this.a, this.b, this.c, this.d, this.e, this.f]);
  }

  toString(): string {
    return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
  }
}

if (typeof globalThis.DOMMatrix === "undefined") {
  (globalThis as unknown as { DOMMatrix: unknown }).DOMMatrix = NodeDomMatrixPolyfill;
}
