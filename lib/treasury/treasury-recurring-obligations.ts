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

function mapCategoryToObligationType(category: string): PlannedObligationType {
  const normalized = category.trim().toLowerCase();
  if (normalized.includes("bps")) return "bps";
  if (normalized.includes("dgi")) return "dgi";
  if (normalized.includes("iva")) return "iva";
  if (normalized.includes("salario")) return "salary";
  if (normalized.includes("aguinaldo")) return "bonus";
  if (normalized.includes("alquiler")) return "rent";
  if (normalized.includes("aws") || normalized.includes("openai") || normalized.includes("licencia")) {
    return "service";
  }
  if (normalized.includes("proveedor")) return "supplier";
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
  return {
    templateId: template.id,
    dueDate,
    input: {
      title: template.title,
      obligationType: mapCategoryToObligationType(template.category),
      direction: "outflow",
      amountEstimated: template.amount,
      currencyCode: template.currency,
      dueDate,
      status: "planned",
      priority: "medium",
      affectsCashflow: true,
      source: "recurring_rule",
      metadata: {
        recurring_template_id: template.id,
        recurring_category: template.category,
        ...(template.metadata ?? {}),
      },
    },
  };
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
    let cursor = template.nextOccurrenceDate;
    let guard = 0;

    while (cursor <= endDate && guard < 24) {
      guard += 1;
      if (cursor >= params.asOfDate) {
        drafts.push(createGeneratedObligation(template, cursor));
      }
      const next = buildNextOccurrence(
        cursor,
        template.recurrenceType,
        template.recurrenceInterval
      );
      if (!next || next <= cursor) break;
      cursor = next;
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
