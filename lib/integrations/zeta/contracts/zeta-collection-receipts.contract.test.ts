import { describe, expect, it, vi } from "vitest";

import {
  extractZetaCollectionReceipts,
  isZetaCollectionReceiptsQueryResponse,
  readIsLastPageFromReceiptRows,
  readZetaCollectionReceiptsQueryOutFlags,
  summarizeZetaCollectionReceiptsResponseShape,
} from "@/lib/integrations/zeta/contracts/zeta-collection-receipts.contract";

vi.mock("@/lib/integrations/zeta/zeta-logger", () => ({
  logZetaError: vi.fn(),
}));

const ROW = {
  RegistroId: 9001,
  ClienteCodigo: "C0001",
  Fecha: "2026-03-15",
  Total: 1500,
  TotalSigno: 1,
  Emitido: "S",
  Serie: "RC",
  Numero: 12,
  IsLastPage: false,
};

describe("zeta-collection-receipts.contract", () => {
  describe("shape: QueryComprobantesOut.Response[] (Postman oficial / DIV-002)", () => {
    const SAMPLE = {
      QueryComprobantesOut: {
        Succeed: true,
        IsLastPage: true,
        Response: [{ ...ROW, IsLastPage: true }],
      },
    };

    it("acepta y extrae filas", () => {
      expect(isZetaCollectionReceiptsQueryResponse(SAMPLE)).toBe(true);
      const rows = extractZetaCollectionReceipts(SAMPLE);
      expect(rows).toHaveLength(1);
      expect(String(rows[0]?.RegistroId)).toBe("9001");
    });

    it("lee IsLastPage desde QueryComprobantesOut", () => {
      expect(readZetaCollectionReceiptsQueryOutFlags(SAMPLE).isLastPage).toBe(true);
    });

    it("summarize detecta path real `QueryComprobantesOut.Response`", () => {
      const s = summarizeZetaCollectionReceiptsResponseShape(SAMPLE);
      expect(s.outer_key_detected).toBe("QueryComprobantesOut");
      expect(s.array_path_detected).toBe("QueryComprobantesOut.Response");
      expect(s.rows_detected).toBe(1);
      expect(s.has_registro_id_first_item).toBe(true);
      expect(s.first_item_keys).toContain("RegistroId");
      expect(s.array_paths_detected.some((p) => p.startsWith("QueryComprobantesOut.Response"))).toBe(true);
    });
  });

  describe("shape legacy: QueryOut.Response[]", () => {
    const SAMPLE = {
      QueryOut: {
        Success: true,
        IsLastPage: false,
        Response: [ROW],
      },
    };

    it("se mantiene compatible", () => {
      expect(isZetaCollectionReceiptsQueryResponse(SAMPLE)).toBe(true);
      expect(extractZetaCollectionReceipts(SAMPLE)).toHaveLength(1);
      expect(readZetaCollectionReceiptsQueryOutFlags(SAMPLE)).toEqual({
        isLastPage: false,
        total: undefined,
      });
    });

    it("readIsLastPageFromReceiptRows lee la última fila", () => {
      const rows = extractZetaCollectionReceipts(SAMPLE);
      expect(readIsLastPageFromReceiptRows(rows)).toBe(false);
    });

    it("summarize identifica `QueryOut`", () => {
      const s = summarizeZetaCollectionReceiptsResponseShape(SAMPLE);
      expect(s.outer_key_detected).toBe("QueryOut");
      expect(s.array_path_detected).toBe("QueryOut.Response");
    });
  });

  describe("shape: array raíz documentado", () => {
    const ROOT = [{ RegistroId: "r1", ClienteCodigo: "X" }];

    it("acepta array raíz como list de recibos", () => {
      expect(isZetaCollectionReceiptsQueryResponse(ROOT)).toBe(true);
      expect(extractZetaCollectionReceipts(ROOT)).toHaveLength(1);
    });

    it("summarize marca path `<root-array>`", () => {
      const s = summarizeZetaCollectionReceiptsResponseShape(ROOT);
      expect(s.is_array_root).toBe(true);
      expect(s.array_path_detected).toBe("<root-array>");
    });
  });

  describe("fallback: outer con array bajo otra clave", () => {
    it("encuentra array bajo `QueryComprobantesOut.Recibos`", () => {
      const SAMPLE = {
        QueryComprobantesOut: {
          Recibos: [ROW],
          IsLastPage: true,
        },
      };
      const rows = extractZetaCollectionReceipts(SAMPLE);
      expect(rows).toHaveLength(1);
      const s = summarizeZetaCollectionReceiptsResponseShape(SAMPLE);
      expect(s.array_path_detected).toBe("QueryComprobantesOut.Recibos");
    });

    it("encuentra array bajo `QueryComprobantesOut.Items`", () => {
      const SAMPLE = { QueryComprobantesOut: { Items: [ROW] } };
      expect(extractZetaCollectionReceipts(SAMPLE)).toHaveLength(1);
    });

    it("encuentra array bajo `QueryComprobantesOut.Data`", () => {
      const SAMPLE = { QueryComprobantesOut: { Data: [ROW] } };
      expect(extractZetaCollectionReceipts(SAMPLE)).toHaveLength(1);
    });
  });

  describe("rechazos defensivos", () => {
    it("filas sin RegistroId → array vacío y log de contrato", () => {
      const bad = { QueryComprobantesOut: { Response: [{ ClienteCodigo: "A" }] } };
      expect(isZetaCollectionReceiptsQueryResponse(bad)).toBe(false);
      expect(extractZetaCollectionReceipts(bad)).toHaveLength(0);
    });

    it("respuesta vacía: shape válido, 0 filas", () => {
      expect(extractZetaCollectionReceipts({ QueryComprobantesOut: { Response: [] } })).toHaveLength(0);
      expect(isZetaCollectionReceiptsQueryResponse({ QueryComprobantesOut: { Response: [] } })).toBe(true);
    });

    it("root primitivo no se reconoce", () => {
      expect(isZetaCollectionReceiptsQueryResponse(null)).toBe(false);
      expect(isZetaCollectionReceiptsQueryResponse("string")).toBe(false);
      expect(isZetaCollectionReceiptsQueryResponse(123)).toBe(false);
      expect(extractZetaCollectionReceipts(null)).toEqual([]);
    });

    it("objeto sin outer reconocible → shape no detectado", () => {
      const s = summarizeZetaCollectionReceiptsResponseShape({ Foo: { Bar: [] } });
      expect(s.outer_key_detected).toBeNull();
      expect(s.array_path_detected).toBeNull();
    });
  });

  describe("summarize contiene las claves diagnósticas requeridas", () => {
    it("incluye top_level_keys, typeof_root, array_paths_detected", () => {
      const s = summarizeZetaCollectionReceiptsResponseShape({
        QueryComprobantesOut: { Response: [ROW] },
      });
      expect(s.typeof_root).toBe("object");
      expect(s.top_level_keys).toEqual(["QueryComprobantesOut"]);
      expect(s.array_paths_detected.length).toBeGreaterThan(0);
      expect(s.first_item_preview).not.toBeNull();
      expect(s.first_item_preview).toMatchObject({ RegistroId: 9001 });
    });
  });
});
