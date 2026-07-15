import { describe, expect, it } from "vitest";

import {
  augmentWriteWithFase7,
  hydrateTaskRow,
  isMissingTableError,
  isUndefinedColumnError,
  stripFase7Columns,
} from "@/lib/tasks/task-row";

describe("hydrateTaskRow", () => {
  it("usa la columna real cuando existe", () => {
    const row = hydrateTaskRow({ visibility: "private", created_by_user_id: "u1", metadata: {} });
    expect(row.visibility).toBe("private");
    expect(row.created_by_user_id).toBe("u1");
  });
  it("cae a metadata cuando la columna no existe (pre-migración)", () => {
    const row = hydrateTaskRow({ metadata: { visibility: "team", created_by_user_id: "u2" } });
    expect(row.visibility).toBe("team");
    expect(row.created_by_user_id).toBe("u2");
  });
  it("default seguro workspace / null", () => {
    const row = hydrateTaskRow({ metadata: {} });
    expect(row.visibility).toBe("workspace");
    expect(row.created_by_user_id).toBeNull();
  });
  it("visibility inválida cae a workspace", () => {
    const row = hydrateTaskRow({ visibility: "weird", metadata: {} });
    expect(row.visibility).toBe("workspace");
  });
});

describe("augmentWriteWithFase7", () => {
  it("escribe columnas y espeja en metadata", () => {
    const out = augmentWriteWithFase7(
      { title: "T", metadata: { origin: "x" } },
      { createdByUserId: "u1", visibility: "team" }
    );
    expect(out.created_by_user_id).toBe("u1");
    expect(out.visibility).toBe("team");
    expect(out.metadata).toMatchObject({ origin: "x", created_by_user_id: "u1", visibility: "team" });
  });
  it("solo toca los campos presentes", () => {
    const out = augmentWriteWithFase7({ metadata: {} }, { createdByUserId: null });
    expect(out.created_by_user_id).toBeNull();
    expect("visibility" in out).toBe(false);
  });
});

describe("stripFase7Columns", () => {
  it("quita created_by_user_id y visibility (fallback pre-migración)", () => {
    const out = stripFase7Columns({ title: "T", created_by_user_id: "u1", visibility: "team", metadata: {} });
    expect("created_by_user_id" in out).toBe(false);
    expect("visibility" in out).toBe(false);
    expect(out.title).toBe("T");
    expect(out.metadata).toEqual({});
  });
});

describe("error predicates", () => {
  it("detecta columna/tabla inexistentes", () => {
    expect(isUndefinedColumnError({ code: "42703" })).toBe(true);
    expect(isMissingTableError({ code: "42P01" })).toBe(true);
    expect(isUndefinedColumnError({ code: "23505" })).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
  });
});
