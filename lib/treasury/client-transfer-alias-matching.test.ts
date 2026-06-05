import { describe, expect, it } from "vitest";

import { resolveClientTransferAliasesForMatching } from "./client-transfer-alias-matching";

describe("resolveClientTransferAliasesForMatching", () => {
  it("usa transfer_method legacy cuando no hay aliases activos", () => {
    expect(
      resolveClientTransferAliasesForMatching([], "DOLBY SOCIEDAD ANONIMA")
    ).toEqual(["DOLBY SOCIEDAD ANONIMA"]);
  });

  it("usa aliases activos cuando existen", () => {
    expect(
      resolveClientTransferAliasesForMatching(
        ["ALIAS A", "ALIAS B"],
        "LEGACY VALUE"
      )
    ).toEqual(["ALIAS A", "ALIAS B"]);
  });

  it("no duplica legacy si hay aliases activos", () => {
    const result = resolveClientTransferAliasesForMatching(
      ["PETROVIC SOLUTIONS"],
      "PETROVIC SOLUTIONS"
    );
    expect(result).toEqual(["PETROVIC SOLUTIONS"]);
    expect(result).toHaveLength(1);
  });

  it("ignora aliases vacíos y cae a legacy", () => {
    expect(
      resolveClientTransferAliasesForMatching(["  ", ""], "BROU CLIENTE X")
    ).toEqual(["BROU CLIENTE X"]);
  });

  it("sin aliases ni legacy devuelve vacío", () => {
    expect(resolveClientTransferAliasesForMatching([], null)).toEqual([]);
    expect(resolveClientTransferAliasesForMatching([], "   ")).toEqual([]);
  });

  it("alias eliminado (lista vacía) no matchea ese alias; legacy aplica", () => {
    expect(
      resolveClientTransferAliasesForMatching([], "DELETED ALIAS TEXT")
    ).toEqual(["DELETED ALIAS TEXT"]);
    expect(
      resolveClientTransferAliasesForMatching([], "DELETED ALIAS TEXT")
    ).not.toContain("OTHER ALIAS");
  });
});
