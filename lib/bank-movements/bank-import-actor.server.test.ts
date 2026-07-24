import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { enrichBankStatementImportsWithActors } = await import(
  "@/lib/bank-movements/bank-import-actor.server"
);
import type { BankStatementImport } from "@/lib/bank-movements/bank-movements-types";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

function row(partial: Partial<BankStatementImport> & Pick<BankStatementImport, "id" | "imported_by">): BankStatementImport {
  return {
    workspace_id: "ws-a",
    bank_name: "Santander",
    account_label: null,
    file_name: "a.pdf",
    file_type: "pdf",
    imported_at: "2026-07-10T12:00:00Z",
    status: "parsed",
    row_count: 1,
    created_at: "2026-07-10T12:00:00Z",
    updated_at: "2026-07-10T12:00:00Z",
    metadata: {},
    ...partial,
  };
}

describe("enrichBankStatementImportsWithActors", () => {
  it("resuelve varios actores en un solo .in() (sin N+1) y no muestra UUID", async () => {
    const inMock = vi.fn().mockResolvedValue({
      data: [
        { id: U1, full_name: "Daniel Odella", email: "d@example.com", deleted_at: null, is_active: true },
        { id: U2, full_name: null, email: "solo@example.com", deleted_at: null, is_active: true },
      ],
      error: null,
    });
    const select = vi.fn(() => ({ in: inMock }));
    const from = vi.fn(() => ({ select }));
    const supabase = { from } as never;

    const enriched = await enrichBankStatementImportsWithActors(supabase, [
      row({ id: "i1", imported_by: U1, file_name: "uno.pdf" }),
      row({ id: "i2", imported_by: U2, file_name: "dos.pdf" }),
      row({ id: "i3", imported_by: U1, file_name: "tres.pdf" }),
    ]);

    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("app_users");
    expect(inMock).toHaveBeenCalledWith("id", [U1, U2]);
    expect(enriched[0]!.actor.displayName).toBe("Daniel Odella");
    expect(enriched[1]!.actor.displayName).toBe("solo@example.com");
    expect(enriched[2]!.actor.displayName).toBe("Daniel Odella");
    expect(enriched.every((r) => !/^[0-9a-f-]{36}$/i.test(r.actor.displayName))).toBe(true);
    // UUID técnico se conserva
    expect(enriched[0]!.imported_by).toBe(U1);
    expect(enriched[0]!.actor.id).toBe(U1);
  });

  it("respeta workspace: no mezcla filas; fallback legible si falta perfil", async () => {
    const missing = "33333333-3333-4333-8333-333333333333";
    const inMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const select = vi.fn(() => ({ in: inMock }));
    const from = vi.fn(() => ({ select }));
    const supabase = { from } as never;

    const enriched = await enrichBankStatementImportsWithActors(supabase, [
      row({ id: "i1", workspace_id: "ws-a", imported_by: missing }),
    ]);

    expect(enriched[0]!.workspace_id).toBe("ws-a");
    expect(enriched[0]!.actor.displayName).toBe("Usuario del sistema");
    expect(enriched[0]!.actor.id).toBe(missing);
  });
});
