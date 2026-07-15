import { describe, expect, it } from "vitest";

import {
  metricFootnoteToneClass,
  metricValueToneClass,
  sortMetricCurrencyValues,
  type MetricCurrencyValue,
  type MetricTone,
} from "@/lib/ui/financial-metric-card-model";

describe("financial-metric-card-model", () => {
  it("ordena UYU antes que USD y no muta el input", () => {
    const input: MetricCurrencyValue[] = [
      { currency: "USD", formatted: "U$S 4.461" },
      { currency: "UYU", formatted: "$ 712.311" },
    ];
    const out = sortMetricCurrencyValues(input);
    expect(out.map((v) => v.currency)).toEqual(["UYU", "USD"]);
    // input intacto (función pura)
    expect(input[0].currency).toBe("USD");
  });

  it("es estable con un solo valor o vacío", () => {
    expect(sortMetricCurrencyValues([]).length).toBe(0);
    expect(sortMetricCurrencyValues([{ currency: "USD", formatted: "U$S 1" }])[0].currency).toBe(
      "USD"
    );
  });

  it("mapea cada tono a una clase de valor y de footnote", () => {
    const tones: MetricTone[] = ["neutral", "positive", "warning", "danger"];
    for (const tone of tones) {
      expect(metricValueToneClass(tone)).toContain("var(--copilot-");
      expect(metricFootnoteToneClass(tone)).toContain("var(--copilot-");
    }
    expect(metricValueToneClass("danger")).toContain("danger");
    expect(metricValueToneClass("neutral")).toContain("ink");
  });
});
