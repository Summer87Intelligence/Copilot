import { describe, expect, it } from "vitest";

import {
  resolveOperationalAlertBootstrapFromProvenance,
  type CopilotActionProvenanceQuery,
} from "@/lib/copilot-alert-ops-mapper";

function provenance(
  partial: Partial<CopilotActionProvenanceQuery> & Pick<CopilotActionProvenanceQuery, "source">
): CopilotActionProvenanceQuery {
  return {
    alertId: null,
    priority: null,
    alertType: null,
    obligationId: null,
    alertTitle: null,
    insightId: null,
    operationalActionId: null,
    ...partial,
  };
}

describe("resolveOperationalAlertBootstrapFromProvenance", () => {
  it("devuelve null si faltan campos mínimos", () => {
    expect(
      resolveOperationalAlertBootstrapFromProvenance(
        provenance({
          source: "alert",
          alertTitle: "Caja negativa",
          priority: "critical",
        })
      )
    ).toBeNull();
    expect(
      resolveOperationalAlertBootstrapFromProvenance(
        provenance({
          source: "alert",
          alertTitle: "Caja negativa",
          alertType: "liquidez",
        })
      )
    ).toBeNull();
  });

  it("deriva título cuando falta alertTitle", () => {
    const payload = resolveOperationalAlertBootstrapFromProvenance(
      provenance({
        source: "alert",
        priority: "critical",
        alertType: "liquidez",
      })
    );

    expect(payload?.title).toBe("Alerta crítica (liquidez)");
  });

  it("usa alertId de la URL cuando existe", () => {
    const payload = resolveOperationalAlertBootstrapFromProvenance(
      provenance({
        source: "alert",
        alertId: "finpred:deficit-sin-calendario",
        alertTitle: "Caja negativa",
        priority: "critical",
        alertType: "liquidez",
      })
    );

    expect(payload).toMatchObject({
      bootstrapKey: "finpred:deficit-sin-calendario",
      alert_id: "finpred:deficit-sin-calendario",
      title: "Caja negativa",
      alert_type: "liquidez",
    });
  });

  it("deriva alert_id estable cuando falta alertId", () => {
    const first = resolveOperationalAlertBootstrapFromProvenance(
      provenance({
        source: "alert",
        alertTitle: "Caja negativa",
        priority: "critical",
        alertType: "liquidez",
      })
    );
    const second = resolveOperationalAlertBootstrapFromProvenance(
      provenance({
        source: "alert",
        alertTitle: "Caja negativa",
        priority: "critical",
        alertType: "liquidez",
      })
    );

    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(first?.alert_id.startsWith("provenance:liquidez:")).toBe(true);
  });
});
