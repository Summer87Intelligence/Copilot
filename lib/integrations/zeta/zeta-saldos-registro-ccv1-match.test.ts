import { describe, expect, it } from "vitest";
import {
  extractRegistroIdsFromInvoiceZetaMetadata,
  invoiceZetaMetadataRegistroConsistentWithExpected,
} from "@/lib/integrations/zeta/zeta-proto-invoice-registro-match";
import { mapSaldoRowsToZetaInvoicesBestEffort } from "@/lib/integrations/zeta/zeta-factura-cliente";
import { mergeRegistroIdIntoInvoiceZetaMetadata } from "@/lib/integrations/zeta/zeta-invoice-registro-metadata-merge";

const COMPANY_ID = "facc4033-d2ff-4ea2-8f87-1c86990c5555";

/** Fila real observada en QuerySaldosPendientes (El País A-2877). */
const SALDO_ROW_A2877 = {
  ClienteCodigo: "36",
  Serie: "A",
  Numero: "2877",
  RegistroId: "2574",
  Saldo: "17080.00",
  Total: "41480.00",
  Fecha: "2026-04-17",
  MonedaNombre: "Pesos",
};

describe("saldos RegistroId ↔ CCV1 matching (A-2877)", () => {
  it("mapper produce outstandingAmount=Saldo y ccv1 estable", () => {
    const [inv] = mapSaldoRowsToZetaInvoicesBestEffort(COMPANY_ID, [SALDO_ROW_A2877]);
    expect(inv.outstandingAmount).toBe(17080);
    expect(inv.totalAmount).toBe(41480);
    expect(inv.ccv1InvoiceNumber).toBe("ZETA:CCV1:0:36:A:2877");
    expect(inv.zetaId).toBe("2574");
  });

  it("con metadata backfill, extractRegistroIds y consistencia CCV1", () => {
    const meta = mergeRegistroIdIntoInvoiceZetaMetadata(
      { zeta_customer_voucher_v1: { serie: "A", numero: "2877" } },
      "2574"
    );
    expect(extractRegistroIdsFromInvoiceZetaMetadata(meta)).toContain("2574");
    expect(invoiceZetaMetadataRegistroConsistentWithExpected(meta, "2574")).toBe(true);
  });

  it("sin registro en metadata, consistencia permite CCV1; con conflicto bloquea", () => {
    expect(invoiceZetaMetadataRegistroConsistentWithExpected({}, "2574")).toBe(true);
    const bad = mergeRegistroIdIntoInvoiceZetaMetadata({}, "9999");
    expect(invoiceZetaMetadataRegistroConsistentWithExpected(bad, "2574")).toBe(false);
  });
});
