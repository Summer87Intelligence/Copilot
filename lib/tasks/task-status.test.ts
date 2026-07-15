import { describe, expect, it } from "vitest";

import {
  allowedTransitions,
  canTransition,
  isTaskDueToday,
  isTaskOpen,
  isTaskOverdue,
} from "@/lib/tasks/task-status";

const TODAY = "2026-07-15";

describe("canTransition (§14)", () => {
  it("pendiente → en curso / completada / cancelada", () => {
    expect(canTransition("pending", "in_progress")).toBe(true);
    expect(canTransition("pending", "done")).toBe(true);
    expect(canTransition("pending", "cancelled")).toBe(true);
  });
  it("en curso → completada / pendiente / cancelada", () => {
    expect(canTransition("in_progress", "done")).toBe(true);
    expect(canTransition("in_progress", "pending")).toBe(true);
    expect(canTransition("in_progress", "cancelled")).toBe(true);
  });
  it("completada → reabrir (pending/in_progress)", () => {
    expect(canTransition("done", "pending")).toBe(true);
    expect(canTransition("done", "in_progress")).toBe(true);
  });
  it("mismo estado es idempotente", () => {
    expect(canTransition("done", "done")).toBe(true);
  });
  it("transiciones inválidas se rechazan", () => {
    expect(canTransition("cancelled", "done")).toBe(false);
    expect(canTransition("done", "cancelled")).toBe(false);
  });
  it("allowedTransitions devuelve el set esperado", () => {
    expect([...allowedTransitions("pending")]).toEqual(["in_progress", "done", "cancelled"]);
  });
});

describe("isTaskOverdue (Montevideo §16)", () => {
  it("ayer vencida está atrasada", () => {
    expect(isTaskOverdue({ due_date: "2026-07-14", status: "pending" }, TODAY)).toBe(true);
  });
  it("hoy NO está atrasada", () => {
    expect(isTaskOverdue({ due_date: TODAY, status: "pending" }, TODAY)).toBe(false);
  });
  it("mañana NO está atrasada", () => {
    expect(isTaskOverdue({ due_date: "2026-07-16", status: "in_progress" }, TODAY)).toBe(false);
  });
  it("completada nunca está atrasada", () => {
    expect(isTaskOverdue({ due_date: "2026-07-01", status: "done" }, TODAY)).toBe(false);
  });
  it("cancelada nunca está atrasada", () => {
    expect(isTaskOverdue({ due_date: "2026-07-01", status: "cancelled" }, TODAY)).toBe(false);
  });
  it("sin due_date no está atrasada", () => {
    expect(isTaskOverdue({ due_date: null, status: "pending" }, TODAY)).toBe(false);
  });
  it("tolera timestamps ISO", () => {
    expect(isTaskOverdue({ due_date: "2026-07-14T00:00:00Z", status: "pending" }, TODAY)).toBe(true);
  });
});

describe("isTaskDueToday", () => {
  it("vence hoy y está abierta", () => {
    expect(isTaskDueToday({ due_date: TODAY, status: "pending" }, TODAY)).toBe(true);
  });
  it("vence hoy pero completada → no", () => {
    expect(isTaskDueToday({ due_date: TODAY, status: "done" }, TODAY)).toBe(false);
  });
});

describe("isTaskOpen", () => {
  it("pending / in_progress abiertas", () => {
    expect(isTaskOpen({ status: "pending" })).toBe(true);
    expect(isTaskOpen({ status: "in_progress" })).toBe(true);
    expect(isTaskOpen({ status: "done" })).toBe(false);
    expect(isTaskOpen({ status: "cancelled" })).toBe(false);
  });
});
