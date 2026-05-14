import { describe, expect, it, beforeEach } from "vitest";

import {
  AUTOMATION_KIND_RULE_IDS,
  listOperationalAutomationRules,
} from "@/lib/copilot-operational-automation-registry";
import {
  buildAutomationGovernanceResponse,
  canApplyAutomationRule,
  getGovernanceContextForWorkspace,
  patchAutomationGovernanceRule,
  resetWorkspaceGovernanceForTests,
} from "@/lib/copilot-operational-governance";

const NOW = new Date("2026-05-14T12:00:00.000Z");
const WORKSPACE = "tenant-governance-only";

describe("copilot-operational-governance registry", () => {
  beforeEach(() => {
    resetWorkspaceGovernanceForTests(WORKSPACE);
  });

  it("lista todas las reglas registradas", () => {
    const rules = listOperationalAutomationRules();
    const ids = rules.map((rule) => rule.id);
    expect(ids).toContain(AUTOMATION_KIND_RULE_IDS.follow_up);
    expect(ids).toContain(AUTOMATION_KIND_RULE_IDS.auto_escalation);
    expect(ids).toContain("rule.restricted.auto_cancel");
  });

  it("aplica mute temporal en runtime", () => {
    const mutedUntil = new Date(NOW.getTime() + 60_000).toISOString();
    patchAutomationGovernanceRule(WORKSPACE, AUTOMATION_KIND_RULE_IDS.follow_up, { mutedUntil });
    const context = getGovernanceContextForWorkspace(WORKSPACE, NOW);
    const gate = canApplyAutomationRule(context, AUTOMATION_KIND_RULE_IDS.follow_up, "wf:1");
    expect(gate.allowed).toBe(false);
    expect(gate.decision).toBe("skipped_muted");
  });

  it("devuelve audit events en memoria vía respuesta", () => {
    const response = buildAutomationGovernanceResponse(WORKSPACE);
    expect(Array.isArray(response.auditEvents)).toBe(true);
    expect(Array.isArray(response.activeAutomations)).toBe(true);
  });
});
