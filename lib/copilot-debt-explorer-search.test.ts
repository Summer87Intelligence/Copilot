import { describe, expect, it } from "vitest";

import type { ClientStaleness } from "@/lib/copilot-financial-reconciliation";
import {
  buildClientDebtExplorerHaystack,
  clientMatchesDebtExplorerSearch,
} from "@/lib/copilot-debt-explorer-search";
import { normalizeSearchText } from "@/lib/copilot-search-normalize";

function client(partial: Partial<ClientStaleness> & Pick<ClientStaleness, "companyId">): ClientStaleness {
  return {
    companyName: null,
    zetaClientName: null,
    lastInvoiceUpdatedAt: null,
    ageHours: null,
    status: "ok",
    invoiceCount: 1,
    pendingByCurrency: { UYU: 100 },
    dominantAgingRange: null,
    ...partial,
  };
}

describe("normalizeSearchText", () => {
  it("lowercases, trims, collapses spaces and strips accents", () => {
    expect(normalizeSearchText("  El   País  ")).toBe("el pais");
    expect(normalizeSearchText("ACQ")).toBe("acq");
  });
});

describe("clientMatchesDebtExplorerSearch", () => {
  it("matches partial term case-insensitively on companyName", () => {
    const row = client({
      companyId: "uuid-1",
      companyName: "ACQUAGARDEN S.A.",
    });
    expect(clientMatchesDebtExplorerSearch(row, "acq")).toBe(true);
    expect(clientMatchesDebtExplorerSearch(row, "garden")).toBe(true);
  });

  it("matches on companyId when companyName is null (UI shows id)", () => {
    const row = client({
      companyId: "acq-imports-uy",
      companyName: null,
    });
    expect(buildClientDebtExplorerHaystack(row)).toContain("acq-imports-uy");
    expect(clientMatchesDebtExplorerSearch(row, "acq")).toBe(true);
  });

  it("matches zeta client name when proto name is missing", () => {
    const row = client({
      companyId: "z-99",
      companyName: null,
      zetaClientName: "ACQUA DISTRIBUIDORA",
    });
    expect(clientMatchesDebtExplorerSearch(row, "acqua")).toBe(true);
  });

  it("matches El País without accent in search", () => {
    const row = client({
      companyId: "elpais",
      companyName: "El País",
    });
    expect(clientMatchesDebtExplorerSearch(row, "pais")).toBe(true);
    expect(clientMatchesDebtExplorerSearch(row, "el p")).toBe(true);
  });

  it("returns all rows when search is empty", () => {
    const row = client({ companyId: "x", companyName: "Foo" });
    expect(clientMatchesDebtExplorerSearch(row, "")).toBe(true);
    expect(clientMatchesDebtExplorerSearch(row, "   ")).toBe(true);
  });
});
