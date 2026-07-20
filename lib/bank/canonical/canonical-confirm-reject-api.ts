/**
 * FASE BANK-CANONICAL-CONFIRM-UI-001 — contratos Zod de los endpoints de
 * confirmación/rechazo de sugerencias operacionales del motor canónico (D).
 */

import { z } from "zod";

const uuid = z.string().uuid();

export const confirmCanonicalSuggestionBodySchema = z.object({
  expectedMovementId: uuid,
  expectedReceiptId: uuid.nullable().optional().default(null),
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
});

export type ConfirmCanonicalSuggestionBody = z.infer<typeof confirmCanonicalSuggestionBodySchema>;

export const rejectCanonicalSuggestionBodySchema = z.object({
  expectedMovementId: uuid,
  reason: z.string().trim().min(3).max(500),
});

export type RejectCanonicalSuggestionBody = z.infer<typeof rejectCanonicalSuggestionBodySchema>;
