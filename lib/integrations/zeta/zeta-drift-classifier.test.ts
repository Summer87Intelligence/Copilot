/**
 * Tests for zeta-drift-classifier — focused on the historical_legacy_untraceable
 * classification and its interaction with other DriftClass variants.
 */

import { describe, expect, it } from "vitest";
import { classifyOrphanInvoice } from "@/lib/integrations/zeta/zeta-drift-classifier";

const BASE_RECORD = { id: "rec-1", invoice_number: "ZETA:CCV1:001:042:A:00099" };

describe("classifyOrphanInvoice — historical_legacy_untraceable", () => {
  it("classifies ZETA:CCV1: with null metadata as historical_legacy_untraceable", () => {
    const result = classifyOrphanInvoice({ ...BASE_RECORD, zeta_metadata: null });
    expect(result.drift_class).toBe("historical_legacy_untraceable");
    expect(result.confidence).toBe("high");
    expect(result.auto_deactivate_eligible).toBe(false);
  });

  it("classifies ZETA:CCV1: with empty metadata as historical_legacy_untraceable", () => {
    const result = classifyOrphanInvoice({ ...BASE_RECORD, zeta_metadata: {} });
    expect(result.drift_class).toBe("historical_legacy_untraceable");
  });

  it("classifies ZETA:CCV1: with metadata but missing zeta_registro_id as historical_legacy_untraceable", () => {
    const result = classifyOrphanInvoice({
      ...BASE_RECORD,
      zeta_metadata: {
        zeta_customer_voucher_v1: { cfe_tipo: 111, cfe_estado: "A" }, // no zeta_registro_id
      },
    });
    expect(result.drift_class).toBe("historical_legacy_untraceable");
  });

  it("does NOT classify as historical_legacy_untraceable when zeta_registro_id is present", () => {
    const result = classifyOrphanInvoice({
      ...BASE_RECORD,
      zeta_metadata: {
        zeta_customer_voucher_v1: { zeta_registro_id: "8841203", cfe_tipo: 111 },
      },
    });
    expect(result.drift_class).not.toBe("historical_legacy_untraceable");
  });

  it("does NOT classify as historical_legacy_untraceable for non-CCV1 invoice_number", () => {
    const result = classifyOrphanInvoice({
      ...BASE_RECORD,
      invoice_number: "ZETA:OTHER:001:042:A:00099",
      zeta_metadata: null,
    });
    expect(result.drift_class).not.toBe("historical_legacy_untraceable");
  });

  it("falls through to stale_local_record for non-CCV1 with no metadata", () => {
    const result = classifyOrphanInvoice({
      ...BASE_RECORD,
      invoice_number: "ZETA:OTHER:001:042:A:00099",
      zeta_metadata: null,
    });
    expect(result.drift_class).toBe("stale_local_record");
  });

  it("detects registro_id via zeta_comprobante_identity_v1 path", () => {
    const result = classifyOrphanInvoice({
      ...BASE_RECORD,
      zeta_metadata: {
        zeta_comprobante_identity_v1: { registro_id: "9912345" },
      },
    });
    // Has registro_id via fallback path → NOT legacy untraceable
    expect(result.drift_class).not.toBe("historical_legacy_untraceable");
  });
});

describe("classifyOrphanInvoice — existing classes unaffected", () => {
  it("classifies archived Zeta status as archived_in_zeta", () => {
    const result = classifyOrphanInvoice({
      id: "rec-2",
      invoice_number: "ZETA:OTHER:001:042:A:00100",
      zeta_metadata: {
        zeta_customer_voucher_v1: { zeta_registro_id: "7001", cfe_tipo: 111 },
        Estado: "Anulado",
      },
    });
    expect(result.drift_class).toBe("archived_in_zeta");
    expect(result.confidence).toBe("high");
  });

  it("classifies non-DGI CFETipo as cfe_type_not_dgi", () => {
    const result = classifyOrphanInvoice({
      id: "rec-3",
      invoice_number: "ZETA:OTHER:001:042:A:00101",
      zeta_metadata: {
        zeta_customer_voucher_v1: { zeta_registro_id: "7002" },
        CFETipo: 0,
      },
    });
    expect(result.drift_class).toBe("cfe_type_not_dgi");
  });
});
