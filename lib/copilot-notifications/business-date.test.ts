import { describe, expect, it } from "vitest";
import { businessDateYmd, businessMonthYm } from "./business-date";

// Uruguay = UTC-3, sin horario de verano desde 2015.
// Medianoche UTC de cualquier día = 21:00 del día anterior en Montevideo.
// Medianoche Montevideo = 03:00 UTC del mismo día calendario.

describe("businessDateYmd", () => {
  it("devuelve formato YYYY-MM-DD", () => {
    const result = businessDateYmd(new Date("2026-05-25T12:00:00Z"));
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).toBe("2026-05-25");
  });

  it("cerca de medianoche UTC conserva la fecha de Montevideo (UTC 01:00 = MVD 22:00 del día anterior)", () => {
    // 2026-05-26T01:00:00Z = 2026-05-25T22:00:00 en Montevideo
    // toISOString() daría "2026-05-26"; debe ser "2026-05-25"
    expect(businessDateYmd(new Date("2026-05-26T01:00:00Z"))).toBe("2026-05-25");
  });

  it("después de medianoche Montevideo avanza al día siguiente (UTC 04:00 = MVD 01:00)", () => {
    // 2026-05-26T04:00:00Z = 2026-05-26T01:00:00 en Montevideo → ya es 26
    expect(businessDateYmd(new Date("2026-05-26T04:00:00Z"))).toBe("2026-05-26");
  });

  it("acepta timezone alternativo", () => {
    // UTC 00:30 = UTC+1 00:30 (ya es el día siguiente si tz = UTC+1)
    // Solo verifica que el parámetro se aplique
    const utcResult = businessDateYmd(new Date("2026-05-26T00:30:00Z"), "UTC");
    expect(utcResult).toBe("2026-05-26");
    const mvdResult = businessDateYmd(new Date("2026-05-26T00:30:00Z"), "America/Montevideo");
    expect(mvdResult).toBe("2026-05-25");
  });
});

describe("businessMonthYm", () => {
  it("devuelve formato YYYY-MM", () => {
    const result = businessMonthYm(new Date("2026-05-25T12:00:00Z"));
    expect(result).toMatch(/^\d{4}-\d{2}$/);
    expect(result).toBe("2026-05");
  });

  it("fin de mes UTC no avanza al mes siguiente si en Montevideo sigue siendo el mes anterior", () => {
    // 2026-06-01T01:00:00Z = 2026-05-31T22:00:00 en Montevideo → sigue siendo mayo
    // toISOString().slice(0,7) daría "2026-06"; debe ser "2026-05"
    expect(businessMonthYm(new Date("2026-06-01T01:00:00Z"))).toBe("2026-05");
  });

  it("también válido para mayo dentro del mes (23:00 UTC = 20:00 MVD, aún mayo)", () => {
    // 2026-05-31T23:00:00Z = 2026-05-31T20:00:00 en Montevideo → mayo
    expect(businessMonthYm(new Date("2026-05-31T23:00:00Z"))).toBe("2026-05");
  });

  it("cuando en Montevideo ya es junio, retorna el mes nuevo", () => {
    // 2026-06-01T04:00:00Z = 2026-06-01T01:00:00 en Montevideo → ya es junio
    expect(businessMonthYm(new Date("2026-06-01T04:00:00Z"))).toBe("2026-06");
  });

  it("fin de año: UTC 01:00 del 1 enero sigue siendo diciembre en Montevideo", () => {
    // 2027-01-01T01:00:00Z = 2026-12-31T22:00:00 en Montevideo → diciembre 2026
    expect(businessMonthYm(new Date("2027-01-01T01:00:00Z"))).toBe("2026-12");
  });
});
