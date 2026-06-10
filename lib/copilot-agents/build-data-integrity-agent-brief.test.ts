import { describe, expect, it } from "vitest";
import { buildDataIntegrityAgentBrief } from "./build-data-integrity-agent-brief";
import type { CopilotNotification } from "@/lib/copilot-notifications/notification-types";
import type { OicHealthDashboardData } from "@/lib/operacional/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNotif(overrides: Partial<CopilotNotification>): CopilotNotification {
  return {
    id: "n1",
    workspace_company_id: "ws1",
    type: "sync_failed",
    severity: "warning",
    title: "Sincronización fallida",
    body: null,
    entity_type: null,
    entity_id: null,
    amount: null,
    currency: null,
    action_href: "/copilot/alertas",
    dedup_key: null,
    metadata: {},
    read_at: null,
    created_at: "2026-05-25T10:00:00Z",
    ...overrides,
  };
}

function makeHealth(overrides: Partial<OicHealthDashboardData>): OicHealthDashboardData {
  return {
    workspaceCompanyId: "ws1",
    computedAt: "2026-05-25T10:00:00Z",
    overallScore: 80,
    severity: "ok",
    dimensions: [],
    lastPipelineRunAt: "2026-05-25T09:00:00Z",
    lastSyncAt: "2026-05-25T09:00:00Z",
    openViolations: 0,
    pendingResyncJobs: 0,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("buildDataIntegrityAgentBrief", () => {
  it("sin señales → brief stable", () => {
    const result = buildDataIntegrityAgentBrief({});
    expect(result.status).toBe("stable");
    expect(result.priorities).toHaveLength(0);
    expect(result.summary).toContain("actualizados");
    expect(result.nextBestAction!.href).toBe("/copilot/alertas");
  });

  it("sync_failed critical → brief critical + prioridad Ver alertas", () => {
    const n = makeNotif({ id: "sf1", severity: "critical" });
    const result = buildDataIntegrityAgentBrief({ notifications: [n] });
    expect(result.status).toBe("critical");
    expect(result.priorities).toHaveLength(1);
    expect(result.priorities[0].severity).toBe("critical");
    expect(result.priorities[0].ctaLabel).toBe("Ver alertas");
    expect(result.priorities[0].href).toBe("/copilot/alertas");
  });

  it("sync_failed warning → brief attention con prioridad high", () => {
    const n = makeNotif({ id: "sf2", severity: "warning" });
    const result = buildDataIntegrityAgentBrief({ notifications: [n] });
    expect(result.status).toBe("attention");
    expect(result.priorities[0].severity).toBe("high");
  });

  it("varias sync_failed → una sola prioridad agrupada con mayor severidad", () => {
    const n1 = makeNotif({ id: "a", severity: "warning" });
    const n2 = makeNotif({ id: "b", severity: "critical" });
    const n3 = makeNotif({ id: "c", severity: "info" });
    const result = buildDataIntegrityAgentBrief({ notifications: [n1, n2, n3] });
    const syncPriorities = result.priorities.filter((p) => p.id === "data-integrity-sync-failed");
    expect(syncPriorities).toHaveLength(1);
    expect(syncPriorities[0].severity).toBe("critical");
    expect(syncPriorities[0].reason).toContain("3");
  });

  it("notificación informativa → no genera estado crítico", () => {
    const n = makeNotif({ id: "sf3", severity: "info" });
    const result = buildDataIntegrityAgentBrief({ notifications: [n] });
    expect(result.status).not.toBe("critical");
    expect(result.priorities[0].severity).toBe("medium");
  });

  it("notificación leída → ignorada", () => {
    const n = makeNotif({ id: "sf4", severity: "critical", read_at: "2026-05-25T08:00:00Z" });
    const result = buildDataIntegrityAgentBrief({ notifications: [n] });
    expect(result.status).toBe("stable");
    expect(result.priorities).toHaveLength(0);
  });

  it("sync_failed con texto de API externa → motivo simple sin jerga técnica", () => {
    const n = makeNotif({
      id: "sf5",
      severity: "warning",
      body: "HTTP 500 en llamada a Zeta API. Stack trace: NullPointerException at line 42.",
    });
    const result = buildDataIntegrityAgentBrief({ notifications: [n] });
    const reason = result.priorities[0].reason;
    expect(reason).not.toContain("Stack trace");
    expect(reason).not.toContain("HTTP 500");
    expect(reason).not.toContain("NullPointerException");
    expect(reason).toContain("externa");
  });

  it("summary no expone body técnico de notificación", () => {
    const n = makeNotif({
      id: "sf6",
      severity: "critical",
      body: "zeta_sync_runs error: SQLSTATE[23000] unique violation at row 4521",
    });
    const result = buildDataIntegrityAgentBrief({ notifications: [n] });
    expect(result.summary).not.toContain("SQLSTATE");
    expect(result.summary).not.toContain("zeta_sync_runs");
    expect(result.summary).not.toContain("unique violation");
  });

  it("CTA siempre apunta a /copilot/alertas (estado del sistema)", () => {
    const n = makeNotif({ id: "sf7", severity: "critical" });
    const result = buildDataIntegrityAgentBrief({ notifications: [n] });
    for (const p of result.priorities) {
      expect(p.href).toBe("/copilot/alertas");
      expect(p.ctaLabel).toBe("Ver alertas");
    }
    expect(result.nextBestAction!.href).toBe("/copilot/alertas");
  });

  it("operationalHealth critical → prioridad crítica sin notificaciones", () => {
    const health = makeHealth({ severity: "critical", overallScore: 20 });
    const result = buildDataIntegrityAgentBrief({ operationalHealth: health });
    expect(result.status).toBe("critical");
    expect(result.priorities[0].severity).toBe("critical");
    expect(result.priorities[0].href).toBe("/copilot/alertas");
  });

  it("operationalHealth degraded → prioridad high", () => {
    const health = makeHealth({ severity: "degraded", overallScore: 45 });
    const result = buildDataIntegrityAgentBrief({ operationalHealth: health });
    expect(result.status).toBe("attention");
    expect(result.priorities[0].severity).toBe("high");
  });

  it("operationalHealth ok sin violaciones → stable", () => {
    const health = makeHealth({ severity: "ok", overallScore: 95, openViolations: 0 });
    const result = buildDataIntegrityAgentBrief({ operationalHealth: health });
    expect(result.status).toBe("stable");
    expect(result.priorities).toHaveLength(0);
  });

  it("openViolations > 0 con health ok → prioridad medium", () => {
    const health = makeHealth({ severity: "ok", openViolations: 3 });
    const result = buildDataIntegrityAgentBrief({ operationalHealth: health });
    const v = result.priorities.find((p) => p.id === "data-integrity-violations");
    expect(v).toBeDefined();
    expect(v?.severity).toBe("medium");
    expect(v?.reason).toContain("3");
  });

  it("openViolations > 5 → prioridad high", () => {
    const health = makeHealth({ severity: "ok", openViolations: 8 });
    const result = buildDataIntegrityAgentBrief({ operationalHealth: health });
    const v = result.priorities.find((p) => p.id === "data-integrity-violations");
    expect(v?.severity).toBe("high");
  });
});
