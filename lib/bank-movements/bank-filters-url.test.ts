import { describe, expect, it } from "vitest";

import {
  bankFiltersToSearchParams,
  parseBankFiltersFromSearchParams,
} from "@/lib/bank-movements/bank-filters-url";
import { DEFAULT_BANK_MOVEMENTS_LIST_FILTERS } from "@/lib/bank-movements/bank-movements-filters";

describe("bank-filters-url", () => {
  it("serializa preset, mes y custom sin periodKey", () => {
    const preset = bankFiltersToSearchParams({
      period: { kind: "preset", preset: "this_month" },
      filters: DEFAULT_BANK_MOVEMENTS_LIST_FILTERS,
      from: "2026-07-01",
      to: "2026-07-23",
    });
    expect(preset.get("period")).toBe("this_month");
    expect(preset.has("from")).toBe(false);
    expect(preset.has("to")).toBe(false);
    expect(preset.has("periodKey")).toBe(false);

    const month = bankFiltersToSearchParams({
      period: { kind: "month", year: 2026, month: 6 },
      filters: DEFAULT_BANK_MOVEMENTS_LIST_FILTERS,
      from: "2026-06-01",
      to: "2026-06-30",
    });
    expect(month.get("month")).toBe("2026-06");
    expect(month.has("periodKey")).toBe(false);

    const custom = bankFiltersToSearchParams({
      period: { kind: "custom", from: "2026-07-01", to: "2026-07-10" },
      filters: DEFAULT_BANK_MOVEMENTS_LIST_FILTERS,
      from: "2026-07-01",
      to: "2026-07-10",
    });
    expect(custom.get("period")).toBe("custom");
    expect(custom.has("periodKey")).toBe(false);
  });

  it("hidrata filtros extendidos clientPresence y simpleStates", () => {
    const sp = new URLSearchParams("client=with&simpleStates=sin_cliente,asociado&q=acme");
    const parsed = parseBankFiltersFromSearchParams(sp);
    expect(parsed.filters.clientPresence).toBe("with");
    expect(parsed.filters.simpleStates).toBe("sin_cliente,asociado");
    expect(parsed.filters.text).toBe("acme");
  });

  it("round-trip filtros activos omitiendo defaults", () => {
    const filters = {
      ...DEFAULT_BANK_MOVEMENTS_LIST_FILTERS,
      text: "movistar",
      currency: "UYU" as const,
      clientPresence: "without" as const,
      simpleStates: "pendiente",
      duplicates: "all" as const,
    };
    const params = bankFiltersToSearchParams({
      period: { kind: "preset", preset: "last_7_days" },
      filters,
      from: "2026-07-17",
      to: "2026-07-23",
      page: 2,
      pageSize: 50,
      sort: "amount_desc",
      kpiFocus: "pending",
    });

    const back = parseBankFiltersFromSearchParams(params);
    expect(back.period).toEqual({ kind: "preset", preset: "last_7_days" });
    expect(back.filters.text).toBe("movistar");
    expect(back.filters.currency).toBe("UYU");
    expect(back.filters.clientPresence).toBe("without");
    expect(back.filters.simpleStates).toBe("pendiente");
    expect(back.filters.duplicates).toBe("all");
    expect(back.page).toBe(2);
    expect(back.pageSize).toBe(50);
    expect(back.sort).toBe("amount_desc");
    expect(back.kpiFocus).toBe("pending");
  });

  it("mes en URL tiene precedencia sobre preset", () => {
    const parsed = parseBankFiltersFromSearchParams(
      new URLSearchParams("month=2026-05&period=last_7_days&from=2026-07-01&to=2026-07-23")
    );
    expect(parsed.period).toEqual({ kind: "month", year: 2026, month: 5 });
  });
});
