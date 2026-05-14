import type { SupabaseClient } from "@supabase/supabase-js";

import type { OperationalAutomationResult } from "@/lib/copilot-operational-automation-types";
import {
  getOperationalAutomationRule,
  listOperationalAutomationRules,
} from "@/lib/copilot-operational-automation-registry";
import type {
  OperationalAutomationAuditEvent,
  OperationalAutomationGovernanceResponse,
  OperationalAutomationGovernanceState,
  OperationalGovernedAutomation,
} from "@/lib/copilot-operational-governance-types";
import {
  insertGovernanceAuditBatch,
  loadGovernanceStateFromDb,
  upsertGovernanceRuleToDb,
} from "@/lib/data/governance-state-repository";

type WorkspaceGovernanceMemory = {
  state: OperationalAutomationGovernanceState;
  cooldowns: Map<string, string>;
  activeAutomations: OperationalGovernedAutomation[];
  auditEvents: OperationalAutomationAuditEvent[];
  generatedAt: string | null;
  /** true una vez que se cargó el estado desde DB al menos una vez en este proceso */
  hydrated: boolean;
};

const workspaceMemory = new Map<string, WorkspaceGovernanceMemory>();

function cooldownKey(workspaceCompanyId: string, ruleId: string, workflowId: string): string {
  return `${workspaceCompanyId}|${ruleId}|${workflowId}`;
}

function createDefaultState(): OperationalAutomationGovernanceState {
  return {
    rules: listOperationalAutomationRules().map((rule) => ({
      ruleId: rule.id,
      enabled: rule.defaultEnabled,
      cooldownMinutes: rule.cooldownMinutes,
    })),
  };
}

function getWorkspaceMemory(workspaceCompanyId: string): WorkspaceGovernanceMemory {
  const existing = workspaceMemory.get(workspaceCompanyId);
  if (existing) return existing;
  const created: WorkspaceGovernanceMemory = {
    state: createDefaultState(),
    cooldowns: new Map(),
    activeAutomations: [],
    auditEvents: [],
    generatedAt: null,
    hydrated: false,
  };
  workspaceMemory.set(workspaceCompanyId, created);
  return created;
}

/**
 * Hidrata el estado de governance desde Supabase si aún no se cargó en este proceso.
 * Merge non-destructivo: valores DB sobrescriben defaults, cooldowns in-memory se preservan.
 * Si DB falla, se usa el estado en-memoria existente (fallback seguro).
 */
export async function hydrateGovernanceStateFromDb(
  client: SupabaseClient,
  workspaceCompanyId: string
): Promise<void> {
  const memory = getWorkspaceMemory(workspaceCompanyId);
  if (memory.hydrated) return;

  try {
    const dbRules = await loadGovernanceStateFromDb(client, workspaceCompanyId);
    if (dbRules.length === 0) {
      memory.hydrated = true;
      return;
    }
    const dbRulesByRuleId = new Map(dbRules.map((rule) => [rule.ruleId, rule]));
    const merged = memory.state.rules.map((rule) => {
      const fromDb = dbRulesByRuleId.get(rule.ruleId);
      if (!fromDb) return rule;
      return {
        ...rule,
        enabled: fromDb.enabled,
        ...(fromDb.cooldownMinutes !== undefined
          ? { cooldownMinutes: fromDb.cooldownMinutes }
          : {}),
        ...(fromDb.mutedUntil !== undefined ? { mutedUntil: fromDb.mutedUntil } : {}),
      };
    });
    memory.state = { rules: merged };
    memory.hydrated = true;
  } catch {
    // Fallback: usar estado in-memory actual; marcar hydrated para no reintentar en bucle
    memory.hydrated = true;
  }
}

/**
 * Persiste un cambio de regla a Supabase (fire-and-forget).
 * Errores no bloquean el flujo; el estado in-memory ya está actualizado.
 */
export function persistGovernanceRuleToDb(
  client: SupabaseClient,
  workspaceCompanyId: string,
  ruleId: string,
  patch: { enabled?: boolean; mutedUntil?: string | null; cooldownMinutes?: number },
  updatedBy?: string | null
): void {
  upsertGovernanceRuleToDb(client, workspaceCompanyId, ruleId, patch, updatedBy).catch((err) => {
    console.error(
      JSON.stringify({
        kind: "governance_persist_failed",
        ruleId,
        workspace: workspaceCompanyId,
        error: err instanceof Error ? err.message : String(err),
      })
    );
  });
}

/**
 * Persiste un lote de audit events a Supabase (fire-and-forget).
 */
export function persistGovernanceAuditToDb(
  client: SupabaseClient,
  workspaceCompanyId: string,
  events: OperationalAutomationAuditEvent[]
): void {
  if (events.length === 0) return;
  insertGovernanceAuditBatch(client, workspaceCompanyId, events).catch((err) => {
    console.error(
      JSON.stringify({
        kind: "governance_audit_persist_failed",
        workspace: workspaceCompanyId,
        count: events.length,
        error: err instanceof Error ? err.message : String(err),
      })
    );
  });
}

export type OperationalAutomationGovernanceContext = {
  workspaceCompanyId: string;
  state: OperationalAutomationGovernanceState;
  cooldowns: Map<string, string>;
  auditEvents: OperationalAutomationAuditEvent[];
  now: Date;
};

export function getGovernanceContextForWorkspace(
  workspaceCompanyId: string,
  now = new Date()
): OperationalAutomationGovernanceContext {
  const memory = getWorkspaceMemory(workspaceCompanyId);
  return {
    workspaceCompanyId,
    state: memory.state,
    cooldowns: memory.cooldowns,
    auditEvents: memory.auditEvents,
    now,
  };
}

export function getRuleRuntimeState(
  state: OperationalAutomationGovernanceState,
  ruleId: string
): OperationalAutomationGovernanceState["rules"][number] {
  const runtime = state.rules.find((rule) => rule.ruleId === ruleId);
  if (runtime) return runtime;
  const definition = getOperationalAutomationRule(ruleId);
  return {
    ruleId,
    enabled: definition?.defaultEnabled ?? false,
    cooldownMinutes: definition?.cooldownMinutes,
  };
}

export function canApplyAutomationRule(
  context: OperationalAutomationGovernanceContext,
  ruleId: string,
  workflowId: string
): { allowed: boolean; decision: OperationalAutomationAuditEvent["decision"]; reasons: string[] } {
  const definition = getOperationalAutomationRule(ruleId);
  const runtime = getRuleRuntimeState(context.state, ruleId);
  const reasons: string[] = [];

  if (!definition) {
    return { allowed: false, decision: "skipped_disabled", reasons: ["Regla no registrada."] };
  }

  if (definition.riskLevel === "restricted") {
    reasons.push("Regla restringida.");
    return { allowed: false, decision: "skipped_restricted", reasons };
  }

  if (!runtime.enabled) {
    reasons.push("Regla deshabilitada.");
    return { allowed: false, decision: "skipped_disabled", reasons };
  }

  if (runtime.mutedUntil) {
    const mutedUntilMs = Date.parse(runtime.mutedUntil);
    if (Number.isFinite(mutedUntilMs) && mutedUntilMs > context.now.getTime()) {
      reasons.push(`Regla silenciada hasta ${runtime.mutedUntil}.`);
      return { allowed: false, decision: "skipped_muted", reasons };
    }
  }

  const cooldownUntil = context.cooldowns.get(
    cooldownKey(context.workspaceCompanyId, ruleId, workflowId)
  );
  if (cooldownUntil) {
    const cooldownUntilMs = Date.parse(cooldownUntil);
    if (Number.isFinite(cooldownUntilMs) && cooldownUntilMs > context.now.getTime()) {
      reasons.push(`Cooldown activo hasta ${cooldownUntil}.`);
      return { allowed: false, decision: "skipped_cooldown", reasons };
    }
  }

  return { allowed: true, decision: "generated", reasons };
}

export function recordAutomationRuleCooldown(
  context: OperationalAutomationGovernanceContext,
  ruleId: string,
  workflowId: string
): void {
  const runtime = getRuleRuntimeState(context.state, ruleId);
  const definition = getOperationalAutomationRule(ruleId);
  const minutes = runtime.cooldownMinutes ?? definition?.cooldownMinutes ?? 0;
  if (minutes <= 0) return;
  const until = new Date(context.now.getTime() + minutes * 60_000).toISOString();
  context.cooldowns.set(cooldownKey(context.workspaceCompanyId, ruleId, workflowId), until);
}

/** Poda entradas de cooldown expiradas para prevenir crecimiento indefinido del Map. */
export function pruneExpiredCooldowns(
  context: OperationalAutomationGovernanceContext
): void {
  const nowMs = context.now.getTime();
  for (const [key, until] of context.cooldowns.entries()) {
    const untilMs = Date.parse(until);
    if (!Number.isFinite(untilMs) || untilMs <= nowMs) {
      context.cooldowns.delete(key);
    }
  }
}

export function appendAutomationAuditEvent(
  context: OperationalAutomationGovernanceContext,
  event: Omit<OperationalAutomationAuditEvent, "generatedAt">
): void {
  context.auditEvents.push({
    ...event,
    generatedAt: context.now.toISOString(),
  });
}

export function rememberAutomationGovernanceRun(
  workspaceCompanyId: string,
  run: OperationalAutomationResult,
  governed: OperationalGovernedAutomation[]
): void {
  const memory = getWorkspaceMemory(workspaceCompanyId);
  memory.activeAutomations = governed;
  if (run.auditEvents && run.auditEvents.length > 0) {
    memory.auditEvents = [...memory.auditEvents, ...run.auditEvents].slice(-100);
  }
  memory.generatedAt = run.computedAt;
}

export function buildAutomationGovernanceResponse(
  workspaceCompanyId: string
): OperationalAutomationGovernanceResponse {
  const memory = getWorkspaceMemory(workspaceCompanyId);
  const rules = listOperationalAutomationRules().map((rule) => ({
    ...rule,
    runtime: getRuleRuntimeState(memory.state, rule.id),
  }));

  return {
    rules,
    activeAutomations: memory.activeAutomations,
    auditEvents: memory.auditEvents.slice(-50),
    generatedAt: memory.generatedAt ?? new Date().toISOString(),
    health: { status: "ok", warnings: [] },
  };
}

export function patchAutomationGovernanceRule(
  workspaceCompanyId: string,
  ruleId: string,
  patch: {
    enabled?: boolean;
    mutedUntil?: string | null;
    cooldownMinutes?: number;
  }
): OperationalAutomationGovernanceState {
  const memory = getWorkspaceMemory(workspaceCompanyId);
  const runtime = getRuleRuntimeState(memory.state, ruleId);
  const next: OperationalAutomationGovernanceState["rules"][number] = {
    ...runtime,
    ruleId,
    ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    ...(patch.cooldownMinutes !== undefined ? { cooldownMinutes: patch.cooldownMinutes } : {}),
    ...(patch.mutedUntil === null
      ? {}
      : patch.mutedUntil !== undefined
        ? { mutedUntil: patch.mutedUntil }
        : {}),
  };
  if (patch.mutedUntil === null) {
    delete next.mutedUntil;
  }
  memory.state = {
    rules: [
      ...memory.state.rules.filter((rule) => rule.ruleId !== ruleId),
      next,
    ],
  };
  return memory.state;
}

export function resetWorkspaceGovernanceForTests(workspaceCompanyId: string): void {
  workspaceMemory.delete(workspaceCompanyId);
}
