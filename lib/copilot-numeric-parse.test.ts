import { describe, expect, it } from "vitest";

import { toSafeNumber } from "./copilot-numeric-parse";

describe("toSafeNumber", () => {
  it("retorna null para null y undefined", () => {
    expect(toSafeNumber(null)).toBeNull();
    expect(toSafeNumber(undefined)).toBeNull();
  });

  it("retorna null para strings vacías o solo espacios", () => {
    expect(toSafeNumber("")).toBeNull();
    expect(toSafeNumber("   ")).toBeNull();
  });

  it("retorna null para tipos no soportados", () => {
    expect(toSafeNumber(true)).toBeNull();
    expect(toSafeNumber(false)).toBeNull();
    expect(toSafeNumber({})).toBeNull();
    expect(toSafeNumber([])).toBeNull();
    expect(toSafeNumber(() => 1)).toBeNull();
  });

  it("preserva números finitos", () => {
    expect(toSafeNumber(0)).toBe(0);
    expect(toSafeNumber(1234.56)).toBe(1234.56);
    expect(toSafeNumber(-99.01)).toBe(-99.01);
  });

  it("convierte NaN / Infinity / -Infinity a null", () => {
    expect(toSafeNumber(Number.NaN)).toBeNull();
    expect(toSafeNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toSafeNumber(Number.NEGATIVE_INFINITY)).toBeNull();
  });

  it("parsea strings JS-native (formato Supabase numeric → string)", () => {
    expect(toSafeNumber("0")).toBe(0);
    expect(toSafeNumber("1234.56")).toBeCloseTo(1234.56, 5);
    expect(toSafeNumber("101942.86")).toBeCloseTo(101942.86, 5);
    expect(toSafeNumber("3624185.05")).toBeCloseTo(3624185.05, 5);
    expect(toSafeNumber("-50")).toBe(-50);
  });

  it("parsea strings formato es-UY (1.234,56 con punto de mil + coma decimal)", () => {
    expect(toSafeNumber("3.624.185,05")).toBeCloseTo(3624185.05, 5);
    expect(toSafeNumber("101.942,86")).toBeCloseTo(101942.86, 5);
    expect(toSafeNumber("11.514,08")).toBeCloseTo(11514.08, 5);
    expect(toSafeNumber("561.218,00")).toBeCloseTo(561218.0, 5);
  });

  it("recorta espacios alrededor antes de parsear", () => {
    expect(toSafeNumber("  1234.56  ")).toBeCloseTo(1234.56, 5);
    expect(toSafeNumber("\t99\n")).toBe(99);
  });

  it("retorna null para cadenas no numéricas", () => {
    expect(toSafeNumber("abc")).toBeNull();
    expect(toSafeNumber("12.34.56")).toBeNull();
    expect(toSafeNumber("$1234")).toBeNull();
  });

  it("regresión: NO trunca strings provenientes de Supabase numeric a null", () => {
    // Caso real: Supabase devolvía `total_amount: "3624185.05"` y un cast con
    // `typeof === "number" ? r : null` lo convertía a null → reportes 0,00.
    const samples = ["3624185.05", "101942.86", "561218", "11514.08"];
    for (const s of samples) {
      const n = toSafeNumber(s);
      expect(n).not.toBeNull();
      expect(typeof n).toBe("number");
      expect(n).toBeGreaterThan(0);
    }
  });
});
