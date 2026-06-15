import type { RecurringObligationTemplateCreateBody } from "@/lib/api/schemas/treasury-api-bodies";
import { frequencyToRecurrenceType } from "@/lib/treasury/treasury-recurring-payments";
import type { TreasuryCurrencyCode } from "@/lib/treasury/treasury-types";

export type RecurringPaymentFormValues = {
  counterparty: string;
  concept: string;
  direction: "income" | "expense";
  category: string;
  currency: TreasuryCurrencyCode;
  amount: string;
  frequency: "weekly" | "monthly" | "yearly";
  dayOfMonth: string;
  startsOn: string;
  endsOn: string;
  notes: string;
};

export type RecurringPaymentFieldErrors = Partial<
  Record<
    | "counterparty"
    | "concept"
    | "category"
    | "currency"
    | "amount"
    | "frequency"
    | "dayOfMonth"
    | "startsOn"
    | "endsOn"
    | "notes",
    string
  >
>;

export function parseRecurringAmount(raw: string): number | null {
  const n = Number.parseFloat(raw.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function composeRecurringTitle(counterparty: string, concept: string): string {
  const cp = counterparty.trim();
  const cn = concept.trim();
  if (cp && cn) return `${cp} — ${cn}`;
  return cn || cp;
}

export function validateRecurringPaymentForm(
  values: RecurringPaymentFormValues
): { ok: true } | { ok: false; fieldErrors: RecurringPaymentFieldErrors; banner: string } {
  const fieldErrors: RecurringPaymentFieldErrors = {};

  if (!values.counterparty.trim() && !values.concept.trim()) {
    const msg = "Completá proveedor/persona o concepto.";
    fieldErrors.counterparty = msg;
    fieldErrors.concept = msg;
  }

  if (!values.category.trim()) {
    fieldErrors.category = "Elegí una categoría.";
  }

  if (!values.currency) {
    fieldErrors.currency = "Elegí una moneda.";
  }

  const amount = parseRecurringAmount(values.amount);
  if (amount == null) {
    fieldErrors.amount = "El monto debe ser mayor a 0.";
  }

  if (values.frequency === "monthly") {
    const day = Number(values.dayOfMonth);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      fieldErrors.dayOfMonth = "El día del mes debe estar entre 1 y 31.";
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.startsOn.trim())) {
    fieldErrors.startsOn = "Fecha de inicio inválida.";
  }

  const endsOn = values.endsOn.trim();
  if (endsOn) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) {
      fieldErrors.endsOn = "Fecha de finalización inválida.";
    } else if (endsOn < values.startsOn.trim()) {
      fieldErrors.endsOn = "La fecha de finalización debe ser igual o posterior al inicio.";
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    const banner = Object.values(fieldErrors)[0] ?? "Revisá los campos marcados.";
    return { ok: false, fieldErrors, banner };
  }

  return { ok: true };
}

export function buildRecurringObligationCreateBody(
  values: RecurringPaymentFormValues
): RecurringObligationTemplateCreateBody {
  const amount = parseRecurringAmount(values.amount)!;
  const recurrenceType = frequencyToRecurrenceType(values.frequency);
  const interval = values.frequency === "weekly" ? 7 : 1;
  const startsOn = values.startsOn.trim();
  let nextOccurrenceDate = startsOn;

  if (values.frequency === "monthly") {
    const day = Math.min(31, Math.max(1, Number(values.dayOfMonth)));
    const [y, m] = startsOn.split("-");
    nextOccurrenceDate = `${y}-${m}-${String(day).padStart(2, "0")}`;
  }

  const counterparty = values.counterparty.trim();
  const concept = values.concept.trim();
  const title = composeRecurringTitle(counterparty, concept);

  return {
    title,
    category: values.category.trim(),
    currency: values.currency,
    amount,
    recurrence_type: recurrenceType,
    recurrence_interval: interval,
    next_occurrence_date: nextOccurrenceDate,
    auto_generate: true,
    active: true,
    metadata: {
      direction: values.direction,
      starts_on: startsOn,
      ends_on: values.endsOn.trim() || null,
      day_of_month:
        values.frequency === "monthly" ? Number(values.dayOfMonth) : null,
      frequency: values.frequency,
      counterparty: counterparty || null,
      concept: concept || null,
      notes: values.notes.trim() || null,
    },
  };
}
