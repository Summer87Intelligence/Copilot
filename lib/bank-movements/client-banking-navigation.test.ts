import { describe, expect, it } from "vitest";

import {
  buildBankReturnToQuery,
  buildClientBankingHref,
} from "@/lib/bank-movements/client-banking-navigation";

describe("client-banking-navigation", () => {
  it("abre Cliente 360 en identificación bancaria", () => {
    const href = buildClientBankingHref({
      clientCompanyId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      returnTo: "tab=movimientos&movementId=m1",
    });
    expect(href).toContain("/copilot/clientes/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee?");
    expect(href).toContain("tab=identificacion");
    expect(href).toContain("returnTo=");
  });

  it("arma retorno seguro a Banco", () => {
    expect(buildBankReturnToQuery({ tab: "conciliacion", movementId: "m1" })).toBe(
      "tab=conciliacion&movementId=m1"
    );
  });

  it("preserva filtros existentes cuando recibe una query base", () => {
    expect(
      buildBankReturnToQuery({
        tab: "movimientos",
        movementId: "m9",
        baseQuery: "tab=historial&period=this_month&q=acme",
      })
    ).toBe("tab=movimientos&period=this_month&q=acme&movementId=m9");
  });
});
