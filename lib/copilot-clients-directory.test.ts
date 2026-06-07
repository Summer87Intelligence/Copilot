import { describe, expect, it } from "vitest";

import {
  buildClientsDirectory,
  readInvoiceZetaClientName,
} from "@/lib/copilot-clients-directory";

describe("buildClientsDirectory", () => {
  it("incluye deudor solo en facturas sin fila en proto_companies", () => {
    const { entries, diagnostics } = buildClientsDirectory({
      companies: [
        { id: "c-active", name: "Empresa Activa", industry: "Retail", is_active: true },
      ],
      invoices: [
        {
          id: "i1",
          company_id: "c-active",
          total_amount: 1000,
          balance_amount: 500,
          currency_code: "UYU",
          status: "issued",
        },
        {
          id: "i2",
          company_id: "c-debt-only",
          total_amount: 2000,
          balance_amount: 800,
          currency_code: "USD",
          status: "issued",
          zeta_metadata: {
            zeta_customer_voucher_v1: { zeta_cliente_nombre: "Zeta Debt Co" },
          },
        },
      ],
      todayYmd: "2026-05-19",
    });

    expect(diagnostics.debtors_missing_company_row).toBe(1);
    expect(entries.map((e) => e.company_id).sort()).toEqual(["c-active", "c-debt-only"]);

    const derived = entries.find((e) => e.company_id === "c-debt-only");
    expect(derived?.source).toBe("zeta_invoice");
    expect(derived?.derived_from_debt).toBe(true);
    expect(derived?.name).toBe("Zeta Debt Co");
    expect(derived?.debtUSD).toBe(800);
    expect(derived?.has_contact_data).toBe(false);
  });

  it("recupera empresa inactiva con deuda (merged)", () => {
    const { entries } = buildClientsDirectory({
      companies: [
        {
          id: "c-inactive",
          name: "Inactiva SA",
          is_active: false,
        },
      ],
      invoices: [
        {
          id: "i1",
          company_id: "c-inactive",
          total_amount: 100,
          balance_amount: 40,
          currency_code: "UYU",
        },
      ],
      todayYmd: "2026-05-19",
    });

    const row = entries.find((e) => e.company_id === "c-inactive");
    expect(row?.source).toBe("merged");
    expect(row?.derived_from_debt).toBe(true);
    expect(row?.hasDebt).toBe(true);
  });

  it("ordena con deuda primero y luego por facturación", () => {
    const { entries } = buildClientsDirectory({
      companies: [
        { id: "a", name: "A", is_active: true },
        { id: "b", name: "B", is_active: true },
      ],
      invoices: [
        { id: "i1", company_id: "a", total_amount: 10, balance_amount: 0, currency_code: "UYU" },
        {
          id: "i2",
          company_id: "b",
          total_amount: 100,
          balance_amount: 50,
          currency_code: "UYU",
        },
      ],
    });

    expect(entries[0]?.company_id).toBe("b");
    expect(entries[0]?.hasDebt).toBe(true);
  });

  it("CCV1 + shadow mismo RegistroId no duplica deuda", () => {
    const { entries } = buildClientsDirectory({
      companies: [{ id: "c1", name: "Bloommy", is_active: true }],
      invoices: [
        {
          id: "real",
          company_id: "c1",
          invoice_number: "ZETA:CCV1:E:c1:A:1",
          category: "Zeta / factura cliente",
          total_amount: 54_900,
          balance_amount: 54_900,
          currency_code: "UYU",
          zeta_metadata: {
            zeta_comprobante_identity_v1: { schema_version: 1, registro_id: "9001" },
          },
        },
        {
          id: "shadow",
          company_id: "c1",
          invoice_number: "ZETA:9001",
          category: "Zeta / saldos pendientes",
          total_amount: 54_900,
          balance_amount: 54_900,
          currency_code: "UYU",
        },
      ],
      todayYmd: "2026-06-01",
    });
    expect(entries.find((e) => e.company_id === "c1")?.debtUYU).toBe(54_900);
  });
});

describe("readInvoiceZetaClientName", () => {
  it("lee zeta_cliente_nombre del voucher metadata", () => {
    expect(
      readInvoiceZetaClientName({
        zeta_customer_voucher_v1: { zeta_cliente_nombre: "  ACME  " },
      })
    ).toBe("ACME");
  });
});
