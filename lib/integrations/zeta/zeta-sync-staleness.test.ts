import { describe, expect, it } from "vitest";

import {
  stalenessFromHoursForResourceFlow,
  resolveSyncResourceStalenessHours,
} from "@/lib/integrations/zeta/zeta-sync-staleness";

describe("zeta-sync-staleness", () => {
  it("collection receipts uses 12h warning threshold (Tier A, cada 3h)", () => {
    const cfg = resolveSyncResourceStalenessHours("zeta_collection_receipts_v1");
    expect(cfg.warningHours).toBe(12);
    expect(cfg.criticalHours).toBe(24);
    expect(stalenessFromHoursForResourceFlow(11, "zeta_collection_receipts_v1")).toBe("ok");
    expect(stalenessFromHoursForResourceFlow(13, "zeta_collection_receipts_v1")).toBe("warning");
    expect(stalenessFromHoursForResourceFlow(25, "zeta_collection_receipts_v1")).toBe("critical");
  });

  it("unknown flows use default 24/72", () => {
    expect(stalenessFromHoursForResourceFlow(25, "zeta_commercial_client_v1")).toBe("warning");
    expect(stalenessFromHoursForResourceFlow(80, "zeta_commercial_client_v1")).toBe("critical");
  });
});
