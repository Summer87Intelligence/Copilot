import { describe, expect, it, vi } from "vitest";

import {
  addSuggestionNote,
  mapRpcError,
  rejectSuggestion,
  reviewSuggestion,
} from "@/lib/bank/review/bank-review-actions.server";

function rpcClient(result: { data?: unknown; error?: { message?: string; code?: string } | null }) {
  const rpc = vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: { rpc } as any, rpc };
}

describe("mapRpcError — códigos estables", () => {
  it("mapea códigos conocidos a HTTP", () => {
    expect(mapRpcError({ message: "INVALID_ACTOR" })).toEqual({ ok: false, code: "INVALID_ACTOR", httpStatus: 403 });
    expect(mapRpcError({ message: "SUGGESTION_NOT_FOUND" })).toEqual({ ok: false, code: "SUGGESTION_NOT_FOUND", httpStatus: 404 });
    expect(mapRpcError({ message: "SUGGESTION_TERMINAL" }).httpStatus).toBe(409);
    expect(mapRpcError({ message: "REASON_INVALID" }).httpStatus).toBe(422);
  });
  it("función inexistente ⇒ MIGRATION_PENDING", () => {
    expect(mapRpcError({ code: "PGRST202", message: "Could not find the function" }).code).toBe("MIGRATION_PENDING");
  });
  it("desconocido ⇒ ACTION_FAILED 500", () => {
    expect(mapRpcError({ message: "weird" })).toEqual({ ok: false, code: "ACTION_FAILED", httpStatus: 500 });
  });
});

describe("reviewSuggestion", () => {
  it("éxito y pasa parámetros correctos a la RPC", async () => {
    const { client, rpc } = rpcClient({ data: { status: "reviewed", reviewedAt: "t" } });
    const res = await reviewSuggestion(client, "ws", "sug", "actor");
    expect(res).toMatchObject({ ok: true, status: "reviewed" });
    expect(rpc).toHaveBeenCalledWith("review_bank_suggestion_v1", {
      p_workspace_id: "ws",
      p_suggestion_id: "sug",
      p_actor: "actor",
    });
  });
  it("idempotente already_reviewed", async () => {
    const { client } = rpcClient({ data: { status: "already_reviewed" } });
    const res = await reviewSuggestion(client, "ws", "s", "a");
    expect(res.ok && res.status).toBe("already_reviewed");
  });
  it("error scope no permitido → 409", async () => {
    const { client } = rpcClient({ error: { message: "SCOPE_NOT_ALLOWED" } });
    expect(await reviewSuggestion(client, "ws", "s", "a")).toEqual({ ok: false, code: "SCOPE_NOT_ALLOWED", httpStatus: 409 });
  });
});

describe("rejectSuggestion", () => {
  it("éxito con reason", async () => {
    const { client, rpc } = rpcClient({ data: { status: "rejected" } });
    const res = await rejectSuggestion(client, "ws", "s", "a", "duplicado");
    expect(res).toMatchObject({ ok: true, status: "rejected" });
    expect(rpc).toHaveBeenCalledWith("reject_bank_suggestion_v1", {
      p_workspace_id: "ws",
      p_suggestion_id: "s",
      p_actor: "a",
      p_reason: "duplicado",
    });
  });
  it("terminal → 409", async () => {
    const { client } = rpcClient({ error: { message: "SUGGESTION_TERMINAL" } });
    expect((await rejectSuggestion(client, "ws", "s", "a", "x")).ok).toBe(false);
  });
});

describe("addSuggestionNote", () => {
  it("éxito con token", async () => {
    const { client, rpc } = rpcClient({ data: { status: "noted" } });
    const res = await addSuggestionNote(client, "ws", "s", "a", "una nota", "tok-1");
    expect(res).toMatchObject({ ok: true, status: "noted" });
    expect(rpc).toHaveBeenCalledWith("add_bank_suggestion_note_v1", {
      p_workspace_id: "ws",
      p_suggestion_id: "s",
      p_actor: "a",
      p_note: "una nota",
      p_client_token: "tok-1",
    });
  });
  it("nota inválida → 422", async () => {
    const { client } = rpcClient({ error: { message: "NOTE_INVALID" } });
    const res = await addSuggestionNote(client, "ws", "s", "a", "", null);
    expect(res.ok === false && res.httpStatus).toBe(422);
  });
});
