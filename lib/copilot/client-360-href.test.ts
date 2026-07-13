import { describe, expect, it } from "vitest";

import { clientFichaHref } from "@/lib/copilot/client-360-href";

describe("clientFichaHref", () => {
  it("apunta a la ruta de Ficha 360 del cliente", () => {
    expect(clientFichaHref("abc-123")).toBe("/copilot/clientes/abc-123");
  });

  it("codifica el companyId para uso seguro en URL", () => {
    expect(clientFichaHref("id with space/slash")).toBe(
      "/copilot/clientes/id%20with%20space%2Fslash"
    );
  });

  it("nunca genera el patrón legacy de query param (?c=)", () => {
    expect(clientFichaHref("xyz")).not.toContain("?c=");
  });
});
