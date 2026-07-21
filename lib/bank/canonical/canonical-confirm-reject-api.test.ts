import { describe, it, expect } from "vitest";

import { confirmCanonicalSuggestionBodySchema } from "@/lib/bank/canonical/canonical-confirm-reject-api";

/**
 * FASE BANK-CONFIRM-RPC-V3-MIGRATION-CORRECTION-001, sección 7.F (metadata
 * maliciosa) — la defensa real contra un body que intente inyectar
 * workspace/actor/movement/importes/rol vive en este límite: Zod `.object()`
 * (sin `.passthrough()`) descarta silenciosamente cualquier clave no
 * declarada en el schema. Ningún valor enviado por el navegador bajo esas
 * claves llega jamás al adapter ni a la RPC — workspace/actor se derivan
 * siempre de `auth.ctx` (sesión server-side), nunca de `parsed.data`.
 */
const UUID_1 = "11111111-1111-1111-1111-111111111111";
const UUID_2 = "22222222-2222-2222-2222-222222222222";

describe("confirmCanonicalSuggestionBodySchema — retrocompatibilidad modo 'suggested'", () => {
  it("mode por defecto es 'suggested' cuando se omite (llamador anterior a esta fase)", () => {
    const parsed = confirmCanonicalSuggestionBodySchema.parse({ expectedMovementId: UUID_1 });
    expect(parsed.mode).toBe("suggested");
    expect(parsed.manualReason).toBeNull();
  });

  it("acepta el body mínimo de antes de esta fase (solo expectedMovementId + invoiceAllocations)", () => {
    const parsed = confirmCanonicalSuggestionBodySchema.parse({
      expectedMovementId: UUID_1,
      invoiceAllocations: [],
    });
    expect(parsed.selectedClientId).toBeNull();
    expect(parsed.selectedReceiptId).toBeNull();
  });
});

describe("confirmCanonicalSuggestionBodySchema — motivo obligatorio en manual_reviewed", () => {
  it("rechaza manual_reviewed sin manualReason", () => {
    const result = confirmCanonicalSuggestionBodySchema.safeParse({
      expectedMovementId: UUID_1,
      mode: "manual_reviewed",
      selectedClientId: UUID_2,
    });
    expect(result.success).toBe(false);
  });

  it("acepta manual_reviewed con manualReason válido (3-500 caracteres)", () => {
    const result = confirmCanonicalSuggestionBodySchema.safeParse({
      expectedMovementId: UUID_1,
      mode: "manual_reviewed",
      selectedClientId: UUID_2,
      manualReason: "Había varios candidatos",
    });
    expect(result.success).toBe(true);
  });
});

describe("confirmCanonicalSuggestionBodySchema — metadata maliciosa (sección 7.F)", () => {
  it("descarta silenciosamente claves no declaradas (workspaceId, actorId, movementId, amount, currency, role, serviceRole)", () => {
    const malicious = {
      expectedMovementId: UUID_1,
      mode: "suggested" as const,
      // Claves que un body malicioso podría intentar inyectar:
      workspaceId: "attacker-workspace",
      actorId: "attacker-actor",
      actorUserId: "attacker-actor-2",
      movementId: "attacker-movement",
      amount: 999999999,
      currency: "USD",
      role: "superadmin",
      serviceRole: true,
      method: "manual_reviewed",
    };
    const parsed = confirmCanonicalSuggestionBodySchema.parse(malicious);
    const keys = Object.keys(parsed);
    for (const forbidden of ["workspaceId", "actorId", "actorUserId", "movementId", "amount", "currency", "role", "serviceRole", "method"]) {
      expect(keys).not.toContain(forbidden);
    }
    // Solo el conjunto whitelisted sobrevive al parseo.
    expect(keys.sort()).toEqual(
      ["expectedMovementId", "invoiceAllocations", "manualReason", "mode", "selectedClientId", "selectedReceiptId"].sort()
    );
  });

  it("no existe ningún campo 'metadata' en el schema — el adapter construye p_metadata internamente, nunca lo recibe del body", () => {
    const parsed = confirmCanonicalSuggestionBodySchema.parse({
      expectedMovementId: UUID_1,
      mode: "manual_reviewed",
      selectedClientId: UUID_2,
      manualReason: "Cliente incorrecto",
      // Intento de inyectar metadata directamente:
      metadata: { mode: "suggested", proposedClientId: "fake" },
    });
    expect(parsed).not.toHaveProperty("metadata");
  });
});
