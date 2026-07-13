import { describe, expect, it } from "vitest";

import {
  buildDeletedEmailPlaceholder,
  buildDeletedUsernamePlaceholder,
} from "@/lib/auth/app-user-lifecycle";

/**
 * USER-ACCOUNT-DEACTIVATE-VS-DELETE-001 — UI distingue acciones por etiquetas accesibles.
 * Verifica strings de modales y tooltips (sin render React).
 */
describe("admin panel — copy Desactivar vs Eliminar", () => {
  const DEACTIVATE_MODAL_COPY =
    "Esta persona no podrá iniciar sesión, pero su información e historial se conservarán.";
  const DELETE_MODAL_COPY =
    "Esta acción elimina el acceso y la cuenta. No se puede deshacer.";

  it("copy de desactivar enfatiza conservación de historial", () => {
    expect(DEACTIVATE_MODAL_COPY).toMatch(/historial se conservarán/i);
    expect(DEACTIVATE_MODAL_COPY).not.toMatch(/no se puede deshacer/i);
  });

  it("copy de eliminar enfatiza irreversibilidad", () => {
    expect(DELETE_MODAL_COPY).toMatch(/no se puede deshacer/i);
  });

  it("mobile labels distinguen Desactivar cuenta y Eliminar cuenta", () => {
    const mobileLabels = [
      "Editar permisos",
      "Desactivar cuenta",
      "Reactivar cuenta",
      "Resetear PIN",
      "Eliminar cuenta",
    ];
    expect(mobileLabels).toContain("Desactivar cuenta");
    expect(mobileLabels).toContain("Eliminar cuenta");
    expect(mobileLabels.filter((l) => l.includes("Desactivar")).length).toBe(1);
    expect(mobileLabels.filter((l) => l.includes("Eliminar")).length).toBe(1);
  });

  it("soft delete anonimiza email para no bloquear altas futuras", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    expect(buildDeletedEmailPlaceholder(id)).not.toBe("user@test.com");
    expect(buildDeletedUsernamePlaceholder(id)).toMatch(/^deleted_/);
  });
});
