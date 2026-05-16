import { describe, expect, it } from "vitest";

import type { ZetaCollectionReceiptRecord } from "@/lib/integrations/zeta/contracts/zeta-collection-receipts.contract";
import { resolveZetaCollectionReceiptsHasMore } from "@/lib/integrations/zeta/zeta-collection-receipts-fetch";

const ROW = {
  RegistroId: 1,
  Fecha: "2026-05-10",
  Total: 100,
} as ZetaCollectionReceiptRecord;

describe("zeta-collection-receipts-fetch · paginación", () => {
  it("IsLastPage=false en outer → hasMore true", () => {
    const raw = { QueryComprobantesOut: { IsLastPage: false, Response: [ROW] } };
    expect(resolveZetaCollectionReceiptsHasMore(raw, [ROW])).toBe(true);
  });

  it("IsLastPage=true en outer → hasMore false", () => {
    const raw = { QueryComprobantesOut: { IsLastPage: true, Response: [ROW] } };
    expect(resolveZetaCollectionReceiptsHasMore(raw, [ROW])).toBe(false);
  });

  it("sin IsLastPage en outer ni fila → asume una sola página (riesgo de truncar)", () => {
    const raw = { QueryComprobantesOut: { Response: [ROW, ROW, ROW, ROW, ROW, ROW] } };
    const warnings: string[] = [];
    expect(resolveZetaCollectionReceiptsHasMore(raw, Array(6).fill(ROW), warnings)).toBe(false);
    expect(warnings.some((w) => w.includes("IsLastPage"))).toBe(true);
  });

  it("IsLastPage en última fila → respeta fila", () => {
    const rows = [{ ...ROW, IsLastPage: false }, { ...ROW, IsLastPage: true }] as ZetaCollectionReceiptRecord[];
    const raw = { QueryComprobantesOut: { Response: rows } };
    expect(resolveZetaCollectionReceiptsHasMore(raw, rows)).toBe(false);
  });
});
