import { describe, it, expect } from "vitest";

import {
  buildOpenCuotaKey,
  collectOpenCuotaKeysFromMapped,
  shouldCloseStaleInstallment,
} from "@/lib/integrations/zeta/zeta-stale-installment-cleanup";
import { INSTALLMENT_SALDO_EPSILON } from "@/lib/integrations/zeta/zeta-installment-guard";
import type { ProtoInstallmentInput } from "@/lib/integrations/zeta/zeta-installments-mapper";

function installment(partial: Partial<ProtoInstallmentInput>): ProtoInstallmentInput {
  return {
    zeta_registro_id: 2501,
    cliente_codigo: "161",
    cuota_numero: 1,
    cuota_vencimiento: "2026-04-03",
    moneda_codigo: 1,
    currency_code: "UYU",
    cuota_total: 18056,
    cuota_saldo: 6909,
    es_entrega_inicial: null,
    raw_payload: {},
    ...partial,
  };
}

describe("buildOpenCuotaKey", () => {
  it("combines registro id and cuota numero", () => {
    expect(buildOpenCuotaKey("2501", 1)).toBe("2501:1");
    expect(buildOpenCuotaKey(2640, 2)).toBe("2640:2");
  });
});

describe("collectOpenCuotaKeysFromMapped", () => {
  it("includes only rows with open saldo", () => {
    const keys = collectOpenCuotaKeysFromMapped([
      installment({ zeta_registro_id: 2501, cuota_saldo: 6909 }),
      installment({ zeta_registro_id: 2640, cuota_saldo: 0 }),
      installment({ zeta_registro_id: 2640, cuota_numero: 2, cuota_saldo: 400 }),
    ]);
    expect(keys.has("2501:1")).toBe(true);
    expect(keys.has("2640:2")).toBe(true);
    expect(keys.has("2640:1")).toBe(false);
  });
});

describe("shouldCloseStaleInstallment", () => {
  it("Case A: absent from saldos and cuotas → close", () => {
    expect(
      shouldCloseStaleInstallment({
        invoiceAbsentFromSaldos: true,
        installmentAbsentFromCuotasResponse: true,
        installmentOpenSaldo: 15320,
        invoiceBalance: 15320,
        saldosMissingSignal: true,
      })
    ).toBe(true);
  });

  it("Case B: still in saldos → do not close", () => {
    expect(
      shouldCloseStaleInstallment({
        invoiceAbsentFromSaldos: false,
        installmentAbsentFromCuotasResponse: true,
        installmentOpenSaldo: 15320,
        invoiceBalance: 15320,
        saldosMissingSignal: false,
      })
    ).toBe(false);
  });

  it("Case C: absent from saldos but cuota still in Zeta response → do not close", () => {
    expect(
      shouldCloseStaleInstallment({
        invoiceAbsentFromSaldos: true,
        installmentAbsentFromCuotasResponse: false,
        installmentOpenSaldo: 6909,
        invoiceBalance: 6909,
        saldosMissingSignal: true,
      })
    ).toBe(false);
  });

  it("does not close when installment saldo already zero", () => {
    expect(
      shouldCloseStaleInstallment({
        invoiceAbsentFromSaldos: true,
        installmentAbsentFromCuotasResponse: true,
        installmentOpenSaldo: 0,
        invoiceBalance: 0,
        saldosMissingSignal: true,
      })
    ).toBe(false);
  });

  it("does not close when invoice balance already zero", () => {
    expect(
      shouldCloseStaleInstallment({
        invoiceAbsentFromSaldos: true,
        installmentAbsentFromCuotasResponse: true,
        installmentOpenSaldo: 100,
        invoiceBalance: 0,
        saldosMissingSignal: true,
      })
    ).toBe(false);
  });

  it("cuotas-only path: requires saldos missing signal on invoice metadata", () => {
    expect(
      shouldCloseStaleInstallment({
        invoiceAbsentFromSaldos: false,
        installmentAbsentFromCuotasResponse: true,
        installmentOpenSaldo: 100,
        invoiceBalance: 100,
        saldosMissingSignal: false,
      })
    ).toBe(false);
    expect(
      shouldCloseStaleInstallment({
        invoiceAbsentFromSaldos: false,
        installmentAbsentFromCuotasResponse: true,
        installmentOpenSaldo: 100,
        invoiceBalance: 100,
        saldosMissingSignal: true,
      })
    ).toBe(true);
  });

  it("saldos zero-pass path: absent from live saldos closes without metadata signal", () => {
    expect(
      shouldCloseStaleInstallment({
        invoiceAbsentFromSaldos: true,
        installmentAbsentFromCuotasResponse: true,
        installmentOpenSaldo: 15320,
        invoiceBalance: 15320,
        saldosMissingSignal: false,
      })
    ).toBe(true);
  });
});

describe("epsilon alignment with installment guard", () => {
  it("epsilon is 0.005 for guard contract tests", () => {
    expect(INSTALLMENT_SALDO_EPSILON).toBe(0.005);
  });
});
