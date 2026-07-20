/**
 * FASE SALES-DOCUMENT-SELLER-CORRECTION-001 — `buildSellerSalesSummary`
 * (vendedor de la operación, distinto de `buildSalespersonSummary` = cartera
 * por ejecutivo). Cubre el escenario obligatorio de la especificación:
 *
 *   Ejecutivo del cliente: Daniel
 *   Factura A: Daniel · Factura B: Camila · Factura C: Daniel
 *   → Ejecutivo: Daniel. Vendedor Daniel: 2 operaciones. Vendedora Camila: 1.
 *     Cartera de Daniel: las 3 operaciones. No se confunden ambas métricas.
 */
import { describe, it, expect } from "vitest";

import { buildCanonicalSaleDocuments, type RawSaleInvoiceRow } from "@/lib/sales/canonical/build-canonical-sales";
import { buildSalespersonSummary, buildSellerSalesSummary } from "@/lib/sales/canonical/sales-aggregations";
import type { CanonicalSaleDocument } from "@/lib/sales/canonical/types";

const WS = "ws-1";
const FROM = "2026-07-01";
const TO = "2026-07-31";

function invoice(opts: {
  id: string;
  date: string;
  total: number;
  cfe?: number;
  cliente?: string;
}): RawSaleInvoiceRow {
  return {
    id: opts.id,
    invoice_number: `ZETA:CCV1:0:${opts.cliente ?? "X"}:A:${opts.id}`,
    company_id: opts.cliente ?? "X",
    issue_date: opts.date,
    currency_code: "UYU",
    total_amount: opts.total,
    paid_amount: 0,
    balance_amount: opts.total,
    status: "issued",
    is_active: true,
    zeta_metadata: {
      zeta_customer_voucher_v1: {
        cfe_tipo: String(opts.cfe ?? 111),
        raw_payload: {
          Serie: "A",
          Numero: opts.id,
          CFETipo: opts.cfe ?? 111,
          MonedaCodigo: "1",
          ClienteCodigo: opts.cliente ?? "X",
          VendedorCodigo: "",
          Lineas: [{ Concepto: "Servicio", Cantidad: "1", Neto: opts.total, IVA: "0", Total: opts.total }],
        },
      },
    },
  };
}

/** Simula la resolución de ejecutivo (data-source): asigna al doc.salespersonId. */
function setExecutive(docs: CanonicalSaleDocument[], id: string, name: string): void {
  for (const d of docs) {
    d.salespersonId = id;
    d.salespersonName = name;
  }
}

/** Simula la asignación MANUAL de vendedor por documento (data-source). */
function setSeller(docs: CanonicalSaleDocument[], documentId: string, id: string | null, name: string | null): void {
  const d = docs.find((x) => x.documentId === documentId);
  if (d) {
    d.sellerId = id;
    d.sellerName = name;
  }
}

describe("buildSellerSalesSummary — escenario obligatorio Daniel/Camila/Daniel", () => {
  it("separa vendedor (por operación) de ejecutivo (cartera) sin confundirlos", () => {
    const docs = buildCanonicalSaleDocuments({
      workspaceId: WS,
      rows: [
        invoice({ id: "A", date: "2026-07-03", total: 1000, cliente: "clienteX" }),
        invoice({ id: "B", date: "2026-07-10", total: 2000, cliente: "clienteX" }),
        invoice({ id: "C", date: "2026-07-20", total: 1500, cliente: "clienteX" }),
      ],
    });

    // Ejecutivo del cliente: Daniel, para las 3 operaciones (cartera).
    setExecutive(docs, "daniel-id", "Daniel");
    // Vendedor real de cada operación: A→Daniel, B→Camila, C→Daniel.
    setSeller(docs, "A", "daniel-id", "Daniel");
    setSeller(docs, "B", "camila-id", "Camila");
    setSeller(docs, "C", "daniel-id", "Daniel");

    const portfolio = buildSalespersonSummary(docs, FROM, TO);
    const sellers = buildSellerSalesSummary(docs, FROM, TO);

    // Cartera del ejecutivo Daniel: las 3 operaciones (nunca por autoría).
    const danielPortfolio = portfolio.find((p) => p.salespersonId === "daniel-id")!;
    expect(danielPortfolio.invoiceCount).toBe(3);

    // Vendedor Daniel: 2 operaciones (A y C). Vendedora Camila: 1 (B).
    const danielSeller = sellers.find((s) => s.sellerId === "daniel-id")!;
    const camilaSeller = sellers.find((s) => s.sellerId === "camila-id")!;
    expect(danielSeller.invoiceCount).toBe(2);
    expect(camilaSeller.invoiceCount).toBe(1);
    expect(danielSeller.netSalesByCurrency.UYU).toBe(2500); // A(1000) + C(1500)
    expect(camilaSeller.netSalesByCurrency.UYU).toBe(2000); // B

    // Ninguna fila "Sin vendedor identificado" con operaciones (todo asignado).
    const unassigned = sellers.find((s) => s.sellerId === null);
    expect(unassigned?.invoiceCount ?? 0).toBe(0);
  });

  it("una operación sin vendedor manual queda 'Sin vendedor identificado' pero sigue en el neto", () => {
    const docs = buildCanonicalSaleDocuments({
      workspaceId: WS,
      rows: [invoice({ id: "D", date: "2026-07-05", total: 900, cliente: "clienteY" })],
    });
    setExecutive(docs, "daniel-id", "Daniel"); // ejecutivo asignado, vendedor NO.

    const sellers = buildSellerSalesSummary(docs, FROM, TO);
    const unassigned = sellers.find((s) => s.sellerId === null)!;
    expect(unassigned.invoiceCount).toBe(1);
    expect(unassigned.netSalesByCurrency.UYU).toBe(900);
    expect(unassigned.sellerName).toBe("Sin vendedor identificado");
  });

  it("nota de crédito sin vendedor identificable reduce 'Sin vendedor identificado', nunca cuenta como operación ni se hereda del ejecutivo", () => {
    const docs = buildCanonicalSaleDocuments({
      workspaceId: WS,
      rows: [
        invoice({ id: "E", date: "2026-07-05", total: 1000, cliente: "clienteZ" }),
        invoice({ id: "E-NC", date: "2026-07-08", total: 300, cfe: 102, cliente: "clienteZ" }),
      ],
    });
    setExecutive(docs, "daniel-id", "Daniel");
    setSeller(docs, "E", "daniel-id", "Daniel");
    // E-NC es nota de crédito: la data-source nunca le asigna sellerId.

    const sellers = buildSellerSalesSummary(docs, FROM, TO);
    const daniel = sellers.find((s) => s.sellerId === "daniel-id")!;
    const unassigned = sellers.find((s) => s.sellerId === null)!;

    // La NC no se atribuye a Daniel (ni por herencia del ejecutivo).
    expect(daniel.invoiceCount).toBe(1);
    expect(daniel.creditNotesByCurrency.UYU).toBe(0);
    expect(daniel.netSalesByCurrency.UYU).toBe(1000);

    // La NC reduce el neto del bucket "Sin vendedor identificado" sin contar como operación.
    expect(unassigned.invoiceCount).toBe(0);
    expect(unassigned.creditNotesByCurrency.UYU).toBe(300);
    expect(unassigned.netSalesByCurrency.UYU).toBe(-300);
  });

  it("comprobante multi-línea (5 líneas, tipo A-3032): 1 sola operación, total atribuido una única vez (nunca multiplicado por cantidad de líneas)", () => {
    const rows: RawSaleInvoiceRow[] = [
      {
        id: "G",
        invoice_number: "ZETA:CCV1:0:clienteG:A:G",
        company_id: "clienteG",
        issue_date: "2026-07-06",
        currency_code: "UYU",
        total_amount: 68320,
        paid_amount: 0,
        balance_amount: 68320,
        status: "issued",
        is_active: true,
        zeta_metadata: {
          zeta_customer_voucher_v1: {
            cfe_tipo: "111",
            raw_payload: {
              Serie: "A",
              Numero: "G",
              CFETipo: 111,
              MonedaCodigo: "1",
              ClienteCodigo: "clienteG",
              VendedorCodigo: "",
              Lineas: [
                { Concepto: "Gestión Redes Sociales", Cantidad: "1", Neto: "8000.00", IVA: "1760.00", Total: "9760.00", ArticuloCodigo: "REDES SOCIALES" },
                { Concepto: "Gestón Publicitaria", Cantidad: "1", Neto: "6000.00", IVA: "1320.00", Total: "7320.00", ArticuloCodigo: "GP" },
                { Concepto: "Automatización Linkedin", Cantidad: "1", Neto: "10000.00", IVA: "2200.00", Total: "12200.00", ArticuloCodigo: "LIN" },
                { Concepto: "HTML para personalizar experiencia en sitio", Cantidad: "1", Neto: "12000.00", IVA: "2640.00", Total: "14640.00", ArticuloCodigo: "HTML" },
                { Concepto: "Simulador IA + Email", Cantidad: "1", Neto: "20000.00", IVA: "4400.00", Total: "24400.00", ArticuloCodigo: "SIMULADOR IA" },
              ],
            },
          },
        },
      },
    ];
    const docs = buildCanonicalSaleDocuments({ workspaceId: WS, rows });
    setSeller(docs, "G", "daniel-id", "Daniel");

    const sellers = buildSellerSalesSummary(docs, FROM, TO);
    const daniel = sellers.find((s) => s.sellerId === "daniel-id")!;

    // Exactamente 1 operación (por documento), nunca 5 (por línea).
    expect(daniel.invoiceCount).toBe(1);
    // El total se atribuye UNA sola vez: $68.320, nunca $341.600 (68320 * 5).
    expect(daniel.netSalesByCurrency.UYU).toBe(68320);
    expect(daniel.netSalesByCurrency.UYU).not.toBe(68320 * 5);
  });

  it("reasignar el ejecutivo del cliente no cambia el vendedor de sus operaciones", () => {
    const docs = buildCanonicalSaleDocuments({
      workspaceId: WS,
      rows: [invoice({ id: "F", date: "2026-07-12", total: 500, cliente: "clienteW" })],
    });
    setSeller(docs, "F", "camila-id", "Camila");
    setExecutive(docs, "daniel-id", "Daniel"); // ejecutivo asignado DESPUÉS

    const sellers = buildSellerSalesSummary(docs, FROM, TO);
    const camila = sellers.find((s) => s.sellerId === "camila-id")!;
    expect(camila.invoiceCount).toBe(1);
    expect(docs[0]!.salespersonId).toBe("daniel-id"); // ejecutivo cambiado
    expect(docs[0]!.sellerId).toBe("camila-id"); // vendedor intacto
  });
});
