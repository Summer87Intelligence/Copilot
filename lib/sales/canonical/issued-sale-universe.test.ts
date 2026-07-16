import { describe, it, expect } from "vitest";

import {
  resolveCanonicalSaleCurrency,
  classifyIssuedSaleRow,
  isValidIssuedSaleRow,
  isVoidedSaleStatus,
  netIssuedByCurrency,
  type IssuedSaleRow,
} from "@/lib/sales/canonical/issued-sale-universe";

function voucher(monedaCodigo: string, cfeTipo = "111"): unknown {
  return {
    zeta_customer_voucher_v1: {
      cfe_tipo: cfeTipo,
      raw_payload: { MonedaCodigo: monedaCodigo, CFETipo: cfeTipo },
    },
  };
}

describe("resolveCanonicalSaleCurrency", () => {
  it("prioriza currency_code ISO", () => {
    expect(resolveCanonicalSaleCurrency({ currency_code: "UYU" })).toBe("UYU");
    expect(resolveCanonicalSaleCurrency({ currency_code: " usd " })).toBe("USD");
  });

  it("cae a MonedaCodigo del payload Zeta cuando currency_code es nulo/vacío", () => {
    // FASE 9E: comprobante CCV1 interno sin currency_code (caso PRESTIS).
    expect(resolveCanonicalSaleCurrency({ currency_code: null, zeta_metadata: voucher("1", "0") })).toBe("UYU");
    expect(resolveCanonicalSaleCurrency({ currency_code: "", zeta_metadata: voucher("2", "0") })).toBe("USD");
  });

  it("acepta MonedaCodigo numérico", () => {
    expect(
      resolveCanonicalSaleCurrency({
        currency_code: null,
        zeta_metadata: { zeta_customer_voucher_v1: { raw_payload: { MonedaCodigo: 1 } } },
      })
    ).toBe("UYU");
  });

  it("devuelve null cuando no se puede resolver", () => {
    expect(resolveCanonicalSaleCurrency({ currency_code: null })).toBeNull();
    expect(resolveCanonicalSaleCurrency({ currency_code: "EUR" })).toBeNull();
    expect(resolveCanonicalSaleCurrency({ currency_code: null, zeta_metadata: voucher("9") })).toBeNull();
  });
});

describe("isVoidedSaleStatus", () => {
  it("detecta variantes anuladas", () => {
    for (const s of ["void", "voided", "cancelled", "anulado", "ANULADA"]) {
      expect(isVoidedSaleStatus(s)).toBe(true);
    }
    expect(isVoidedSaleStatus("issued")).toBe(false);
    expect(isVoidedSaleStatus(null)).toBe(false);
  });
});

describe("classifyIssuedSaleRow", () => {
  const base: IssuedSaleRow = { currency_code: "UYU", total_amount: 100, status: "issued", is_active: true };

  it("incluye ventas válidas", () => {
    const c = classifyIssuedSaleRow(base);
    expect(c).toMatchObject({ include: true, currency: "UYU", isCreditNote: false, total: 100 });
  });

  it("excluye inactivas, anuladas, monto ≤ 0 y moneda desconocida", () => {
    expect(classifyIssuedSaleRow({ ...base, is_active: false }).include).toBe(false);
    expect(classifyIssuedSaleRow({ ...base, status: "anulado" }).include).toBe(false);
    expect(classifyIssuedSaleRow({ ...base, total_amount: 0 }).include).toBe(false);
    expect(classifyIssuedSaleRow({ ...base, currency_code: null }).include).toBe(false);
  });

  it("marca NC pero la mantiene en el universo", () => {
    const nc = classifyIssuedSaleRow({ ...base, is_credit_note: true });
    expect(nc.include).toBe(true);
    expect(nc.isCreditNote).toBe(true);
    expect(isValidIssuedSaleRow({ ...base, is_credit_note: true })).toBe(false);
  });

  it("resuelve moneda desde MonedaCodigo cuando falta currency_code", () => {
    const c = classifyIssuedSaleRow({
      currency_code: null,
      total_amount: 68320,
      status: "paid",
      is_active: true,
      zeta_metadata: voucher("1", "0"),
    });
    expect(c).toMatchObject({ include: true, currency: "UYU", total: 68320 });
  });
});

describe("netIssuedByCurrency", () => {
  it("neto = facturas − NC por moneda, incluyendo comprobantes sin currency_code", () => {
    const rows: IssuedSaleRow[] = [
      { currency_code: "UYU", total_amount: 666122.5, status: "issued", is_active: true },
      // Comprobante interno sin currency_code (FASE 9E) — antes lo perdía Finanzas.
      { currency_code: null, total_amount: 97112, status: "paid", is_active: true, zeta_metadata: voucher("1", "0") },
      // NC UYU: resta del neto.
      { currency_code: "UYU", total_amount: 2000, status: "issued", is_active: true, is_credit_note: true },
      // USD.
      { currency_code: "USD", total_amount: 9469.28, status: "issued", is_active: true },
      { currency_code: null, total_amount: 305, status: "paid", is_active: true, zeta_metadata: voucher("2", "0") },
      // Anulada: no cuenta.
      { currency_code: "UYU", total_amount: 500000, status: "anulado", is_active: true },
    ];
    const net = netIssuedByCurrency(rows);
    expect(net.UYU).toBeCloseTo(666122.5 + 97112 - 2000, 2);
    expect(net.USD).toBeCloseTo(9469.28 + 305, 2);
  });
});
