import { describe, expect, it } from "vitest";

import { buildNumericPageTokens } from "@/lib/ui/numeric-pagination";
import { keyedPageAt, resolveKeyedPage } from "@/lib/ui/keyed-pagination";

describe("keyed pagination (reset declarativo)", () => {
  it("conserva la página cuando la key no cambia", () => {
    const state = keyedPageAt("month=2026-07|q=", 3);
    expect(resolveKeyedPage(state, "month=2026-07|q=")).toBe(3);
  });

  it("vuelve a página 1 cuando cambian filtros (key distinta)", () => {
    const state = keyedPageAt("month=2026-07|q=", 4);
    expect(resolveKeyedPage(state, "month=2026-06|q=")).toBe(1);
    expect(resolveKeyedPage(state, "month=2026-07|q=suprasur")).toBe(1);
  });

  it("cambiar solo la página no altera la key", () => {
    const key = "imports|search=";
    const next = keyedPageAt(key, 2);
    expect(next).toEqual({ key, page: 2 });
    expect(resolveKeyedPage(next, key)).toBe(2);
  });
});

describe("buildNumericPageTokens", () => {
  it("incluye primera, última y página actual con ellipsis", () => {
    expect(buildNumericPageTokens(1, 20)).toContain(1);
    expect(buildNumericPageTokens(1, 20)).toContain(20);
    expect(buildNumericPageTokens(10, 20)).toContain("ellipsis");
    expect(buildNumericPageTokens(10, 20)).toContain(10);
  });
});
