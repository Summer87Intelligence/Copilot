import type {
  PlannedCashObligationInput,
  PlannedObligationType,
  TreasuryCurrencyCode,
} from "@/lib/treasury/treasury-types";

export const RECURRING_OBLIGATION_TYPES = [
  "monthly",
  "quarterly",
  "yearly",
  "custom",
] as const;
export type RecurringObligationType = (typeof RECURRING_OBLIGATION_TYPES)[number];

export type PlannedCashObligationTemplate = {
  id: string;
  workspaceId: string;
  title: string;
  category: string;
  currency: TreasuryCurrencyCode;
  amount: number;
  recurrenceType: RecurringObligationType;
  recurrenceInterval: number;
  nextOccurrenceDate: string;
  autoGenerate: boolean;
  active: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type GeneratedObligationDraft = {
  templateId: string;
  dueDate: string;
  input: PlannedCashObligationInput;
  recurringInstanceKey: string;
};

function parseYmd(ymd: string): Date | null {
  const ms = Date.parse(`${ymd.trim()}T12:00:00.000Z`);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

function formatYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addMonthsUtc(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Normaliza etiquetas UI (español, acentos) para lookup estable. */
export function normalizeRecurringCategoryLabel(category: string): string {
  return category
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Categorías del formulario Recurrentes → `obligation_type` en pagos futuros. */
const RECURRING_UI_CATEGORY_TO_OBLIGATION_TYPE: Record<string, PlannedObligationType> = {
  suscripciones: "service",
  servicios: "service",
  sueldos: "salary",
  proveedores: "supplier",
  alquiler: "rent",
  impuestos: "tax",
  prestamos: "loan",
  otros: "other",
};

export function mapCategoryToObligationType(category: string): PlannedObligationType {
  const normalized = normalizeRecurringCategoryLabel(category);
  const exact = RECURRING_UI_CATEGORY_TO_OBLIGATION_TYPE[normalized];
  if (exact) return exact;

  if (normalized.includes("bps")) return "bps";
  if (normalized.includes("dgi")) return "dgi";
  if (normalized.includes("iva")) return "iva";
  if (normalized.includes("salario") || normalized.includes("sueldo")) return "salary";
  if (normalized.includes("aguinaldo")) return "bonus";
  if (normalized.includes("alquiler")) return "rent";
  if (normalized.includes("prestamo") || normalized.includes("loan")) return "loan";
  if (
    normalized.includes("suscripcion") ||
    normalized.includes("servicio") ||
    normalized.includes("aws") ||
    normalized.includes("openai") ||
    normalized.includes("licencia")
  ) {
    return "service";
  }
  if (normalized.includes("proveedor")) return "supplier";
  if (normalized.includes("impuesto")) return "tax";
  return "other";
}

export function buildNextOccurrence(
  currentDate: string,
  recurrenceType: RecurringObligationType,
  recurrenceInterval: number
): string | null {
  const base = parseYmd(currentDate);
  if (!base) return null;
  const interval = Math.max(1, Math.trunc(recurrenceInterval));

  switch (recurrenceType) {
    case "monthly":
      return formatYmd(addMonthsUtc(base, interval));
    case "quarterly":
      return formatYmd(addMonthsUtc(base, interval * 3));
    case "yearly":
      return formatYmd(addMonthsUtc(base, interval * 12));
    case "custom":
      return formatYmd(addDaysUtc(base, interval));
    default:
      return null;
  }
}

export function createGeneratedObligation(
  template: PlannedCashObligationTemplate,
  dueDate: string
): GeneratedObligationDraft {
  const meta = template.metadata ?? {};
  const direction =
    meta.direction === "income" ? "inflow" : ("outflow" as const);
  const instanceKey = `${template.id}:${dueDate}`;

  return {
    templateId: template.id,
    dueDate,
    input: {
      title: template.title,
      obligationType: mapCategoryToObligationType(template.category),
      direction,
      amountEstimated: template.amount,
      currencyCode: template.currency,
      dueDate,
      status: "planned",
      priority: "medium",
      affectsCashflow: true,
      source: "recurring_rule",
      metadata: {
        recurring_template_id: template.id,
        recurring_instance_key: instanceKey,
        recurring_category: template.category,
        ...(template.metadata ?? {}),
      },
    },
    recurringInstanceKey: instanceKey,
  };
}

/**
 * Fecha que tendría el ciclo mensual de `cursor` (mismo día del mes, con
 * clamp a fin de mes) si cayera dentro del mes de `asOfDate`. Permite
 * detectar el vencimiento del mes en curso cuando el puntero de la
 * plantilla ya quedó adelantado (gap por meses sin generar).
 */
function sameMonthOccurrence(cursorYmd: string, asOfYmd: string): string | null {
  const cursor = parseYmd(cursorYmd);
  const asOf = parseYmd(asOfYmd);
  if (!cursor || !asOf) return null;
  const lastDay = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const day = Math.min(cursor.getUTCDate(), lastDay);
  return formatYmd(
    new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), day, 12))
  );
}

export function generateUpcomingObligations(params: {
  templates: readonly PlannedCashObligationTemplate[];
  asOfDate: string;
  withinDays: number;
}): GeneratedObligationDraft[] {
  const endDate = buildNextOccurrence(params.asOfDate, "custom", params.withinDays) ?? params.asOfDate;
  const drafts: GeneratedObligationDraft[] = [];

  for (const template of params.templates) {
    if (!template.active || !template.autoGenerate) continue;
    const meta = template.metadata ?? {};
    const endsOn =
      typeof meta.ends_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(meta.ends_on)
        ? meta.ends_on
        : null;
    const cursor = template.nextOccurrenceDate;
    const candidates: string[] = [];

    // Vencimiento atrasado del mes en curso: el puntero ya quedó por
    // delante (p.ej. saltó a un mes futuro) pero el ciclo de este mes
    // nunca se generó. Se recupera sin tocar meses anteriores.
    if (template.recurrenceType === "monthly") {
      const currentCycle = sameMonthOccurrence(cursor, params.asOfDate);
      if (currentCycle && currentCycle <= params.asOfDate && currentCycle < cursor) {
        candidates.push(currentCycle);
      }
    }

    if (cursor <= endDate) {
      candidates.push(cursor);
    }

    for (const dueDate of candidates) {
      if (endsOn && dueDate > endsOn) continue;
      drafts.push(createGeneratedObligation(template, dueDate));
    }
  }

  return drafts.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export const RECURRING_OBLIGATION_PRESETS: ReadonlyArray<
  Pick<
    PlannedCashObligationTemplate,
    "title" | "category" | "recurrenceType" | "recurrenceInterval"
  >
> = [
  { title: "BPS", category: "bps", recurrenceType: "monthly", recurrenceInterval: 1 },
  { title: "DGI", category: "dgi", recurrenceType: "monthly", recurrenceInterval: 1 },
  { title: "Salarios", category: "salarios", recurrenceType: "monthly", recurrenceInterval: 1 },
  { title: "Alquiler", category: "alquiler", recurrenceType: "monthly", recurrenceInterval: 1 },
  { title: "AWS", category: "aws", recurrenceType: "monthly", recurrenceInterval: 1 },
  { title: "OpenAI", category: "openai", recurrenceType: "monthly", recurrenceInterval: 1 },
  { title: "Licencias", category: "licencias", recurrenceType: "yearly", recurrenceInterval: 1 },
  { title: "Aguinaldos", category: "aguinaldos", recurrenceType: "yearly", recurrenceInterval: 1 },
];
