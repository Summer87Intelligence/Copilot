import { describe, it, expect } from "vitest";

import {
  buildSellerOptions,
  hasAnySellerAssigned,
  findUnassignedSellerRow,
  patchRowsByDocumentId,
} from "@/lib/sales/seller-ux-helpers";

describe("buildSellerOptions", () => {
  it("no incluye 'Sin asignar' (esa opción vive aparte, siempre primero en la UI)", () => {
    const opts = buildSellerOptions(null, null, [{ id: "d", displayName: "Daniel" }]);
    expect(opts.some((o) => o.id === "")).toBe(false);
  });

  it("preserva el orden de personas activas tal cual llega (alfabético desde el repositorio)", () => {
    const active = [
      { id: "c", displayName: "Camila" },
      { id: "d", displayName: "Daniel" },
      { id: "j", displayName: "Juanma" },
    ];
    const opts = buildSellerOptions(null, null, active);
    expect(opts.map((o) => o.displayName)).toEqual(["Camila", "Daniel", "Juanma"]);
    expect(opts.every((o) => !o.disabled)).toBe(true);
  });

  it("vendedor actual inactivo: aparece como histórico deshabilitado, no se puede volver a elegir", () => {
    const active = [{ id: "c", displayName: "Camila" }]; // Daniel ya no está activo
    const opts = buildSellerOptions("d-inactivo", "Daniel", active);
    const inactiveEntry = opts.find((o) => o.id === "d-inactivo");
    expect(inactiveEntry).toBeDefined();
    expect(inactiveEntry?.disabled).toBe(true);
    expect(inactiveEntry?.displayName).toContain("Daniel");
    expect(inactiveEntry?.displayName).toContain("inactivo");
    // Sigue estando Camila, seleccionable.
    expect(opts.find((o) => o.id === "c")?.disabled).toBeFalsy();
  });

  it("vendedor actual SIN nombre conocido (edge case) usa fallback legible", () => {
    const opts = buildSellerOptions("ghost", null, []);
    expect(opts[0]?.displayName).toContain("Vendedor inactivo");
  });

  it("vendedor actual activo: no se duplica como entrada histórica", () => {
    const active = [{ id: "d", displayName: "Daniel" }];
    const opts = buildSellerOptions("d", "Daniel", active);
    expect(opts).toHaveLength(1);
    expect(opts[0]).toEqual({ id: "d", displayName: "Daniel" });
  });

  it("sin vendedor actual (null): solo lista a los activos, sin entrada histórica", () => {
    const active = [{ id: "d", displayName: "Daniel" }];
    const opts = buildSellerOptions(null, null, active);
    expect(opts).toEqual([{ id: "d", displayName: "Daniel" }]);
  });
});

describe("hasAnySellerAssigned", () => {
  it("false cuando todas las filas son 'Sin vendedor identificado' o sin operaciones", () => {
    expect(hasAnySellerAssigned([{ sellerId: null, invoiceCount: 62 }])).toBe(false);
    expect(hasAnySellerAssigned([{ sellerId: "d", invoiceCount: 0 }])).toBe(false);
  });

  it("true cuando existe al menos un vendedor real con operaciones", () => {
    expect(
      hasAnySellerAssigned([
        { sellerId: null, invoiceCount: 62 },
        { sellerId: "d", invoiceCount: 1 },
      ])
    ).toBe(true);
  });
});

describe("findUnassignedSellerRow", () => {
  it("encuentra la fila 'Sin vendedor identificado' (sellerId=null)", () => {
    const rows = [{ sellerId: "d" as string | null }, { sellerId: null }];
    expect(findUnassignedSellerRow(rows)?.sellerId).toBeNull();
  });

  it("undefined si no existe (caso teórico, la agregación siempre la incluye)", () => {
    const rows = [{ sellerId: "d" as string | null }];
    expect(findUnassignedSellerRow(rows)).toBeUndefined();
  });
});

// ── FASE SALES-DOCUMENT-SELLER-INLINE-UX-AND-IDENTITY-FIX-001 ──────────────
// Reproduce exactamente el escenario reportado: dos facturas visualmente
// similares (mismo número visible / mismo cliente / mismo importe) que deben
// tratarse como operaciones independientes porque tienen document_id (UUID)
// distinto.
type Row = {
  documentId: string;
  documentNumber: string | null;
  customerId: string;
  lineAmount: number;
  lineId: string;
  sellerId: string | null;
  sellerName: string | null;
};

function row(p: Partial<Row> & Pick<Row, "documentId" | "lineId">): Row {
  return {
    documentNumber: "A-3044",
    customerId: "cust-1",
    lineAmount: 100,
    sellerId: null,
    sellerName: null,
    ...p,
  };
}

describe("patchRowsByDocumentId — identidad exclusiva por document_id", () => {
  it("dos facturas con el MISMO número visible pero UUID distinto: asignar una no toca la otra", () => {
    const rows: Row[] = [
      row({ documentId: "11111111-1111-1111-1111-111111111111", lineId: "doc-A:0" }),
      row({ documentId: "22222222-2222-2222-2222-222222222222", lineId: "doc-B:0" }),
    ];
    const next = patchRowsByDocumentId(rows, "11111111-1111-1111-1111-111111111111", "daniel", "Daniel");
    expect(next.find((r) => r.documentId === "11111111-1111-1111-1111-111111111111")?.sellerId).toBe("daniel");
    expect(next.find((r) => r.documentId === "22222222-2222-2222-2222-222222222222")?.sellerId).toBeNull();
  });

  it("dos series distintas con el mismo número no colisionan (identidad es solo document_id)", () => {
    const rows: Row[] = [
      row({ documentId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", lineId: "a:0", documentNumber: "A-100" }),
      row({ documentId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", lineId: "b:0", documentNumber: "B-100" }),
    ];
    const next = patchRowsByDocumentId(rows, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "camila", "Camila");
    expect(next[0]?.sellerId).toBeNull();
    expect(next[1]?.sellerId).toBe("camila");
  });

  it("una factura con varias líneas: TODAS se actualizan juntas (comparten legítimamente el documento)", () => {
    const DOC = "33333333-3333-3333-3333-333333333333";
    const rows: Row[] = [
      row({ documentId: DOC, lineId: `${DOC}:0` }),
      row({ documentId: DOC, lineId: `${DOC}:1` }),
      row({ documentId: DOC, lineId: `${DOC}:2` }),
      row({ documentId: "other-doc", lineId: "other:0" }),
    ];
    const next = patchRowsByDocumentId(rows, DOC, "daniel", "Daniel");
    expect(next.filter((r) => r.documentId === DOC).every((r) => r.sellerId === "daniel")).toBe(true);
    expect(next.find((r) => r.documentId === "other-doc")?.sellerId).toBeNull();
  });

  it("no modifica ningún otro campo de la fila (importe, cliente, número, línea intactos)", () => {
    const DOC = "44444444-4444-4444-4444-444444444444";
    const rows: Row[] = [row({ documentId: DOC, lineId: `${DOC}:0`, lineAmount: 12345.6, customerId: "cust-X" })];
    const next = patchRowsByDocumentId(rows, DOC, "camila", "Camila");
    expect(next[0]).toMatchObject({ lineAmount: 12345.6, customerId: "cust-X", documentId: DOC });
  });

  it("filas no relacionadas conservan referencia (sin re-render innecesario)", () => {
    const untouched = row({ documentId: "keep-me", lineId: "k:0" });
    const rows: Row[] = [row({ documentId: "target", lineId: "t:0" }), untouched];
    const next = patchRowsByDocumentId(rows, "target", "daniel", "Daniel");
    expect(next[1]).toBe(untouched); // misma referencia: React no re-renderiza esta fila
  });

  it("desasignar (sellerId=null) también se aplica solo al documento correcto", () => {
    const rows: Row[] = [
      row({ documentId: "doc-1", lineId: "1:0", sellerId: "daniel", sellerName: "Daniel" }),
      row({ documentId: "doc-2", lineId: "2:0", sellerId: "daniel", sellerName: "Daniel" }),
    ];
    const next = patchRowsByDocumentId(rows, "doc-1", null, null);
    expect(next.find((r) => r.documentId === "doc-1")?.sellerId).toBeNull();
    expect(next.find((r) => r.documentId === "doc-2")?.sellerId).toBe("daniel");
  });
});
