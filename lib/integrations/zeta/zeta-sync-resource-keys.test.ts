import { describe, expect, it } from "vitest";

import {
  getZetaPipelineDisplayLabel,
  getZetaSyncResourceFlowLabel,
  mergeZetaSyncStateRows,
  normalizeZetaSyncResourceFlow,
  ZETA_VENDOR_PAYMENTS_RESOURCE_FLOW,
} from "@/lib/integrations/zeta/zeta-sync-resource-keys";

describe("zeta-sync-resource-keys", () => {
  it("normaliza alias legacy vendor payments al nombre canónico", () => {
    expect(normalizeZetaSyncResourceFlow("zeta_vendor_payments_v1")).toBe(
      ZETA_VENDOR_PAYMENTS_RESOURCE_FLOW
    );
    expect(normalizeZetaSyncResourceFlow("zeta-sync-vendor-payments")).toBe(
      ZETA_VENDOR_PAYMENTS_RESOURCE_FLOW
    );
  });

  it("no altera otros resource flows", () => {
    expect(normalizeZetaSyncResourceFlow("zeta_customer_vouchers_v1")).toBe(
      "zeta_customer_vouchers_v1"
    );
  });

  it("merge conserva mejor last_success_at y bootstrap OR", () => {
    const merged = mergeZetaSyncStateRows([
      {
        resource_flow: "zeta_vendor_payments_v1",
        last_success_at: "2026-05-10T10:00:00.000Z",
        bootstrap_completed: false,
      },
      {
        resource_flow: "zeta-sync-vendor-payments",
        last_success_at: "2026-05-12T15:00:00.000Z",
        bootstrap_completed: true,
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.resource_flow).toBe(ZETA_VENDOR_PAYMENTS_RESOURCE_FLOW);
    expect(merged[0]?.last_success_at).toBe("2026-05-12T15:00:00.000Z");
    expect(merged[0]?.bootstrap_completed).toBe(true);
  });

  it("resuelve labels UI para pipeline y sync state canónicos", () => {
    expect(getZetaPipelineDisplayLabel("zeta-sync-vendor-payments")).toBe(
      "Pagos proveedores"
    );
    expect(getZetaSyncResourceFlowLabel("zeta-sync-vendor-payments")).toBe(
      "Pagos a proveedores"
    );
    expect(getZetaSyncResourceFlowLabel("zeta_vendor_payments_v1")).toBe(
      "Pagos a proveedores"
    );
  });
});
