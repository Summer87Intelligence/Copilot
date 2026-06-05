import { describe, expect, it } from "vitest";

import {
  buildZetaComprobanteIdentityV1,
  buildZetaLegacyRegistroInvoiceNumber,
  extractRegistroIdsFromInvoiceZetaMetadata,
  invoiceZetaMetadataRegistroConsistentWithExpected,
  parseZetaLegacyRegistroIdFromInvoiceNumber,
  ZETA_METADATA_COMPROBANTE_IDENTITY_V1,
} from "@/lib/integrations/zeta/zeta-proto-invoice-registro-match";

describe("zeta-proto-invoice-registro-match", () => {
  it("buildZetaComprobanteIdentityV1 normaliza vacío a null", () => {
    expect(buildZetaComprobanteIdentityV1(null)).toEqual({ schema_version: 1, registro_id: null });
    expect(buildZetaComprobanteIdentityV1("  99  ")).toEqual({ schema_version: 1, registro_id: "99" });
  });

  it("buildZetaLegacyRegistroInvoiceNumber y parse inverso", () => {
    expect(buildZetaLegacyRegistroInvoiceNumber("2748")).toBe("ZETA:2748");
    expect(parseZetaLegacyRegistroIdFromInvoiceNumber("ZETA:2748")).toBe("2748");
    expect(parseZetaLegacyRegistroIdFromInvoiceNumber("ZETA:CCV1:0:33:A:2944")).toBeNull();
  });

  it("extractRegistroIdsFromInvoiceZetaMetadata deduplica y lee los tres bloques", () => {
    const zm = {
      [ZETA_METADATA_COMPROBANTE_IDENTITY_V1]: { registro_id: "182" },
      zeta_customer_voucher_v1: {
        zeta_registro_id: "182",
        raw_payload: { RegistroId: "182" },
      },
    };
    expect(extractRegistroIdsFromInvoiceZetaMetadata(zm)).toEqual(["182"]);
  });

  it("invoiceZetaMetadataRegistroConsistentWithExpected: sin ids en metadata → permite CCV1", () => {
    expect(invoiceZetaMetadataRegistroConsistentWithExpected({}, "182")).toBe(true);
  });

  it("invoiceZetaMetadataRegistroConsistentWithExpected: coincide → true", () => {
    const zm = { [ZETA_METADATA_COMPROBANTE_IDENTITY_V1]: { registro_id: "188" } };
    expect(invoiceZetaMetadataRegistroConsistentWithExpected(zm, "188")).toBe(true);
  });

  it("invoiceZetaMetadataRegistroConsistentWithExpected: conflicto → false", () => {
    const zm = {
      zeta_customer_voucher_v1: { zeta_registro_id: "999" },
    };
    expect(invoiceZetaMetadataRegistroConsistentWithExpected(zm, "182")).toBe(false);
  });
});
