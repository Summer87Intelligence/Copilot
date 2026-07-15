import { describe, expect, it } from "vitest";

import {
  countActiveFilters,
  hasActiveFilters,
  resetFilters,
} from "@/lib/ui/filter-bar-model";

describe("filter-bar-model", () => {
  it("no cuenta valores iguales al default", () => {
    const values = { scope: "operativos", currency: "all", q: "" };
    const defaults = { scope: "operativos", currency: "all" };
    expect(countActiveFilters(values, defaults)).toBe(0);
    expect(hasActiveFilters(values, defaults)).toBe(false);
  });

  it("cuenta valores que difieren del default y búsquedas no vacías", () => {
    const values = { scope: "historicos", currency: "UYU", q: "  movex " };
    const defaults = { scope: "operativos", currency: "all" };
    // scope difiere, currency difiere, q no vacío (sin default) → 3
    expect(countActiveFilters(values, defaults)).toBe(3);
    expect(hasActiveFilters(values, defaults)).toBe(true);
  });

  it("ignora espacios y nulos", () => {
    const values = { q: "   ", other: null };
    expect(countActiveFilters(values)).toBe(0);
  });

  it("resetea a defaults o cadena vacía", () => {
    const values = { scope: "historicos", currency: "UYU", q: "movex" };
    const defaults = { scope: "operativos", currency: "all" };
    expect(resetFilters(values, defaults)).toEqual({
      scope: "operativos",
      currency: "all",
      q: "",
    });
  });
});
