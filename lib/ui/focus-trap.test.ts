import { describe, expect, it } from "vitest";

import { resolveTabWrap } from "@/lib/ui/focus-trap";

describe("resolveTabWrap", () => {
  const els = ["a", "b", "c"];

  it("Tab en el último envuelve al primero", () => {
    expect(resolveTabWrap(els, "c", false)).toBe("a");
  });
  it("Shift+Tab en el primero envuelve al último", () => {
    expect(resolveTabWrap(els, "a", true)).toBe("c");
  });
  it("Tab en el medio deja que el navegador maneje (null)", () => {
    expect(resolveTabWrap(els, "b", false)).toBeNull();
    expect(resolveTabWrap(els, "b", true)).toBeNull();
  });
  it("foco fuera del trap se recupera al primero (o último con shift)", () => {
    expect(resolveTabWrap(els, "x", false)).toBe("a");
    expect(resolveTabWrap(els, "x", true)).toBe("c");
    expect(resolveTabWrap(els, null, false)).toBe("a");
  });
  it("lista vacía no hace nada", () => {
    expect(resolveTabWrap([], "a", false)).toBeNull();
  });
});
