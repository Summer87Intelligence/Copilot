import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import {
  manualCashMovementCreateBodySchema,
  treasuryAccountCreateBodySchema,
} from "@/lib/api/schemas/treasury-api-bodies";
import { mapTreasuryAccountRow } from "@/lib/treasury/treasury-mappers";
import { parseManualCashListQuery, parseTreasuryAccountListQuery } from "@/lib/treasury/treasury-list-query";

describe("treasury API bodies", () => {
  it("rechaza workspace_id en create de cuenta", () => {
    const result = treasuryAccountCreateBodySchema.safeParse({
      workspace_id: "00000000-0000-0000-0000-000000000001",
      name: "Caja",
      type: "cash",
      currency_code: "UYU",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza monto no positivo en movimiento manual", () => {
    const result = manualCashMovementCreateBodySchema.safeParse({
      ledger_type: "cash",
      movement_type: "expense",
      concept: "Gasto",
      amount: 0,
      currency_code: "UYU",
      movement_date: "2026-05-13",
    });
    expect(result.success).toBe(false);
  });

  it("acepta create mínimo válido de movimiento manual", () => {
    const result = manualCashMovementCreateBodySchema.safeParse({
      ledger_type: "cash",
      movement_type: "expense",
      concept: "Gasto",
      amount: 120.5,
      currency_code: "USD",
      movement_date: "2026-05-13",
    });
    expect(result.success).toBe(true);
  });
});

describe("treasury mappers", () => {
  it("mapea fila treasury_accounts a dominio", () => {
    const row = mapTreasuryAccountRow({
      id: "acc-1",
      workspace_id: "ws-1",
      company_id: "erp-1",
      name: "Caja UYU",
      type: "cash",
      bank_name: null,
      account_number: null,
      currency_code: "UYU",
      active: true,
      metadata: { note: "x" },
      created_at: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-02T00:00:00Z",
    });
    expect(row.name).toBe("Caja UYU");
    expect(row.currencyCode).toBe("UYU");
    expect(row.metadata).toEqual({ note: "x" });
  });
});

describe("treasury list query", () => {
  it("parsea filtros de cuentas", () => {
    const request = new NextRequest(
      "https://example.test/api/copilot/treasury/accounts?currency_code=USD&status=active&limit=50"
    );
    const parsed = parseTreasuryAccountListQuery(request);
    expect(parsed.currencyCode).toBe("USD");
    expect(parsed.status).toBe("active");
    expect(parsed.limit).toBe(50);
  });

  it("parsea filtros de movimientos manuales", () => {
    const request = new NextRequest(
      "https://example.test/api/copilot/treasury/manual-cash-movements?from_date=2026-05-01&movement_type=expense"
    );
    const parsed = parseManualCashListQuery(request);
    expect(parsed.fromDate).toBe("2026-05-01");
    expect(parsed.movementType).toBe("expense");
  });
});
