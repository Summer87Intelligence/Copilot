import { describe, it, expect } from "vitest";
import { normalizeZetaCurrency } from "./zeta-currency-normalize";

describe("normalizeZetaCurrency", () => {
  // ── UYU via MonedaNombre ────────────────────────────────────────────────────
  it("reconoce 'Peso Uruguayo' como UYU", () => {
    expect(normalizeZetaCurrency("Peso Uruguayo")).toBe("UYU");
  });
  it("reconoce 'Peso' como UYU", () => {
    expect(normalizeZetaCurrency("Peso")).toBe("UYU");
  });
  it("reconoce 'UYU' como UYU", () => {
    expect(normalizeZetaCurrency("UYU")).toBe("UYU");
  });
  it("reconoce 'peso uruguayo' (minúscula) como UYU", () => {
    expect(normalizeZetaCurrency("peso uruguayo")).toBe("UYU");
  });

  // ── USD via MonedaNombre ────────────────────────────────────────────────────
  it("reconoce 'Dólar' como USD", () => {
    expect(normalizeZetaCurrency("Dólar")).toBe("USD");
  });
  it("reconoce 'Dolar' (sin tilde) como USD", () => {
    expect(normalizeZetaCurrency("Dolar")).toBe("USD");
  });
  it("reconoce 'Dólares' como USD", () => {
    expect(normalizeZetaCurrency("Dólares")).toBe("USD");
  });
  it("reconoce 'USD' como USD", () => {
    expect(normalizeZetaCurrency("USD")).toBe("USD");
  });
  it("reconoce 'U$S' como USD", () => {
    expect(normalizeZetaCurrency("U$S")).toBe("USD");
  });

  // ── UYU via MonedaSimbolo ───────────────────────────────────────────────────
  it("reconoce símbolo '$' como UYU", () => {
    expect(normalizeZetaCurrency(null, "$")).toBe("UYU");
  });
  it("reconoce símbolo 'UYU' como UYU", () => {
    expect(normalizeZetaCurrency(null, "UYU")).toBe("UYU");
  });

  // ── USD via MonedaSimbolo ───────────────────────────────────────────────────
  it("reconoce símbolo 'U$S' como USD", () => {
    expect(normalizeZetaCurrency(null, "U$S")).toBe("USD");
  });
  it("reconoce símbolo 'US$' como USD", () => {
    expect(normalizeZetaCurrency(null, "US$")).toBe("USD");
  });
  it("reconoce símbolo 'USD' como USD", () => {
    expect(normalizeZetaCurrency(null, "USD")).toBe("USD");
  });

  // ── UYU via MonedaCodigo ────────────────────────────────────────────────────
  it("reconoce código '1' como UYU", () => {
    expect(normalizeZetaCurrency(null, null, "1")).toBe("UYU");
  });
  it("reconoce código 'UYU' como UYU", () => {
    expect(normalizeZetaCurrency(null, null, "UYU")).toBe("UYU");
  });

  // ── USD via MonedaCodigo ────────────────────────────────────────────────────
  it("reconoce código '2' como USD", () => {
    expect(normalizeZetaCurrency(null, null, "2")).toBe("USD");
  });
  it("reconoce código 'USD' como USD", () => {
    expect(normalizeZetaCurrency(null, null, "USD")).toBe("USD");
  });

  // ── null cases ──────────────────────────────────────────────────────────────
  it("retorna null cuando todos los campos son null", () => {
    expect(normalizeZetaCurrency(null, null, null)).toBeNull();
  });
  it("retorna null cuando todos son string vacío", () => {
    expect(normalizeZetaCurrency("", "", "")).toBeNull();
  });
  it("retorna null para moneda desconocida", () => {
    expect(normalizeZetaCurrency("Euro")).toBeNull();
  });

  // ── NO debe retornar ARS ────────────────────────────────────────────────────
  it("NO retorna ARS para ningún input válido de Uruguay", () => {
    const cases = [
      normalizeZetaCurrency("Peso Uruguayo"),
      normalizeZetaCurrency("Dólar"),
      normalizeZetaCurrency(null, "$"),
      normalizeZetaCurrency(null, "U$S"),
      normalizeZetaCurrency(null, null, "1"),
      normalizeZetaCurrency(null, null, "2"),
    ];
    for (const result of cases) {
      expect(result).not.toBe("ARS");
    }
  });

  // ── Prioridad: Nombre > Símbolo > Código ───────────────────────────────────
  it("el nombre tiene prioridad sobre símbolo cuando hay conflicto", () => {
    // MonedaNombre = Peso (UYU), MonedaSimbolo = U$S (USD) → UYU por prioridad
    expect(normalizeZetaCurrency("Peso", "U$S")).toBe("UYU");
  });
  it("el símbolo tiene prioridad sobre código cuando nombre es null", () => {
    // MonedaSimbolo = $ (UYU), MonedaCodigo = 2 (USD) → UYU por prioridad
    expect(normalizeZetaCurrency(null, "$", "2")).toBe("UYU");
  });

  // ── Invoices que antes eran ARS ────────────────────────────────────────────
  it("detecta UYU desde 'Peso Uruguayo' (caso crítico: antes era ARS hardcodeado)", () => {
    // Este era el bug principal: se asignaba ARS siempre
    const result = normalizeZetaCurrency("Peso Uruguayo");
    expect(result).toBe("UYU");
    expect(result).not.toBe("ARS");
  });
});
