import { z } from "zod";

import {
  MANUAL_CASH_LEDGER_TYPES,
  MANUAL_CASH_MOVEMENT_TYPES,
  PLANNED_OBLIGATION_PRIORITIES,
  PLANNED_OBLIGATION_RECURRENCE,
  PLANNED_OBLIGATION_TYPES,
  TREASURY_ACCOUNT_TYPES,
  TREASURY_CURRENCY_CODES,
} from "@/lib/treasury/treasury-types";

const ymd = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Usá una fecha válida (AAAA-MM-DD).");

const positiveMoney = z
  .string()
  .trim()
  .min(1, "Ingresá un monto.")
  .refine((value) => {
    const n = Number.parseFloat(value.replace(",", "."));
    return Number.isFinite(n) && n > 0;
  }, "El monto debe ser mayor a 0.");

const optionalMoney = z
  .string()
  .trim()
  .optional()
  .refine((value) => {
    if (!value) return true;
    const n = Number.parseFloat(value.replace(",", "."));
    return Number.isFinite(n) && n >= 0;
  }, "Saldo inicial inválido.");

export const treasuryAccountFormSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio."),
  alias: z.string().trim().optional(),
  type: z.enum(TREASURY_ACCOUNT_TYPES, { required_error: "Elegí un tipo de cuenta." }),
  currencyCode: z.enum(TREASURY_CURRENCY_CODES, { required_error: "Elegí una moneda." }),
  bankName: z.string().trim().optional(),
  accountNumber: z.string().trim().optional(),
  initialBalance: optionalMoney,
});

export const manualCashFormSchema = z.object({
  movementType: z.enum(MANUAL_CASH_MOVEMENT_TYPES),
  ledgerType: z.enum(MANUAL_CASH_LEDGER_TYPES),
  accountId: z.string().uuid().optional().or(z.literal("")),
  concept: z.string().trim().min(1, "El concepto es obligatorio."),
  category: z.string().trim().optional(),
  amount: positiveMoney,
  currencyCode: z.enum(TREASURY_CURRENCY_CODES),
  movementDate: ymd,
  tags: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export const obligationFormSchema = z.object({
  title: z.string().trim().min(1, "El título es obligatorio."),
  obligationType: z.enum(PLANNED_OBLIGATION_TYPES),
  amountEstimated: positiveMoney,
  currencyCode: z.enum(TREASURY_CURRENCY_CODES),
  dueDate: ymd,
  recurrence: z.enum(PLANNED_OBLIGATION_RECURRENCE),
  priority: z.enum(PLANNED_OBLIGATION_PRIORITIES),
  notes: z.string().trim().optional(),
});

export type TreasuryAccountFormValues = z.infer<typeof treasuryAccountFormSchema>;
export type ManualCashFormValues = z.infer<typeof manualCashFormSchema>;
export type ObligationFormValues = z.infer<typeof obligationFormSchema>;

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !out[key]) {
      out[key] = issue.message;
    }
  }
  return out;
}

export function parseMoneyInput(value: string): number {
  return Number.parseFloat(value.trim().replace(",", "."));
}

export function buildTreasuryAccountMetadata(values: TreasuryAccountFormValues) {
  const metadata: Record<string, unknown> = {};
  if (values.alias?.trim()) metadata.alias = values.alias.trim();
  if (values.initialBalance?.trim()) {
    metadata.initial_balance = parseMoneyInput(values.initialBalance);
  }
  return Object.keys(metadata).length ? metadata : null;
}

export function readTreasuryAccountAlias(metadata: Record<string, unknown> | null | undefined) {
  const alias = metadata?.alias;
  return typeof alias === "string" && alias.trim() ? alias.trim() : null;
}

export function readTreasuryAccountInitialBalance(
  metadata: Record<string, unknown> | null | undefined
) {
  const raw = metadata?.initial_balance;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number.parseFloat(raw.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
