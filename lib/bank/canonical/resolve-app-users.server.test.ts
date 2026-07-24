import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { resolveAppUsersById } = await import("@/lib/bank/canonical/resolve-app-users.server");

describe("resolveAppUsersById", () => {
  it("resuelve nombre → email → fallback en un solo .in() (sin N+1)", async () => {
    const inMock = vi.fn().mockResolvedValue({
      data: [
        { id: "u1", full_name: "Camila Pérez", email: "camila@example.com", deleted_at: null, is_active: true },
        { id: "u2", full_name: null, email: "solo@example.com", deleted_at: null, is_active: true },
        { id: "u3", full_name: "  ", email: null, deleted_at: null, is_active: true },
      ],
      error: null,
    });
    const select = vi.fn(() => ({ in: inMock }));
    const from = vi.fn(() => ({ select }));
    const supabase = { from } as never;

    const map = await resolveAppUsersById(supabase, ["u1", "u2", "u3", "u1", "missing"]);

    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("app_users");
    expect(inMock).toHaveBeenCalledWith("id", ["u1", "u2", "u3", "missing"]);
    expect(map.get("u1")!.label).toBe("Camila Pérez");
    expect(map.get("u2")!.label).toBe("solo@example.com");
    expect(map.get("u3")!.label).toBe("Usuario del sistema");
    expect(map.get("missing")!.label).toBe("Usuario del sistema");
    expect(map.get("u1")!.label).not.toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("marca usuarios eliminados sin exponer UUID como label", async () => {
    const inMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: "del",
          full_name: "Gone",
          email: "gone@example.com",
          deleted_at: "2026-01-02T00:00:00Z",
          is_active: false,
        },
      ],
      error: null,
    });
    const select = vi.fn(() => ({ in: inMock }));
    const from = vi.fn(() => ({ select }));
    const supabase = { from } as never;

    const map = await resolveAppUsersById(supabase, ["del"]);
    expect(map.get("del")!.kind).toBe("deleted");
    expect(map.get("del")!.label).toBe("Usuario eliminado");
  });
});
