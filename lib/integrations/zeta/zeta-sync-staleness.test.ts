import { describe, expect, it } from "vitest";

import {
  stalenessFromHoursForResourceFlow,
  resolveSyncResourceStalenessHours,
} from "@/lib/integrations/zeta/zeta-sync-staleness";

describe("zeta-sync-staleness", () => {
  it("collection receipts uses 30h warning threshold", () => {
    const cfg = resolveSyncResourceStalenessHours("zeta_collection_receipts_v1");
    expect(cfg.warningHours).toBe(30);
    expect(stalenessFromHoursForResourceFlow(29, "zeta_collection_receipts_v1")).toBe("ok");
    expect(stalenessFromHoursForResourceFlow(31, "zeta_collection_receipts_v1")).toBe("warning");
  });

  it("unknown flows use default 24/72", () => {
    expect(stalenessFromHoursForResourceFlow(25, "zeta_commercial_client_v1")).toBe("warning");
    expect(stalenessFromHoursForResourceFlow(80, "zeta_commercial_client_v1")).toBe("critical");
  });
});
