import { describe, expect, it } from "vitest";

import {
  buildInteractionInsert,
  buildInteractionPatch,
  dailyTaskInteractionBodySchema,
  interactionStateFields,
  type DailyTaskInteractionBody,
} from "@/lib/daily-tasks/daily-tasks-interactions";

const WS = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";
const NOW = new Date("2026-07-10T12:00:00.000Z");

function body(over: Partial<DailyTaskInteractionBody> = {}): DailyTaskInteractionBody {
  return {
    task_key: "treasury:due_today",
    action: "ignore_today",
    module_key: "tesoreria",
    title: "Confirmar pagos que vencen hoy",
    ...over,
  } as DailyTaskInteractionBody;
}

describe("dailyTaskInteractionBodySchema", () => {
  it("acepta ignorar por hoy", () => {
    expect(dailyTaskInteractionBodySchema.safeParse(body()).success).toBe(true);
  });

  it("rechaza snooze sin fecha", () => {
    const r = dailyTaskInteractionBodySchema.safeParse(body({ action: "snooze" }));
    expect(r.success).toBe(false);
  });

  it("acepta snooze con fecha", () => {
    const r = dailyTaskInteractionBodySchema.safeParse(
      body({ action: "snooze", snoozed_until: "2026-07-15" })
    );
    expect(r.success).toBe(true);
  });

  it("rechaza workspace_id del cliente", () => {
    const r = dailyTaskInteractionBodySchema.safeParse({ ...body(), workspace_id: WS });
    expect(r.success).toBe(false);
  });
});

describe("interactionStateFields", () => {
  it("complete sella completed_at/by y fija due_date de hoy", () => {
    const f = interactionStateFields(body({ action: "complete" }), { userId: USER, now: NOW });
    expect(f.status).toBe("done");
    expect(f.completed_by).toBe(USER);
    expect(f.due_date).toBe("2026-07-10");
  });

  it("ignore_today marca cancelled con due_date de hoy", () => {
    const f = interactionStateFields(body({ action: "ignore_today" }), { userId: USER, now: NOW });
    expect(f.status).toBe("cancelled");
    expect(f.due_date).toBe("2026-07-10");
  });

  it("snooze guarda snoozed_until", () => {
    const f = interactionStateFields(
      body({ action: "snooze", snoozed_until: "2026-07-15" }),
      { userId: USER, now: NOW }
    );
    expect(f.status).toBe("postponed");
    expect(f.snoozed_until).toBe("2026-07-15");
  });
});

describe("buildInteractionInsert / Patch", () => {
  it("insert fija source_type auto y task_key", () => {
    const row = buildInteractionInsert(body({ origin: "tesoreria" }), {
      workspaceId: WS,
      userId: USER,
      now: NOW,
    });
    expect(row.workspace_id).toBe(WS);
    expect(row.source_type).toBe("auto");
    expect(row.task_key).toBe("treasury:due_today");
    expect(row.metadata).toEqual({ origin: "tesoreria" });
  });

  it("patch actualiza updated_at y estado", () => {
    const patch = buildInteractionPatch(body({ action: "complete" }), { userId: USER, now: NOW });
    expect(patch.status).toBe("done");
    expect(patch.updated_at).toBe(NOW.toISOString());
  });
});
