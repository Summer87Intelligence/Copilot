import { describe, expect, it } from "vitest";

import {
  bankAccountScopeReason,
  classifyBankAccount,
  isAllowedBusinessBankAccount,
  isBlockedPersonalBankAccount,
  isImportableBankAccount,
  normalizeBankAccountNumber,
} from "@/lib/bank-movements/bank-account-scope";

describe("normalizeBankAccountNumber", () => {
  it("1. deja solo dígitos y preserva ceros iniciales", () => {
    expect(normalizeBankAccountNumber("005205831977")).toBe("005205831977");
    expect(normalizeBankAccountNumber("Santander 000001211749 UYU")).toBe("000001211749");
    expect(normalizeBankAccountNumber(" 5.101.107-711 ")).toBe("5101107711");
    expect(normalizeBankAccountNumber(null)).toBe("");
  });
});

describe("classifyBankAccount", () => {
  it("2. 1211749 → business", () => {
    expect(classifyBankAccount("1211749")).toBe("business");
  });
  it("3. 5101107711 → business", () => {
    expect(classifyBankAccount("5101107711")).toBe("business");
  });
  it("business también con ceros a la izquierda (label real)", () => {
    expect(classifyBankAccount("000001211749")).toBe("business");
  });
  it("4. 005205831977 → blocked_personal", () => {
    expect(classifyBankAccount("005205831977")).toBe("blocked_personal");
  });
  it("5. 001205667098 → blocked_personal", () => {
    expect(classifyBankAccount("001205667098")).toBe("blocked_personal");
  });
  it("6. 5205831977 (sin ceros) matchea 005205831977", () => {
    expect(classifyBankAccount("5205831977")).toBe("blocked_personal");
    expect(isBlockedPersonalBankAccount("5205831977")).toBe(true);
  });
  it("7. 1205667098 (sin ceros) matchea 001205667098", () => {
    expect(classifyBankAccount("1205667098")).toBe("blocked_personal");
  });
  it("cuenta desconocida → unknown", () => {
    expect(classifyBankAccount("9999999")).toBe("unknown");
    expect(classifyBankAccount("")).toBe("unknown");
    expect(classifyBankAccount(null)).toBe("unknown");
  });
});

describe("isAllowedBusinessBankAccount / isImportableBankAccount", () => {
  it("solo business es importable", () => {
    expect(isAllowedBusinessBankAccount("1211749")).toBe(true);
    expect(isImportableBankAccount("000001211749")).toBe(true);
    expect(isImportableBankAccount("005205831977")).toBe(false);
    expect(isImportableBankAccount("9999999")).toBe(false);
  });
});

describe("bankAccountScopeReason", () => {
  it("da copy claro para bloqueada y desconocida", () => {
    expect(bankAccountScopeReason("blocked_personal", "005205831977")).toContain("personal");
    expect(bankAccountScopeReason("unknown", "9999999")).toContain("no reconocida");
    expect(bankAccountScopeReason("business", "1211749")).toBe("");
  });
});
