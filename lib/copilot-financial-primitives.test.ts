import { describe, expect, it } from "vitest";

import {
  addCalendarDaysLocal,
  addCalendarDaysLocalRoundDays,
  historicalCashNet,
  localCalendarTodayYmd,
  normalizedCollectionProbability,
  num,
  sumPositivePaymentAmounts,
  sumPositiveReceiptAmounts,
  ymdFromIsoLocal,
  ymdFromIsoUtcDate,
} from "@/lib/copilot-financial-primitives";

describe("num", () => {
  it("coerce valores típicos y NaN", () => {
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num("1,5")).toBeCloseTo(1.5, 5);
    expect(num("10")).toBe(10);
    expect(num(Number.NaN)).toBe(0);
  });
});

describe("sumPositiveReceiptAmounts / sumPositivePaymentAmounts / historicalCashNet", () => {
  it("solo suma montos estrictamente positivos", () => {
    expect(
      sumPositiveReceiptAmounts([
        { amount: 100 },
        { amount: -1 },
        { amount: 0 },
      ])
    ).toBe(100);
    expect(
      sumPositivePaymentAmounts([{ amount: 40 }, { amount: 0 }])
    ).toBe(40);
    expect(
      historicalCashNet(
        [{ amount: 100 }, { amount: 10 }],
        [{ amount: 30 }]
      )
    ).toBe(80);
  });
});

describe("normalizedCollectionProbability", () => {
  it("defaults y escala 0–100", () => {
    expect(normalizedCollectionProbability(null)).toBe(0.6);
    expect(normalizedCollectionProbability("")).toBe(0.6);
    expect(normalizedCollectionProbability(50)).toBe(0.5);
    expect(normalizedCollectionProbability(0.5)).toBe(0.5);
  });
});

describe("localCalendarTodayYmd", () => {
  it("formato YYYY-MM-DD", () => {
    expect(localCalendarTodayYmd()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("ymdFromIsoLocal / ymdFromIsoUtcDate", () => {
  it("prefijo de 10 caracteres idéntico en ambos", () => {
    const s = "2025-03-10T00:00:00.000Z";
    expect(ymdFromIsoLocal(s)).toBe("2025-03-10");
    expect(ymdFromIsoUtcDate(s)).toBe("2025-03-10");
  });

  it("cadena inválida devuelve vacío", () => {
    expect(ymdFromIsoLocal("")).toBe("");
    expect(ymdFromIsoUtcDate("")).toBe("");
  });
});

describe("addCalendarDaysLocal vs addCalendarDaysLocalRoundDays", () => {
  it("suma entera de días en calendario local", () => {
    expect(addCalendarDaysLocal("2025-01-01", 30)).toBe("2025-01-31");
  });

  it("roundDays redondea el delta antes de sumar (semántica cashflow)", () => {
    expect(addCalendarDaysLocal("2025-01-01", 10.4)).toBe(
      addCalendarDaysLocalRoundDays("2025-01-01", 10.4)
    );
    expect(addCalendarDaysLocalRoundDays("2025-01-01", 10.6)).toBe("2025-01-12");
    expect(addCalendarDaysLocal("2025-01-01", 10.6)).toBe("2025-01-11");
  });
});
