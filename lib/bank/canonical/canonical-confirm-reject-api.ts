/**
 * FASE BANK-CANONICAL-CONFIRM-UI-001 — contratos Zod de los endpoints de
 * confirmación/rechazo de sugerencias operacionales del motor canónico (D).
 *
 * FASE BANK-MANUAL-CANONICAL-MATCH-SELECTION-001 — `confirmCanonicalSuggestionBodySchema`
 * agrega `mode`/`selectedClientId`/`manualReason` (reemplaza `expectedReceiptId`
 * por `selectedReceiptId`, mismo significado en modo "suggested").
 */

import { z } from "zod";

const uuid = z.string().uuid();

export const confirmCanonicalSuggestionBodySchema = z
  .object({
    expectedMovementId: uuid,
    mode: z.enum(["suggested", "manual_reviewed"]).default("suggested"),
    selectedClientId: uuid.nullable().optional().default(null),
    selectedReceiptId: uuid.nullable().optional().default(null),
    invoiceAllocations: z
      .array(
        z.object({
          invoiceId: uuid,
          amount: z.number().positive(),
        })
      )
      .max(50)
      .optional()
      .default([]),
    manualReason: z.string().trim().min(3).max(500).nullable().optional().default(null),
  })
  .refine((body) => body.mode !== "manual_reviewed" || (body.manualReason?.length ?? 0) >= 3, {
    message: "manualReason es obligatorio (3-500 caracteres) cuando mode='manual_reviewed'.",
    path: ["manualReason"],
  });

export type ConfirmCanonicalSuggestionBody = z.infer<typeof confirmCanonicalSuggestionBodySchema>;

export const rejectCanonicalSuggestionBodySchema = z.object({
  expectedMovementId: uuid,
  reason: z.string().trim().min(3).max(500),
});

export type RejectCanonicalSuggestionBody = z.infer<typeof rejectCanonicalSuggestionBodySchema>;
