import { describe, expect, it, vi } from "vitest";

import {
  extractZetaCollectionReceipts,
  isZetaCollectionReceiptsQueryResponse,
  readIsLastPageFromReceiptRows,
} from "@/lib/integrations/zeta/contracts/zeta-collection-receipts.contract";

vi.mock("@/lib/integrations/zeta/zeta-logger", () => ({
  logZetaError: vi.fn(),
}));

const SAMPLE = {
  QueryOut: {
    Success: true,
    IsLastPage: false,
    Response: [
      {
        RegistroId: 9001,
        ClienteCodigo: "C0001",
        Fecha: "2026-03-15",
        Total: 1500,
        TotalSigno: 1,
        Emitido: "S",
        Serie: "RC",
        Numero: 12,
        IsLastPage: false,
      },
    ],
  },
};

describe("zeta-collection-receipts.contract", () => {
  it("QueryOut.Response con RegistroId", () => {
    expect(isZetaCollectionReceiptsQueryResponse(SAMPLE)).toBe(true);
    const rows = extractZetaCollectionReceipts(SAMPLE);
    expect(rows).toHaveLength(1);
    expect(String(rows[0]?.RegistroId)).toBe("9001");
  });

  it("array raíz documentado", () => {
    const root = [{ RegistroId: "r1", ClienteCodigo: "X" }];
    expect(isZetaCollectionReceiptsQueryResponse(root)).toBe(true);
    expect(extractZetaCollectionReceipts(root)).toHaveLength(1);
  });

  it("rechaza filas sin RegistroId", () => {
    const bad = { QueryOut: { Response: [{ ClienteCodigo: "A" }] } };
    expect(isZetaCollectionReceiptsQueryResponse(bad)).toBe(true);
    expect(extractZetaCollectionReceipts(bad)).toHaveLength(0);
  });

  it("readIsLastPageFromReceiptRows lee la última fila", () => {
    const rows = extractZetaCollectionReceipts(SAMPLE);
    expect(readIsLastPageFromReceiptRows(rows)).toBe(false);
  });
});
