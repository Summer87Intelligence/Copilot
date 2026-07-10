import { describe, expect, it } from "vitest";

import type { DailyTask } from "@/lib/daily-tasks/daily-tasks-types";
import {
  applyInteractions,
  buildWorkbook,
  calculateDailyTaskPriority,
  generateAutomaticTasks,
  sortWorkbookCards,
  type AutoInteraction,
  type AutomaticTaskInput,
  type GeneratedTask,
  type WorkbookCard,
} from "@/lib/daily-tasks/daily-tasks-workbook";

const TODAY = "2026-07-10";

function baseInput(over: Partial<AutomaticTaskInput> = {}): AutomaticTaskInput {
  return { today: TODAY, ...over };
}

function keys(tasks: GeneratedTask[]): string[] {
  return tasks.map((t) => t.task_key);
}

describe("generateAutomaticTasks — conciliación bancaria", () => {
  it("1. genera tarea de conciliación si hay high/medium/low", () => {
    const tasks = generateAutomaticTasks(
      baseInput({ bank: { withSuggestion: 6, high: 5, medium: 1, low: 0, pending: 6 } })
    );
    const recon = tasks.find((t) => t.task_key === "bank:reconciliation:with_suggestion");
    expect(recon).toBeTruthy();
    expect(recon?.priority).toBe("high");
    expect(recon?.title).toContain("6");
    expect(recon?.actionUrl).toBe(
      "/copilot/movimientos-bancarios?tab=reconciliation&filter=with_suggestion"
    );
    expect(recon?.reason).toContain("5");
  });

  it("prioridad media cuando no hay coincidencias altas", () => {
    const tasks = generateAutomaticTasks(
      baseInput({ bank: { withSuggestion: 2, high: 0, medium: 1, low: 1, pending: 2 } })
    );
    const recon = tasks.find((t) => t.task_key === "bank:reconciliation:with_suggestion");
    expect(recon?.priority).toBe("medium");
  });

  it("2. NO genera tarea de conciliación si no hay sugerencias", () => {
    const tasks = generateAutomaticTasks(
      baseInput({ bank: { withSuggestion: 0, high: 0, medium: 0, low: 0, pending: 0 } })
    );
    expect(keys(tasks)).not.toContain("bank:reconciliation:with_suggestion");
  });

  it("19. el link de conciliación usa el filtro with_suggestion", () => {
    const tasks = generateAutomaticTasks(
      baseInput({ bank: { withSuggestion: 1, high: 1, medium: 0, low: 0, pending: 1 } })
    );
    const recon = tasks.find((t) => t.task_key === "bank:reconciliation:with_suggestion");
    expect(recon?.actionUrl).toContain("filter=with_suggestion");
    expect(recon?.actionUrl).toContain("tab=reconciliation");
  });
});

describe("generateAutomaticTasks — tesorería / cartera / clientes / alertas", () => {
  it("3. genera tarea de pagos que vencen hoy (alta)", () => {
    const tasks = generateAutomaticTasks(
      baseInput({
        treasuryDueToday: [
          { name: "DGI", amount: 5000, currency: "UYU", dueDate: TODAY },
          { name: "BPS", amount: 3000, currency: "UYU", dueDate: TODAY },
        ],
      })
    );
    const due = tasks.find((t) => t.task_key === "treasury:due_today");
    expect(due).toBeTruthy();
    expect(due?.priority).toBe("high");
    expect(due?.title).toContain("2");
    expect(due?.actionUrl).toBe("/copilot/tesoreria");
  });

  it("4. genera tarea de pagos próximos (media)", () => {
    const tasks = generateAutomaticTasks(
      baseInput({
        treasuryUpcoming: [
          { name: "Alquiler", amount: 20000, currency: "UYU", dueDate: "2026-07-12" },
        ],
      })
    );
    const upcoming = tasks.find((t) => t.task_key === "treasury:upcoming");
    expect(upcoming?.priority).toBe("medium");
  });

  it("5. genera tarea de deuda vencida", () => {
    const tasks = generateAutomaticTasks(
      baseInput({
        overdueClients: [
          { name: "Acme", overdue: 90000 },
          { name: "Globex", overdue: 40000 },
          { name: "Initech", overdue: 10000 },
        ],
        overdueByCurrency: [{ currency: "UYU", amount: 140000 }],
      })
    );
    const overdue = tasks.find((t) => t.task_key === "portfolio:overdue_clients");
    expect(overdue).toBeTruthy();
    expect(overdue?.priority).toBe("high"); // 3 clientes + 140k > umbral monto
    expect(overdue?.title).toContain("3");
    expect(overdue?.reason).toContain("Acme");
  });

  it("6. genera tarea de clientes críticos", () => {
    const tasks = generateAutomaticTasks(
      baseInput({ criticalClients: [{ name: "Acme" }, { name: "Globex" }, { name: "Initech" }] })
    );
    const critical = tasks.find((t) => t.task_key === "clients:critical");
    expect(critical).toBeTruthy();
    expect(critical?.priority).toBe("high");
  });

  it("7. genera tarea de alertas activas y respeta severidad", () => {
    const critical = generateAutomaticTasks(baseInput({ alerts: { active: 4, critical: 1 } }));
    expect(critical.find((t) => t.task_key === "alerts:active")?.priority).toBe("high");
    const warning = generateAutomaticTasks(baseInput({ alerts: { active: 2, critical: 0 } }));
    expect(warning.find((t) => t.task_key === "alerts:active")?.priority).toBe("medium");
  });

  it("no inventa tareas sin datos", () => {
    expect(generateAutomaticTasks(baseInput())).toEqual([]);
  });
});

describe("calculateDailyTaskPriority", () => {
  it("reglas de alta/media", () => {
    expect(calculateDailyTaskPriority({ kind: "treasury_due_today" })).toBe("high");
    expect(calculateDailyTaskPriority({ kind: "treasury_upcoming" })).toBe("medium");
    expect(calculateDailyTaskPriority({ kind: "bank_reconciliation", high: 0 })).toBe("medium");
    expect(calculateDailyTaskPriority({ kind: "bank_pending", pending: 30 })).toBe("high");
    expect(calculateDailyTaskPriority({ kind: "bank_pending", pending: 3 })).toBe("medium");
  });
});

describe("applyInteractions (Fase 8/9)", () => {
  const tasks = generateAutomaticTasks(
    baseInput({
      bank: { withSuggestion: 3, high: 2, medium: 1, low: 0, pending: 3 },
      alerts: { active: 1, critical: 0 },
    })
  );

  it("9. respeta ignorar por hoy (oculta la tarea)", () => {
    const interactions: AutoInteraction[] = [
      {
        task_key: "bank:reconciliation:with_suggestion",
        status: "cancelled",
        snoozed_until: null,
        completed_at: null,
        due_date: TODAY,
      },
    ];
    const { active } = applyInteractions(tasks, interactions, TODAY);
    expect(keys(active)).not.toContain("bank:reconciliation:with_suggestion");
    expect(keys(active)).toContain("alerts:active");
  });

  it("10. reaparece al día siguiente si el ignore era de ayer", () => {
    const interactions: AutoInteraction[] = [
      {
        task_key: "bank:reconciliation:with_suggestion",
        status: "cancelled",
        snoozed_until: null,
        completed_at: null,
        due_date: "2026-07-09",
      },
    ];
    const { active } = applyInteractions(tasks, interactions, TODAY);
    expect(keys(active)).toContain("bank:reconciliation:with_suggestion");
  });

  it("snooze vigente mueve a pospuestas", () => {
    const interactions: AutoInteraction[] = [
      {
        task_key: "alerts:active",
        status: "postponed",
        snoozed_until: "2026-07-15",
        completed_at: null,
        due_date: null,
      },
    ];
    const { active, postponed } = applyInteractions(tasks, interactions, TODAY);
    expect(keys(active)).not.toContain("alerts:active");
    expect(keys(postponed)).toContain("alerts:active");
  });

  it("completada hoy va a completadas", () => {
    const interactions: AutoInteraction[] = [
      {
        task_key: "alerts:active",
        status: "done",
        snoozed_until: null,
        completed_at: `${TODAY}T10:00:00.000Z`,
        due_date: null,
      },
    ];
    const { completedToday } = applyInteractions(tasks, interactions, TODAY);
    expect(keys(completedToday)).toContain("alerts:active");
  });
});

describe("buildWorkbook (Fase 5/9/16/17)", () => {
  function manual(over: Partial<DailyTask>): DailyTask {
    return {
      id: over.id ?? "m1",
      workspace_id: "ws",
      assigned_to_user_id: null,
      title: over.title ?? "Tarea manual",
      description: null,
      module_key: over.module_key ?? "cobranza",
      source_type: null,
      source_id: null,
      priority: over.priority ?? "low",
      status: over.status ?? "pending",
      due_date: over.due_date ?? null,
      completed_at: over.completed_at ?? null,
      completed_by: null,
      action_url: null,
      task_key: null,
      snoozed_until: null,
      created_at: "2026-07-10T00:00:00Z",
      updated_at: "2026-07-10T00:00:00Z",
      ...over,
    };
  }

  it("16/8. agrupa por prioridad, mezcla auto+manual, no duplica", () => {
    const auto = generateAutomaticTasks(
      baseInput({ treasuryDueToday: [{ name: "DGI", amount: 1, currency: "UYU", dueDate: TODAY }] })
    );
    const { sections } = buildWorkbook({
      today: TODAY,
      autoActive: auto,
      autoCompletedToday: [],
      autoPostponed: [],
      manualTasks: [
        manual({ id: "a", priority: "high", title: "Urgente manual" }),
        manual({ id: "b", priority: "low", title: "Manual suelta" }),
      ],
    });
    expect(sections.urgent.map((c) => c.id).sort()).toEqual(["a", "treasury:due_today"].sort());
    expect(sections.manual.map((c) => c.id)).toEqual(["b"]);
    const allIds = [...sections.urgent, ...sections.today, ...sections.manual].map((c) => c.id);
    expect(new Set(allIds).size).toBe(allIds.length); // sin duplicados
  });

  it("17. calcula los contadores superiores", () => {
    const auto = generateAutomaticTasks(
      baseInput({
        treasuryDueToday: [{ name: "DGI", amount: 1, currency: "UYU", dueDate: TODAY }],
        treasuryUpcoming: [{ name: "Luz", amount: 1, currency: "UYU", dueDate: "2026-07-12" }],
      })
    );
    const { counters } = buildWorkbook({
      today: TODAY,
      autoActive: auto,
      autoCompletedToday: [],
      autoPostponed: [],
      manualTasks: [manual({ id: "done1", status: "done", completed_at: `${TODAY}T09:00:00Z` })],
    });
    expect(counters.urgent).toBe(1); // treasury due today
    expect(counters.important).toBe(1); // treasury upcoming
    expect(counters.completed).toBe(1); // manual done today
    expect(counters.today).toBe(2);
  });

  it("18. estado vacío ⇒ todos los contadores en cero", () => {
    const { counters, sections } = buildWorkbook({
      today: TODAY,
      autoActive: [],
      autoCompletedToday: [],
      autoPostponed: [],
      manualTasks: [],
    });
    expect(counters).toEqual({ urgent: 0, important: 0, today: 0, completed: 0 });
    expect(sections.urgent).toEqual([]);
  });
});

describe("sortWorkbookCards", () => {
  it("ordena alta antes que media", () => {
    const cards: WorkbookCard[] = [
      { id: "m", kind: "auto", origin: "tesoreria", moduleKey: "tesoreria", priority: "medium", status: "pending", title: "B" },
      { id: "h", kind: "auto", origin: "cartera", moduleKey: "cartera", priority: "high", status: "pending", title: "A" },
    ];
    expect(sortWorkbookCards(cards).map((c) => c.id)).toEqual(["h", "m"]);
  });
});
