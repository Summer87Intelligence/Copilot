import { describe, expect, it } from "vitest";

import {
  buildDailyTaskInsert,
  buildDailyTaskPatch,
  dailyTaskCreateBodySchema,
  dailyTaskUpdateBodySchema,
} from "@/lib/daily-tasks/daily-tasks-api";

const WS = "11111111-1111-1111-1111-111111111111";
const USER = "22222222-2222-2222-2222-222222222222";

describe("dailyTaskCreateBodySchema", () => {
  it("acepta una tarea válida", () => {
    const r = dailyTaskCreateBodySchema.safeParse({
      title: "Llamar al cliente",
      module_key: "cobranza",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza workspace_id del cliente", () => {
    const r = dailyTaskCreateBodySchema.safeParse({
      workspace_id: WS,
      title: "x",
      module_key: "cobranza",
    });
    expect(r.success).toBe(false);
  });

  it("rechaza module_key desconocido", () => {
    const r = dailyTaskCreateBodySchema.safeParse({ title: "x", module_key: "inventado" });
    expect(r.success).toBe(false);
  });

  it("rechaza título vacío", () => {
    const r = dailyTaskCreateBodySchema.safeParse({ title: "   ", module_key: "cobranza" });
    expect(r.success).toBe(false);
  });
});

describe("buildDailyTaskInsert", () => {
  it("impone workspace_id y defaults priority/status", () => {
    const row = buildDailyTaskInsert(
      { title: "  Revisar caja  ", module_key: "tesoreria" },
      WS
    );
    expect(row.workspace_id).toBe(WS);
    expect(row.priority).toBe("medium");
    expect(row.status).toBe("pending");
    expect(row.title).toBe("Revisar caja");
    expect(row.description).toBeNull();
  });
});

describe("buildDailyTaskPatch", () => {
  it("completar sella completed_at/completed_by", () => {
    const patch = buildDailyTaskPatch({ status: "done" }, { userId: USER });
    expect(patch.status).toBe("done");
    expect(patch.completed_by).toBe(USER);
    expect(typeof patch.completed_at).toBe("string");
  });

  it("reabrir limpia completed_at/completed_by", () => {
    const patch = buildDailyTaskPatch({ status: "pending" }, { userId: USER });
    expect(patch.status).toBe("pending");
    expect(patch.completed_at).toBeNull();
    expect(patch.completed_by).toBeNull();
  });

  it("editar campos no toca completion", () => {
    const patch = buildDailyTaskPatch({ title: " nueva " }, { userId: USER });
    expect(patch.title).toBe("nueva");
    expect("completed_at" in patch).toBe(false);
  });
});

describe("dailyTaskUpdateBodySchema", () => {
  it("rechaza update vacío", () => {
    expect(dailyTaskUpdateBodySchema.safeParse({}).success).toBe(false);
  });
  it("acepta completar", () => {
    expect(dailyTaskUpdateBodySchema.safeParse({ status: "done" }).success).toBe(true);
  });
});
