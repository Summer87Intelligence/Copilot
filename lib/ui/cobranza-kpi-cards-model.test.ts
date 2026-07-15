import { describe, expect, it } from "vitest";
import {
  buildCobranzaMoneyValues,
  contactedTone,
  fulfillmentTone,
} from "@/lib/ui/cobranza-kpi-cards-model";

const fmt = (n: number, c: "UYU" | "USD") =>
  c === "USD" ? `U$S ${n}` : `$ ${n}`;

describe("buildCobranzaMoneyValues", () => {
  it("UYU only: single UYU value, no USD", () => {
    const v = buildCobranzaMoneyValues(1000, 0, fmt);
    expect(v).toEqual([{ currency: "UYU", formatted: "$ 1000" }]);
  });

  it("USD only: single USD value, no UYU", () => {
    const v = buildCobranzaMoneyValues(0, 50, fmt);
    expect(v).toEqual([{ currency: "USD", formatted: "U$S 50" }]);
  });

  it("UYU + USD: two independent values, UYU first, never combined", () => {
    const v = buildCobranzaMoneyValues(1000, 50, fmt);
    expect(v).toHaveLength(2);
    expect(v[0].currency).toBe("UYU");
    expect(v[1].currency).toBe("USD");
    // Cada entrada es una sola moneda con su propio string: nunca se concatenan
    // ambos montos en una misma línea (`… · …`).
    expect(v.every((x) => !x.formatted.includes("·"))).toBe(true);
    expect(v[0].formatted).toBe("$ 1000");
    expect(v[1].formatted).toBe("U$S 50");
  });

  it("no data: empty array so the card falls back to emptyText", () => {
    expect(buildCobranzaMoneyValues(0, 0, fmt)).toEqual([]);
  });
});

describe("fulfillmentTone", () => {
  it("null → neutral; <40 danger; <70 warning; else neutral", () => {
    expect(fulfillmentTone(null)).toBe("neutral");
    expect(fulfillmentTone(0)).toBe("danger");
    expect(fulfillmentTone(39)).toBe("danger");
    expect(fulfillmentTone(40)).toBe("warning");
    expect(fulfillmentTone(69)).toBe("warning");
    expect(fulfillmentTone(70)).toBe("neutral");
    expect(fulfillmentTone(100)).toBe("neutral");
  });
});

describe("contactedTone", () => {
  it("no debtors → neutral; under half → warning; else neutral", () => {
    expect(contactedTone(0, 0)).toBe("neutral");
    expect(contactedTone(1, 10)).toBe("warning");
    expect(contactedTone(5, 10)).toBe("neutral");
    expect(contactedTone(10, 10)).toBe("neutral");
  });
});
