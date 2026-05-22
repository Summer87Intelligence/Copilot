import { describe, expect, it } from "vitest";
import { invoiceZetaMetadataRegistroConsistentWithExpected } from "@/lib/integrations/zeta/zeta-proto-invoice-registro-match";
import {
  isZetaLegacyShadowInvoiceNumber,
  isZetaSaldosMatchWatchInvoice,
  mergeRegistroIdIntoInvoiceZetaMetadata,
  ZETA_SALDOS_MATCH_WATCH,
} from "@/lib/integrations/zeta/zeta-invoice-registro-metadata-merge";

describe("mergeRegistroIdIntoInvoiceZetaMetadata", () => {
  it("setea identity v1 y zeta_registro_id en voucher v1 sin borrar reconciliation", () => {
    const merged = mergeRegistroIdIntoInvoiceZetaMetadata(
      {
        zeta_reconciliation: { pending_sync_missing_count: 0 },
        zeta_customer_voucher_v1: { serie: "A", numero: "2877", schema_version: 1 },
        zeta_comprobante_identity_v1: { schema_version: 1, registro_id: null },
      },
      "2574",
      { backfill_source: "backfill-ccv1-registro-metadata" }
    );

    expect(merged.zeta_reconciliation).toEqual({ pending_sync_missing_count: 0 });
    expect(merged.zeta_comprobante_identity_v1).toEqual({
      schema_version: 1,
      registro_id: "2574",
    });
    const v1 = merged.zeta_customer_voucher_v1 as Record<string, unknown>;
    expect(v1.zeta_registro_id).toBe("2574");
    expect(v1.numero).toBe("2877");
    expect(v1.registro_id_backfill).toMatchObject({
      source: "backfill-ccv1-registro-metadata",
      registro_id: "2574",
    });
  });

  it("tras merge, consistencia RegistroId vs fila saldos", () => {
    const merged = mergeRegistroIdIntoInvoiceZetaMetadata({}, "2574");
    expect(invoiceZetaMetadataRegistroConsistentWithExpected(merged, "2574")).toBe(true);
    expect(invoiceZetaMetadataRegistroConsistentWithExpected(merged, "9999")).toBe(false);
  });
});

describe("watch helpers", () => {
  it("detecta factura canónica y legacy shadow", () => {
    expect(isZetaSaldosMatchWatchInvoice(ZETA_SALDOS_MATCH_WATCH.canonicalCcv1)).toBe(true);
    expect(isZetaSaldosMatchWatchInvoice(ZETA_SALDOS_MATCH_WATCH.legacyShadow)).toBe(true);
    expect(isZetaSaldosMatchWatchInvoice("ZETA:CCV1:0:2:A:2926")).toBe(false);
    expect(isZetaLegacyShadowInvoiceNumber("ZETA:2574")).toBe(true);
    expect(isZetaLegacyShadowInvoiceNumber("ZETA:CCV1:0:36:A:2877")).toBe(false);
    expect(isZetaLegacyShadowInvoiceNumber("ZETA:9999")).toBe(true);
  });
});
