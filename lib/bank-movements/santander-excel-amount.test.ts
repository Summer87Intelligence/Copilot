import { describe, expect, it } from "vitest";

import {
  normalizeSantanderExcelAmount,
  normalizeSantanderExcelSignedAmount,
  normalizeUyuExcelJsNumber,
  resolveImportedBankMovementAmount,
  shouldScaleUyuJsNumber,
} from "@/lib/bank-movements/santander-excel-amount";
import type { BankMovement } from "@/lib/bank-movements/bank-movements-types";

describe("santander-excel-amount", () => {
  it("UYU 3.548 → 3548", () => {
    expect(normalizeSantanderExcelAmount(3.548, "UYU")).toBe(3548);
    expect(normalizeSantanderExcelAmount("3.548,00", "UYU")).toBe(3548);
    expect(normalizeSantanderExcelAmount("-3,548.00", "UYU")).toBe(3548);
  });

  it("UYU 1.375 → 1375", () => {
    expect(normalizeSantanderExcelAmount(1.375, "UYU")).toBe(1375);
    expect(normalizeSantanderExcelAmount("-1,375.00", "UYU")).toBe(1375);
  });

  it("UYU 27.509 → 27509", () => {
    expect(normalizeSantanderExcelAmount(27.509, "UYU")).toBe(27509);
  });

  it("UYU 741.96 queda como centavos reales", () => {
    expect(normalizeSantanderExcelAmount(741.96, "UYU")).toBe(741.96);
    expect(shouldScaleUyuJsNumber(741.96)).toBe(false);
  });

  it("USD no escala", () => {
    expect(normalizeSantanderExcelAmount(41.02, "USD")).toBe(41.02);
    expect(normalizeSantanderExcelAmount("90.91", "USD")).toBe(90.91);
    expect(normalizeSantanderExcelAmount(1300, "USD")).toBe(1300);
    expect(normalizeSantanderExcelAmount("740", "USD")).toBe(740);
    expect(normalizeSantanderExcelAmount("-$ 126.92", "USD")).toBe(126.92);
    expect(normalizeSantanderExcelAmount("$ 2,515.83", "USD")).toBe(2515.83);
    expect(normalizeSantanderExcelAmount("1,300.50", "USD")).toBe(1300.5);
  });

  it("resolveImportedBankMovementAmount corrige filas ya importadas", () => {
    const movement = {
      amount: 3.55,
      currency: "UYU",
      direction: "outflow",
      metadata: { parser: "santander_excel_consolidated_v1", debit: 3.548 },
    } as Pick<BankMovement, "amount" | "currency" | "direction" | "metadata">;
    expect(resolveImportedBankMovementAmount(movement)).toBe(3548);
  });

  it("normalizeUyuExcelJsNumber escala solo 3 decimales", () => {
    expect(normalizeUyuExcelJsNumber(77.9)).toBe(77.9);
    expect(normalizeUyuExcelJsNumber(3.548)).toBe(3548);
  });

  it("saldo UYU con coma miles", () => {
    expect(normalizeSantanderExcelSignedAmount("457,605.52", "UYU")).toBe(457605.52);
  });
});
