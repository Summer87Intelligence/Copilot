import { describe, expect, it } from "vitest";

import {
  buildCommandCenterQueue,
  commandCenterPreviewItems,
  filterCommandCenterItems,
  moveCommandCenterSelection,
  selectCommandCenterItem,
} from "@/lib/copilot-command-center-queue";

const NOW = new Date("2026-05-14T12:00:00.000Z");

describe("copilot-command-center-queue", () => {
  it("ordena blocked critical antes que el resto", () => {
    const { items } = buildCommandCenterQueue({
      workflows: [
        {
          id: "wf-open",
          title: "Cobranza",
          type: "priority_collections",
          status: "active",
          progressPercent: 20,
          currentStepTitle: "Paso 2",
          urgencyScore: 30,
        },
        {
          id: "wf-blocked",
          title: "Caja crítica",
          type: "critical_cash",
          status: "blocked",
          progressPercent: 40,
          currentStepTitle: "Paso 3",
          urgencyScore: 80,
          slaStatus: "breached",
        },
      ],
      feedItems: [],
      memorySignals: [],
      events: [],
      now: NOW,
    });
    expect(items[0]?.id).toBe("workflow:wf-blocked");
  });

  it("deduplica acciones ya cubiertas por workflows", () => {
    const { items } = buildCommandCenterQueue({
      workflows: [
        {
          id: "wf-1",
          title: "Seguimiento bloqueado",
          type: "blocked_followup",
          status: "active",
          progressPercent: 0,
          relatedActionIds: ["act-1"],
          urgencyScore: 50,
        },
      ],
      feedItems: [
        {
          id: "action:act-1",
          source: "action",
          severity: "high",
          title: "Seguimiento duplicado",
          score: 40,
          metadata: { actionId: "act-1" },
        },
      ],
      memorySignals: [],
      events: [],
      now: NOW,
    });
    expect(items.some((item) => item.id === "action:act-1")).toBe(false);
    expect(items.some((item) => item.id === "workflow:wf-1")).toBe(true);
  });

  it("aplica filtros y conserva selección", () => {
    const { items } = buildCommandCenterQueue({
      workflows: [
        {
          id: "wf-1",
          title: "Caja crítica",
          type: "critical_cash",
          status: "active",
          progressPercent: 0,
          urgencyScore: 90,
        },
        {
          id: "wf-2",
          title: "Cobranza",
          type: "priority_collections",
          status: "blocked",
          progressPercent: 10,
          urgencyScore: 40,
        },
      ],
      feedItems: [],
      memorySignals: [],
      events: [],
      now: NOW,
    });
    const critical = filterCommandCenterItems(items, "critical");
    expect(critical).toHaveLength(1);
    const preview = commandCenterPreviewItems(critical, 8);
    const selected = selectCommandCenterItem(preview, preview[0]?.id ?? null);
    expect(selected?.id).toBe(preview[0]?.id);
    const next = moveCommandCenterSelection(preview, selected?.id ?? null, "next");
    expect(next).toBe(preview[0]?.id);
  });

  it("devuelve empty state cuando no hay señales", () => {
    const { emptyMessage, items } = buildCommandCenterQueue({
      workflows: [],
      feedItems: [],
      memorySignals: [],
      events: [],
      now: NOW,
    });
    expect(items).toHaveLength(0);
    expect(emptyMessage).toContain("Sin bloqueos");
  });
});
