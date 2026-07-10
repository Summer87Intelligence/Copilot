import { describe, expect, it } from "vitest";

import {
  bankDescriptionContainsRut,
  compareAliasToBankDescription,
  extractPossiblePayerName,
  normalizeAliasText,
  normalizeBankText,
  normalizeRut,
} from "@/lib/bank-movements/bank-text-normalization";

describe("normalizeAliasText", () => {
  it("1. JP SOLUCIONES S.A.S. == JP SOLUCIONES SAS", () => {
    expect(normalizeAliasText("JP SOLUCIONES S.A.S.")).toBe("jp soluciones");
    expect(normalizeAliasText("JP SOLUCIONES SAS")).toBe("jp soluciones");
    expect(normalizeAliasText("JP Soluciones S.A.S.")).toBe(
      normalizeAliasText("jp soluciones sas")
    );
  });

  it("no rompe nombres sin sufijo", () => {
    expect(normalizeAliasText("Fixerware")).toBe("fixerware");
  });
});

describe("extractPossiblePayerName", () => {
  it("2. quita prefijo de transferencia recibida", () => {
    expect(extractPossiblePayerName("TRANSFERENCIA RECIBIDA JP SOLUCIONES SAS")).toBe(
      "jp soluciones sas"
    );
    expect(extractPossiblePayerName("CREDITO ABONO ACME SRL")).toContain("acme");
  });

  it("quita montos al final", () => {
    expect(extractPossiblePayerName("TRANSFERENCIA JP SOLUCIONES 183,00")).toBe("jp soluciones");
  });
});

describe("compareAliasToBankDescription", () => {
  it("alias exacto matchea exact", () => {
    const r = compareAliasToBankDescription(
      "JP SOLUCIONES SAS",
      "TRANSFERENCIA RECIBIDA JP SOLUCIONES S.A.S. 183"
    );
    expect(r.kind).toBe("exact");
  });

  it("alias parcial razonable matchea partial", () => {
    const r = compareAliasToBankDescription(
      "SOLUCIONES DIGITALES",
      "TRANSFERENCIA RECIBIDA SOLUCIONES GLOBALES"
    );
    expect(r.kind).toBe("partial");
  });

  it("3. alias demasiado corto o ambiguo no matchea", () => {
    expect(compareAliasToBankDescription("SA", "TRANSFERENCIA RECIBIDA JP SOLUCIONES SAS").kind).toBe(
      "none"
    );
    expect(compareAliasToBankDescription("pago", "PAGO RECIBIDO").kind).toBe("none");
    expect(compareAliasToBankDescription("JP SOLUCIONES SAS", "COMPRA SUPERMERCADO").kind).toBe(
      "none"
    );
  });
});

describe("normalizeBankText", () => {
  it("limpia tildes, símbolos y espacios", () => {
    expect(normalizeBankText("  Depósito  —  José  ")).toBe("deposito jose");
  });
});

describe("RUT", () => {
  it("normaliza y detecta RUT largo en descripción", () => {
    expect(normalizeRut("21.100.938.0012")).toBe("211009380012");
    expect(bankDescriptionContainsRut("TRANSF RUT 211009380012 ACME", "21.100.938.0012")).toBe(true);
    expect(bankDescriptionContainsRut("TRANSF 183 ACME", "211009380012")).toBe(false);
    expect(bankDescriptionContainsRut("TRANSF 123 ACME", "123")).toBe(false); // muy corto
  });
});
