import { describe, expect, it } from "vitest";

import {
  formatYmdMontevideo,
  todayYmdMontevideo,
} from "@/lib/date/summer87-today";

describe("formatYmdMontevideo", () => {
  it("23:30 Montevideo del 14-jun NO avanza al 15-jun (UY = UTC−3)", () => {
    // 2026-06-15T02:30:00Z = 2026-06-14T23:30:00−03 (Montevideo)
    const instant = new Date("2026-06-15T02:30:00.000Z");
    expect(formatYmdMontevideo(instant)).toBe("2026-06-14");
  });

  it("instante UTC 03:30 del 15-jun ya es 15-jun en Montevideo (00:30 local)", () => {
    const instant = new Date("2026-06-15T03:30:00.000Z");
    expect(formatYmdMontevideo(instant)).toBe("2026-06-15");
  });

  it("acepta timestamp numérico", () => {
    const ms = Date.parse("2026-06-14T15:00:00.000Z"); // 12:00 Montevideo
    expect(formatYmdMontevideo(ms)).toBe("2026-06-14");
  });

  it("devuelve formato YYYY-MM-DD estricto", () => {
    const out = formatYmdMontevideo(new Date("2026-01-09T12:00:00.000Z"));
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(out).toBe("2026-01-09");
  });

  it("medianoche UTC del 01-ene es 21:00 del 31-dic en Montevideo", () => {
    const instant = new Date("2026-01-01T00:00:00.000Z");
    expect(formatYmdMontevideo(instant)).toBe("2025-12-31");
  });
});

describe("todayYmdMontevideo", () => {
  it("devuelve YYYY-MM-DD", () => {
    expect(todayYmdMontevideo()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("coincide con formatYmdMontevideo(now)", () => {
    // Tolerancia: el segundo entre llamadas es raro pero posible. Ambos deben
    // resolver al mismo día Montevideo en condiciones normales.
    const a = todayYmdMontevideo();
    const b = formatYmdMontevideo(new Date());
    expect(a).toBe(b);
  });
});
