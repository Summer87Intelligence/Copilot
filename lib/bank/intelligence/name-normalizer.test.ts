import { describe, it, expect } from "vitest";

import { normalizePayerName, payerNamesMatch, joinSingleLetters } from "@/lib/bank/intelligence/name-normalizer";

describe("normalizePayerName", () => {
  it("unifica variantes de la misma razón social", () => {
    expect(normalizePayerName("PEPITO S.A.")).toBe("pepito");
    expect(normalizePayerName("Pepito SA")).toBe("pepito");
    expect(normalizePayerName("P E P I T O  S.A.")).toBe("pepito");
    expect(payerNamesMatch("PEPITO S.A.", "Pepito SA")).toBe(true);
  });
  it("remueve acentos y puntuación irrelevante", () => {
    expect(normalizePayerName("Café González SRL")).toBe("cafe gonzalez");
  });
  it("no une nombres distintos", () => {
    expect(payerNamesMatch("El País", "El Observador")).toBe(false);
    expect(payerNamesMatch("Pepito", "Pepita")).toBe(false);
  });
  it("vacío / null → cadena vacía y no matchea", () => {
    expect(normalizePayerName(null)).toBe("");
    expect(payerNamesMatch("", "")).toBe(false);
  });
  it("joinSingleLetters solo colapsa runs de ≥3 letras sueltas", () => {
    expect(joinSingleLetters("p e p i t o")).toBe("pepito");
    expect(joinSingleLetters("a b")).toBe("a b"); // 2 iniciales no se fusionan
    expect(joinSingleLetters("banco de la republica")).toBe("banco de la republica");
  });
});
