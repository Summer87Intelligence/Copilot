import { describe, expect, it } from "vitest";

import {
  buildBankImportActorView,
  isUuidAsPrimaryActorLabel,
} from "@/lib/bank-movements/bank-import-actor";

const UUID = "22535d5c-3c6d-4bc4-a9a1-550132a1819b";

describe("buildBankImportActorView", () => {
  it("actor con nombre completo", () => {
    const view = buildBankImportActorView({
      importedBy: UUID,
      resolved: { id: UUID, fullName: "Daniel Odella", email: "daniel@example.com" },
    });
    expect(view).toMatchObject({
      id: UUID,
      displayName: "Daniel Odella",
      email: "daniel@example.com",
      kind: "user",
    });
    expect(isUuidAsPrimaryActorLabel(view.displayName)).toBe(false);
  });

  it("actor solo con email", () => {
    const view = buildBankImportActorView({
      importedBy: UUID,
      resolved: { id: UUID, fullName: null, email: "solo@example.com" },
    });
    expect(view.displayName).toBe("solo@example.com");
    expect(view.kind).toBe("user");
    expect(isUuidAsPrimaryActorLabel(view.displayName)).toBe(false);
  });

  it("actor eliminado", () => {
    const view = buildBankImportActorView({
      importedBy: UUID,
      resolved: {
        id: UUID,
        fullName: "Ex User",
        email: "ex@example.com",
        deletedAt: "2026-01-01T00:00:00Z",
      },
    });
    expect(view).toMatchObject({
      id: UUID,
      displayName: "Usuario eliminado",
      kind: "deleted",
    });
    expect(isUuidAsPrimaryActorLabel(view.displayName)).toBe(false);
  });

  it("actor automático", () => {
    const view = buildBankImportActorView({
      importedBy: "system",
      metadata: { source: "cron" },
    });
    expect(view.displayName).toBe("Proceso automático");
    expect(view.kind).toBe("system");
  });

  it("actor nulo", () => {
    const view = buildBankImportActorView({ importedBy: null });
    expect(view.displayName).toBe("Usuario no disponible");
    expect(view.kind).toBe("unknown");
    expect(view.id).toBeNull();
  });

  it("UUID no se usa como texto principal aunque falte perfil", () => {
    const view = buildBankImportActorView({ importedBy: UUID, resolved: null });
    expect(view.displayName).toBe("Usuario del sistema");
    expect(view.id).toBe(UUID);
    expect(isUuidAsPrimaryActorLabel(view.displayName)).toBe(false);
  });

  it("metadata legada de nombre/email como fallback", () => {
    const view = buildBankImportActorView({
      importedBy: UUID,
      metadata: { imported_by_name: "Ana Legacy", imported_by_email: "ana@example.com" },
      resolved: null,
    });
    expect(view.displayName).toBe("Ana Legacy");
    expect(view.email).toBe("ana@example.com");
  });

  it("imported_by legado no-UUID se muestra tal cual", () => {
    const view = buildBankImportActorView({ importedBy: "Ana" });
    expect(view).toMatchObject({ displayName: "Ana", kind: "legacy", id: null });
  });

  it("UUID malformado se trata como legado legible sin romper", () => {
    const view = buildBankImportActorView({ importedBy: "not-a-uuid-but-weird" });
    expect(view.displayName).toBe("not-a-uuid-but-weird");
    expect(view.kind).toBe("legacy");
  });
});
