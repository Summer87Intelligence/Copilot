import { describe, expect, it } from "vitest";

import {
  mapOperationalEventSeverity,
  mapOperationalEventToTimelineItem,
  mapOperationalEventTypeLabel,
  OperationalEventRequestBuffer,
  resolveOperationalEventHref,
} from "@/lib/copilot-operational-events";
import type { OperationalEventRecord } from "@/lib/copilot-operational-events-types";

const BASE_RECORD: OperationalEventRecord = {
  id: "evt-1",
  workspaceCompanyId: "ws-1",
  eventType: "workflow_assigned",
  entityType: "workflow",
  entityId: "wf-1",
  workflowId: "wf-1",
  actionId: null,
  actorLabel: "Operador",
  actorUserId: "user-1",
  title: "Caja crítica",
  detail: "Operador",
  metadata: {},
  occurredAt: "2026-05-14T12:00:00.000Z",
  createdAt: "2026-05-14T12:00:00.000Z",
};

describe("copilot-operational-events", () => {
  it("normaliza labels, severidad y href", () => {
    const item = mapOperationalEventToTimelineItem(BASE_RECORD);
    expect(mapOperationalEventTypeLabel("step_completed")).toBe("Paso completado");
    expect(mapOperationalEventSeverity("action_blocked")).toBe("danger");
    expect(item.typeLabel).toBe("Workflow asignado");
    expect(item.contextLabel).toBe("Ejecución guiada");
    expect(resolveOperationalEventHref({ ...BASE_RECORD, entityType: "action", actionId: "act-1" })).toBe(
      "/copilot/acciones?operationalActionId=act-1"
    );
  });

  it("deduplica eventos idénticos en el mismo request", () => {
    const buffer = new OperationalEventRequestBuffer();
    const input = {
      workspaceCompanyId: "ws-1",
      eventType: "workflow_created" as const,
      entityType: "workflow" as const,
      entityId: "wf-1",
      title: "Caja crítica",
    };
    expect(buffer.shouldEmit(input)).toBe(true);
    expect(buffer.shouldEmit(input)).toBe(false);
  });
});
