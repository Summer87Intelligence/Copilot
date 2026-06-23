import { z } from "zod";

import { todayYmdUtc } from "@/lib/treasury/treasury-db-helpers";
import { TREASURY_CURRENCY_CODES } from "@/lib/treasury/treasury-types";

const optionalNullableUuid = z.union([z.string().uuid(), z.null()]).optional();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD).");

export const cobranzaRegistrarCobroBodySchema = z
  .object({
    company_id: z.string().uuid("company_id debe ser un UUID válido."),
    payment_date: ymd,
    amount: z.number().finite().positive("Monto debe ser > 0."),
    currency_code: z.enum(TREASURY_CURRENCY_CODES),
    bank_origin: z.string().trim().max(120).optional(),
    account_id: optionalNullableUuid,
    reference: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(500).optional(),
    affects_cashflow: z.boolean().optional(),
    client_request_id: z.string().trim().min(1, "client_request_id es requerido."),
  })
  .strict()
  .superRefine((body, ctx) => {
    const today = todayYmdUtc();
    if (body.payment_date > today) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payment_date"],
        message: "La fecha no puede ser futura.",
      });
    }
  });

export type CobranzaRegistrarCobroBody = z.infer<typeof cobranzaRegistrarCobroBodySchema>;
