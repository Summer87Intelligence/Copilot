import { describe, expect, it } from "vitest";

import {
  DEFAULT_BANK_MOVEMENTS_LIST_FILTERS,
  filterBankMovements,
  matchesMovementScope,
} from "@/lib/bank-movements/bank-movements-filters";
import { parseReconciliationListFilters } from "@/lib/bank-movements/bank-movement-reconciliation-api";
import type { BankMovement } from "@/lib/bank-movements/bank-movements-types";

function mv(id: string, date: string): BankMovement {
  return {
    id,
    workspace_id: "ws-1",
    import_id: null,
    bank_name: "Santander",
    account_label: "1211749",
    movement_date: date,
    description: "Movimiento",
    raw_description: null,
    amount: 100,
    currency: "UYU",
    direction: "inflow",
    bank_reference: null,
    status: "pending",
    matched_type: null,
    matched_id: null,
    matched_confidence: null,
    matched_by: null,
    matched_at: null,
    metadata: null,
    created_at: "2026-07-05T00:00:00Z",
    updated_at: "2026-07-05T00:00:00Z",
  };
}

const HIST = mv("hist", "2025-03-01");
const OP = mv("op", "2026-07-05");
const BOUNDARY = mv("boundary", "2026-01-01");
const MID_2026 = mv("mid", "2026-06-30");

describe("bank module default scope guard", () => {
  it("scope operativo por defecto", () => {
    expect(DEFAULT_BANK_MOVEMENTS_LIST_FILTERS.scope).toBe("operational");
  });

  it("(20)(30) vista por defecto excluye históricos (< 2026-01-01)", () => {
    const out = filterBankMovements([HIST, OP, BOUNDARY, MID_2026], DEFAULT_BANK_MOVEMENTS_LIST_FILTERS);
    expect(out.map((m) => m.id).sort()).toEqual(["boundary", "mid", "op"]);
  });

  it("(17) filtro=all incluye históricos", () => {
    const out = filterBankMovements([HIST, OP], {
      ...DEFAULT_BANK_MOVEMENTS_LIST_FILTERS,
      scope: "all",
    });
    expect(out).toHaveLength(2);
  });

  it("scope=historical muestra solo históricos", () => {
    const out = filterBankMovements([HIST, OP], {
      ...DEFAULT_BANK_MOVEMENTS_LIST_FILTERS,
      scope: "historical",
    });
    expect(out.map((m) => m.id)).toEqual(["hist"]);
  });

  it("matchesMovementScope respeta el borde 2026-01-01 como operativo", () => {
    expect(matchesMovementScope("2026-01-01", "operational")).toBe(true);
    expect(matchesMovementScope("2025-12-31", "operational")).toBe(false);
    expect(matchesMovementScope("2025-12-31", "historical")).toBe(true);
    expect(matchesMovementScope("2026-06-30", "operational")).toBe(true);
  });
});

describe("(18)(20) reconciliation guard: histórico no alimenta tareas/alertas por defecto", () => {
  it("por defecto includeHistorical=false", () => {
    const filters = parseReconciliationListFilters(new URLSearchParams("status=pending"));
    expect(filters.includeHistorical).toBe(false);
  });

  it("scope=all activa includeHistorical", () => {
    const filters = parseReconciliationListFilters(new URLSearchParams("scope=all"));
    expect(filters.includeHistorical).toBe(true);
  });

  it("include_historical=1 activa includeHistorical", () => {
    const filters = parseReconciliationListFilters(new URLSearchParams("include_historical=1"));
    expect(filters.includeHistorical).toBe(true);
  });
});
