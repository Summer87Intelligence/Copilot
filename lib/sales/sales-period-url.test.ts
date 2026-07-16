import { describe, it, expect } from "vitest";

import {
  periodToParams,
  parsePeriodFromParams,
  periodToSelectValue,
  periodKey,
  type PeriodState,
} from "@/lib/sales/sales-period-url";

describe("sales period URL serialization", () => {
  it("serializa preset · mes · custom", () => {
    expect(periodToParams({ kind: "preset", preset: "this_month" }).toString()).toBe("preset=this_month");
    expect(periodToParams({ kind: "month", year: 2026, month: 6 }).toString()).toBe("year=2026&month=6");
    expect(periodToParams({ kind: "custom", from: "2026-07-01", to: "2026-07-16" }).toString()).toBe(
      "from=2026-07-01&to=2026-07-16"
    );
  });

  it("round-trip params → period → params es estable", () => {
    const cases: PeriodState[] = [
      { kind: "preset", preset: "year" },
      { kind: "month", year: 2026, month: 1 },
      { kind: "custom", from: "2026-07-01", to: "2026-07-16" },
    ];
    for (const p of cases) {
      const back = parsePeriodFromParams(periodToParams(p));
      expect(periodKey(back)).toBe(periodKey(p));
    }
  });

  it("hidrata desde deep-links reales", () => {
    expect(parsePeriodFromParams(new URLSearchParams("preset=this_month"))).toEqual({
      kind: "preset",
      preset: "this_month",
    });
    expect(parsePeriodFromParams(new URLSearchParams("year=2026&month=6"))).toEqual({
      kind: "month",
      year: 2026,
      month: 6,
    });
    expect(parsePeriodFromParams(new URLSearchParams("from=2026-07-01&to=2026-07-16"))).toEqual({
      kind: "custom",
      from: "2026-07-01",
      to: "2026-07-16",
    });
  });

  it("precedencia mes > custom > preset y default seguro", () => {
    // Mes gana sobre custom+preset presentes.
    expect(parsePeriodFromParams(new URLSearchParams("year=2026&month=6&from=2026-01-01&to=2026-01-31&preset=year")))
      .toEqual({ kind: "month", year: 2026, month: 6 });
    // Sin params válidos → this_month.
    expect(parsePeriodFromParams(new URLSearchParams(""))).toEqual({ kind: "preset", preset: "this_month" });
    // custom inválido ignorado.
    expect(parsePeriodFromParams(new URLSearchParams("from=nope&to=2026-01-31"))).toEqual({
      kind: "preset",
      preset: "this_month",
    });
    // `preset=custom` no es un preset seleccionable directo → default.
    expect(parsePeriodFromParams(new URLSearchParams("preset=custom"))).toEqual({
      kind: "preset",
      preset: "this_month",
    });
  });

  it("periodToSelectValue mapea al valor del <select>", () => {
    expect(periodToSelectValue({ kind: "preset", preset: "last_month" })).toBe("last_month");
    expect(periodToSelectValue({ kind: "month", year: 2026, month: 3 })).toBe("month:3");
    expect(periodToSelectValue({ kind: "custom", from: "2026-07-01", to: "2026-07-16" })).toBe("custom");
  });
});
