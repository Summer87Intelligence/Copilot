import { describe, expect, it } from "vitest";

import {
  computePeriodFrom,
  filterHistoryByCliente,
  filterHistoryByCurrency,
  mapManualMovementRow,
  mapZetaReceiptRow,
  mergeAndSort,
  parsePeriodParam,
  uniqueClientesFromHistory,
  type CobranzaHistoryRow,
} from "./copilot-cobranza-history";

const EMPTY_NAMES = new Map<string, string>();

function makeRow(overrides: Partial<CobranzaHistoryRow> = {}): CobranzaHistoryRow {
  return {
    id: "id-1",
    fecha: "2026-06-01",
    clienteNombre: "Cliente A",
    monto: 100,
    moneda: "UYU",
    origen: "Manual",
    referencia: null,
    registradoPor: "Manual",
    createdAt: "2026-06-01T10:00:00Z",
    ...overrides,
  };
}

// ── computePeriodFrom ─────────────────────────────────────────────────────────

describe("computePeriodFrom", () => {
  it("returns null for 'all'", () => {
    expect(computePeriodFrom("all", "2026-06-23")).toBeNull();
  });

  it("returns first day of month for 'month'", () => {
    expect(computePeriodFrom("month", "2026-06-23")).toBe("2026-06-01");
  });

  it("returns 30 days ago for '30d'", () => {
    const from = computePeriodFrom("30d", "2026-06-23");
    expect(from).toBe("2026-05-24");
  });

  it("handles month boundary correctly for '30d'", () => {
    const from = computePeriodFrom("30d", "2026-01-15");
    expect(from).toBe("2025-12-16");
  });
});

// ── parsePeriodParam ──────────────────────────────────────────────────────────

describe("parsePeriodParam", () => {
  it("accepts valid periods", () => {
    expect(parsePeriodParam("30d")).toBe("30d");
    expect(parsePeriodParam("month")).toBe("month");
    expect(parsePeriodParam("all")).toBe("all");
  });

  it("defaults to 30d for unknown values", () => {
    expect(parsePeriodParam(null)).toBe("30d");
    expect(parsePeriodParam("week")).toBe("30d");
    expect(parsePeriodParam("")).toBe("30d");
  });
});

// ── mapManualMovementRow ──────────────────────────────────────────────────────

describe("mapManualMovementRow", () => {
  it("maps a valid movement row", () => {
    const raw = {
      id: "mov-1",
      movement_date: "2026-06-10",
      amount: 1500,
      currency_code: "UYU",
      counterparty: "Empresa X",
      company_id: null,
      reference: "REF-001",
      created_at: "2026-06-10T14:00:00Z",
    };
    const result = mapManualMovementRow(raw, EMPTY_NAMES);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("mov-1");
    expect(result!.fecha).toBe("2026-06-10");
    expect(result!.monto).toBe(1500);
    expect(result!.moneda).toBe("UYU");
    expect(result!.clienteNombre).toBe("Empresa X");
    expect(result!.origen).toBe("Manual");
    expect(result!.referencia).toBe("REF-001");
    expect(result!.registradoPor).toBe("Manual");
  });

  it("uses companyNames map when counterparty is empty", () => {
    const names = new Map([["company-uuid", "Empresa Y"]]);
    const raw = {
      id: "mov-2",
      movement_date: "2026-06-11",
      amount: 200,
      currency_code: "USD",
      counterparty: "",
      company_id: "company-uuid",
      reference: null,
      created_at: "2026-06-11T09:00:00Z",
    };
    const result = mapManualMovementRow(raw, names);
    expect(result!.clienteNombre).toBe("Empresa Y");
  });

  it("falls back to 'Cliente no especificado' when no name available", () => {
    const raw = {
      id: "mov-3",
      movement_date: "2026-06-12",
      amount: 50,
      currency_code: "UYU",
      counterparty: null,
      company_id: null,
      reference: null,
      created_at: "2026-06-12T08:00:00Z",
    };
    const result = mapManualMovementRow(raw, EMPTY_NAMES);
    expect(result!.clienteNombre).toBe("Cliente no especificado");
  });

  it("returns null for missing required fields", () => {
    expect(mapManualMovementRow({ id: "", movement_date: "2026-06-01", amount: 100, currency_code: "UYU", created_at: "x" }, EMPTY_NAMES)).toBeNull();
    expect(mapManualMovementRow({ id: "x", movement_date: "", amount: 100, currency_code: "UYU", created_at: "x" }, EMPTY_NAMES)).toBeNull();
    expect(mapManualMovementRow({ id: "x", movement_date: "2026-06-01", amount: -1, currency_code: "UYU", created_at: "x" }, EMPTY_NAMES)).toBeNull();
    expect(mapManualMovementRow({ id: "x", movement_date: "2026-06-01", amount: 100, currency_code: "EUR", created_at: "x" }, EMPTY_NAMES)).toBeNull();
  });

  it("rounds monto to 2 decimals", () => {
    const raw = { id: "x", movement_date: "2026-06-01", amount: 10.999, currency_code: "UYU", counterparty: "A", company_id: null, reference: null, created_at: "x" };
    const result = mapManualMovementRow(raw, EMPTY_NAMES);
    expect(result!.monto).toBe(11);
  });
});

// ── mapZetaReceiptRow ─────────────────────────────────────────────────────────

describe("mapZetaReceiptRow", () => {
  it("maps a valid zeta receipt", () => {
    const names = new Map([["company-z", "Cliente Zeta"]]);
    const raw = {
      id: "rec-1",
      receipt_date: "2026-05-15",
      amount: 3200,
      currency_code: "USD",
      company_id: "company-z",
      reference: "REC-0042",
      created_at: "2026-05-15T18:00:00Z",
    };
    const result = mapZetaReceiptRow(raw, names);
    expect(result).not.toBeNull();
    expect(result!.origen).toBe("Zeta");
    expect(result!.clienteNombre).toBe("Cliente Zeta");
    expect(result!.registradoPor).toBe("Zeta");
    expect(result!.moneda).toBe("USD");
    expect(result!.referencia).toBe("REC-0042");
  });

  it("returns null for invalid currency", () => {
    const raw = { id: "x", receipt_date: "2026-05-15", amount: 100, currency_code: "ARS", company_id: "c", created_at: "x" };
    expect(mapZetaReceiptRow(raw, EMPTY_NAMES)).toBeNull();
  });
});

// ── mergeAndSort ──────────────────────────────────────────────────────────────

describe("mergeAndSort", () => {
  it("sorts by fecha DESC then createdAt DESC", () => {
    const rows: CobranzaHistoryRow[] = [
      makeRow({ id: "a", fecha: "2026-06-01", createdAt: "2026-06-01T08:00:00Z" }),
      makeRow({ id: "b", fecha: "2026-06-03", createdAt: "2026-06-03T10:00:00Z" }),
      makeRow({ id: "c", fecha: "2026-06-03", createdAt: "2026-06-03T12:00:00Z" }),
    ];
    const sorted = mergeAndSort(rows);
    expect(sorted.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("handles same fecha same createdAt (stable by string sort)", () => {
    const rows: CobranzaHistoryRow[] = [
      makeRow({ id: "x", fecha: "2026-06-01", createdAt: "2026-06-01T10:00:00Z" }),
      makeRow({ id: "y", fecha: "2026-06-01", createdAt: "2026-06-01T10:00:00Z" }),
    ];
    const sorted = mergeAndSort(rows);
    expect(sorted).toHaveLength(2);
  });

  it("does not mutate input array", () => {
    const rows = [
      makeRow({ id: "a", fecha: "2026-06-01" }),
      makeRow({ id: "b", fecha: "2026-06-03" }),
    ];
    const original = [...rows];
    mergeAndSort(rows);
    expect(rows[0].id).toBe(original[0].id);
  });

  it("merges manual and zeta rows correctly", () => {
    const manual = [makeRow({ id: "m1", fecha: "2026-06-10", origen: "Manual" })];
    const zeta = [makeRow({ id: "z1", fecha: "2026-06-11", origen: "Zeta" })];
    const sorted = mergeAndSort([...manual, ...zeta]);
    expect(sorted[0].id).toBe("z1");
    expect(sorted[1].id).toBe("m1");
  });
});

// ── filterHistoryByCurrency ───────────────────────────────────────────────────

describe("filterHistoryByCurrency", () => {
  const rows = [
    makeRow({ id: "1", moneda: "UYU" }),
    makeRow({ id: "2", moneda: "USD" }),
    makeRow({ id: "3", moneda: "UYU" }),
  ];

  it("filters by UYU", () => {
    const result = filterHistoryByCurrency(rows, "UYU");
    expect(result.map((r) => r.id)).toEqual(["1", "3"]);
  });

  it("filters by USD", () => {
    const result = filterHistoryByCurrency(rows, "USD");
    expect(result.map((r) => r.id)).toEqual(["2"]);
  });

  it("returns all when currency is empty", () => {
    expect(filterHistoryByCurrency(rows, "")).toHaveLength(3);
  });

  it("returns all when currency is unknown", () => {
    expect(filterHistoryByCurrency(rows, "ARS")).toHaveLength(3);
  });
});

// ── filterHistoryByCliente ────────────────────────────────────────────────────

describe("filterHistoryByCliente", () => {
  const rows = [
    makeRow({ id: "1", clienteNombre: "Empresa A" }),
    makeRow({ id: "2", clienteNombre: "Empresa B" }),
    makeRow({ id: "3", clienteNombre: "Empresa A" }),
  ];

  it("filters by exact name", () => {
    const result = filterHistoryByCliente(rows, "Empresa A");
    expect(result.map((r) => r.id)).toEqual(["1", "3"]);
  });

  it("returns all when cliente is empty", () => {
    expect(filterHistoryByCliente(rows, "")).toHaveLength(3);
  });

  it("returns empty when no match", () => {
    expect(filterHistoryByCliente(rows, "Empresa C")).toHaveLength(0);
  });
});

// ── uniqueClientesFromHistory ─────────────────────────────────────────────────

describe("uniqueClientesFromHistory", () => {
  it("returns unique sorted client names", () => {
    const rows = [
      makeRow({ clienteNombre: "Zeta Corp" }),
      makeRow({ clienteNombre: "Alpha Inc" }),
      makeRow({ clienteNombre: "Zeta Corp" }),
      makeRow({ clienteNombre: "Beta SA" }),
    ];
    const result = uniqueClientesFromHistory(rows);
    expect(result).toEqual(["Alpha Inc", "Beta SA", "Zeta Corp"]);
  });

  it("returns empty array for empty input", () => {
    expect(uniqueClientesFromHistory([])).toEqual([]);
  });
});
