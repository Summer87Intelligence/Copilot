import { describe, expect, it } from "vitest";

import { extractSerieNumero } from "./extract-serie-numero";

describe("extractSerieNumero", () => {
  it("devuelve el código limpio sin cambios", () => {
    expect(extractSerieNumero("A2934")).toBe("A2934");
  });

  it("devuelve código con guión sin cambios", () => {
    expect(extractSerieNumero("A-2934")).toBe("A-2934");
  });

  it("extrae el último segmento de ZETA:CCV1:0:36:A2934", () => {
    expect(extractSerieNumero("ZETA:CCV1:0:36:A2934")).toBe("A2934");
  });

  it("combina serie y número de ZETA:CCV1:0:36:A:2934", () => {
    expect(extractSerieNumero("ZETA:CCV1:0:36:A:2934")).toBe("A2934");
  });

  it("combina serie y número de formato con letra mayúscula", () => {
    expect(extractSerieNumero("ZETA:CCV1:1:99:B:1203")).toBe("B1203");
  });

  it("extrae último segmento tras pipe", () => {
    expect(extractSerieNumero("zeta_vouchers:123|A-2934")).toBe("A-2934");
  });

  it("extrae último segmento tras pipe sin guión", () => {
    expect(extractSerieNumero("prefix|A768")).toBe("A768");
  });

  it("devuelve — para null", () => {
    expect(extractSerieNumero(null)).toBe("—");
  });

  it("devuelve — para undefined", () => {
    expect(extractSerieNumero(undefined)).toBe("—");
  });

  it("devuelve — para string vacío", () => {
    expect(extractSerieNumero("")).toBe("—");
  });

  it("devuelve — para UUID", () => {
    expect(extractSerieNumero("550e8400-e29b-41d4-a716-446655440000")).toBe("—");
  });

  it("trunca strings técnicos largos sin dos puntos ni pipe", () => {
    const long = "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456";
    expect(extractSerieNumero(long).length).toBeLessThanOrEqual(20);
  });

  it("maneja número solo sin serie (colon-separated, último dígito)", () => {
    // "ZETA:CCV1:0:36:2934" → last segment "2934", secondLast "36" (no es letra) → devuelve "2934"
    expect(extractSerieNumero("ZETA:CCV1:0:36:2934")).toBe("2934");
  });
});
