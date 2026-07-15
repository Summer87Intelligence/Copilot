import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { ModulePermission } from "@/lib/auth/module-permissions";
import type { DailyTask } from "@/lib/daily-tasks/daily-tasks-types";
import {
  buildUnifiedTaskFeed,
  canReceiveModuleRecommendation,
  dedupeRecommendations,
  scoreUnifiedTaskItem,
  visibleUnifiedTabs,
  type TaskRecommendation,
} from "@/lib/tasks/unified-task-feed";
import type { TaskViewer } from "@/lib/tasks/task-visibility";

const TODAY = "2026-07-15";
const USER = "user-1";

const permissions = (entries: Record<string, "none" | "read" | "write" | "admin">): ModulePermission[] =>
  Object.entries(entries).map(([moduleKey, accessLevel]) => ({ moduleKey: moduleKey as never, accessLevel }));

const viewer: TaskViewer = {
  userId: USER,
  role: "usuario",
  permissions: permissions({
    daily_tasks: "write",
    cobranza: "read",
    clientes: "read",
    hoy: "none",
    datos: "none",
  }),
};

const admin: TaskViewer = {
  userId: "daniel",
  role: "superadmin",
  permissions: [],
};

function task(overrides: Partial<DailyTask>): DailyTask {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    workspace_id: "ws",
    assigned_to_user_id: null,
    title: "Tarea",
    description: null,
    module_key: "cobranza",
    source_type: null,
    source_id: null,
    priority: "medium",
    status: "pending",
    due_date: null,
    completed_at: null,
    completed_by: null,
    action_url: null,
    metadata: {},
    task_key: null,
    snoozed_until: null,
    created_by_user_id: null,
    visibility: "workspace",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

function rec(overrides: Partial<TaskRecommendation>): TaskRecommendation {
  return {
    stableKey: "collection:client:c1:overdue:late_15_30",
    workspaceId: "ws",
    moduleKey: "cobranza",
    title: "Contactar a Cliente",
    description: "Saldo atrasado",
    reason: "Saldo atrasado por due_date",
    priority: "high",
    dueDate: TODAY,
    sourceType: "client",
    sourceId: "c1",
    actionUrl: "/copilot/clientes/c1",
    suggestedAssigneeUserId: null,
    generatedAt: "2026-07-15T00:00:00Z",
    businessDate: TODAY,
    originLabel: "Cobranza",
    entityLabel: "Cliente",
    confidence: 0.8,
    impact: { bucket: "high", overdueDays: 20, currencies: { UYU: 100 } },
    ...overrides,
  };
}

describe("canReceiveModuleRecommendation", () => {
  it("requiere daily_tasks + módulo de origen habilitado para usuario común", () => {
    expect(canReceiveModuleRecommendation(viewer, "cobranza")).toBe(true);
    expect(canReceiveModuleRecommendation(viewer, "hoy")).toBe(false);
  });

  it("admin puede recibir recomendaciones de todos los módulos", () => {
    expect(canReceiveModuleRecommendation(admin, "datos")).toBe(true);
  });
});

describe("dedupeRecommendations", () => {
  it("una tarea activa reemplaza la recomendación equivalente", () => {
    const active = task({ task_key: "k1", status: "in_progress" });
    expect(dedupeRecommendations([rec({ stableKey: "k1" })], [active], TODAY)).toHaveLength(0);
  });

  it("stableKey deduplica entre recomendaciones", () => {
    expect(dedupeRecommendations([rec({ stableKey: "k1" }), rec({ stableKey: "k1" })], [], TODAY)).toHaveLength(1);
  });

  it("descartada por hoy no reaparece inmediatamente", () => {
    const dismissed = task({
      task_key: "k1",
      status: "cancelled",
      due_date: TODAY,
      metadata: { stableKey: "k1", dismissedUntil: TODAY },
    });
    expect(dedupeRecommendations([rec({ stableKey: "k1" })], [dismissed], TODAY)).toHaveLength(0);
  });
});

describe("buildUnifiedTaskFeed", () => {
  it("combina tareas y recomendaciones sin duplicar", () => {
    const feed = buildUnifiedTaskFeed({
      tasks: [task({ id: "t1", task_key: "same" })],
      recommendations: [rec({ stableKey: "same" }), rec({ stableKey: "new" })],
      todayYmd: TODAY,
      viewerId: USER,
      isAdmin: false,
      filters: { tab: "priority" },
    });
    expect(feed.items).toHaveLength(2);
    expect(feed.items.some((item) => item.kind === "task" && item.stableKey === "same")).toBe(true);
    expect(feed.items.some((item) => item.kind === "recommendation" && item.stableKey === "new")).toBe(true);
    expect(feed.summary.recommended).toBe(1);
  });

  it("admin-only tabs quedan protegidos", () => {
    expect(visibleUnifiedTabs(false)).not.toContain("all");
    expect(visibleUnifiedTabs(false)).not.toContain("unassigned");
    expect(visibleUnifiedTabs(true)).toContain("all");
  });
});

describe("scoreUnifiedTaskItem", () => {
  it("atrasada ordena por encima de futura", () => {
    const overdue = buildUnifiedTaskFeed({
      tasks: [task({ id: "late", due_date: "2026-07-10", priority: "medium" })],
      recommendations: [],
      todayYmd: TODAY,
      viewerId: USER,
      isAdmin: false,
      filters: {},
    }).items[0]!;
    const future = buildUnifiedTaskFeed({
      tasks: [task({ id: "future", due_date: "2026-07-20", priority: "medium" })],
      recommendations: [],
      todayYmd: TODAY,
      viewerId: USER,
      isAdmin: false,
      filters: {},
    }).items[0]!;
    expect(overdue.score).toBeGreaterThan(future.score);
  });

  it("no mezcla monedas: el impacto conserva buckets por moneda", () => {
    const recommendation = rec({ impact: { bucket: "high", currencies: { UYU: 1000, USD: 50 }, overdueDays: 30 } });
    const item = buildUnifiedTaskFeed({
      tasks: [],
      recommendations: [recommendation],
      todayYmd: TODAY,
      viewerId: USER,
      isAdmin: false,
      filters: {},
    }).items[0]!;
    expect(item.recommendation?.impact?.currencies).toEqual({ UYU: 1000, USD: 50 });
    expect(scoreUnifiedTaskItem(item, TODAY)).toBeGreaterThan(0);
  });
});

describe("UI guardrails", () => {
  it("la ruta visible monta bandeja unificada y no el selector anterior", () => {
    const src = readFileSync(join(process.cwd(), "app/copilot/tareas-diarias/page.tsx"), "utf8");
    expect(src).toContain("UnifiedTasksPanel");
    expect(src).not.toContain("DailyTasksPageClient");
    expect(src).not.toContain("Cuaderno");
  });
});
