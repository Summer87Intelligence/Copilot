/**
 * FASE BANK-FILTERS-KPI-AND-HISTORY-USABILITY-001
 * Período bancario: presets + mes + rango, siempre sobre movement_date (YMD).
 * Zona: America/Montevideo vía todayYmdMontevideo.
 */
import { todayYmdMontevideo } from "@/lib/date/summer87-today";
import {
  formatDateInput,
  getCurrentMonthToTodayRange,
  getPreviousMonthRange,
} from "@/lib/copilot-date-range-defaults";

export type BankPeriodKind = "preset" | "month" | "custom";

export type BankPeriodPresetId =
  | "this_month"
  | "last_month"
  | "last_7_days"
  | "last_30_days"
  | "this_year";

export type BankPeriodState =
  | { kind: "preset"; preset: BankPeriodPresetId }
  | { kind: "month"; year: number; month: number }
  | { kind: "custom"; from: string; to: string };

export type BankPeriodRange = { from: string; to: string; label: string };

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_NAMES_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

export const BANK_PERIOD_PRESET_OPTIONS: ReadonlyArray<{
  value: BankPeriodPresetId;
  label: string;
}> = [
  { value: "this_month", label: "Este mes" },
  { value: "last_month", label: "Mes anterior" },
  { value: "last_7_days", label: "Últimos 7 días" },
  { value: "last_30_days", label: "Últimos 30 días" },
  { value: "this_year", label: "Este año" },
];

function addDaysYmd(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return formatDateInput(d);
}

function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(year, month, 0);
  return formatDateInput(d);
}

export function defaultBankPeriodState(): BankPeriodState {
  return { kind: "preset", preset: "this_month" };
}

export function resolveBankPeriodRange(
  period: BankPeriodState,
  todayYmd: string = todayYmdMontevideo()
): BankPeriodRange {
  if (period.kind === "custom") {
    const from = YMD_RE.test(period.from) ? period.from : todayYmd;
    const to = YMD_RE.test(period.to) ? period.to : todayYmd;
    const [a, b] = from <= to ? [from, to] : [to, from];
    return { from: a, to: b, label: `${a} – ${b}` };
  }

  if (period.kind === "month") {
    const y = period.year;
    const m = Math.min(12, Math.max(1, period.month));
    const from = `${y}-${String(m).padStart(2, "0")}-01`;
    const to = lastDayOfMonth(y, m);
    return {
      from,
      to,
      label: `${MONTH_NAMES_ES[m - 1]} ${y}`,
    };
  }

  switch (period.preset) {
    case "this_month": {
      const { from, to } = getCurrentMonthToTodayRange();
      // Full calendar month for KPI/list (inclusive through last day if past months;
      // for current month use today as end so future days aren't empty noise)
      const monthEnd = lastDayOfMonth(Number(to.slice(0, 4)), Number(to.slice(5, 7)));
      return {
        from,
        to: monthEnd < todayYmd ? monthEnd : todayYmd,
        label: `${MONTH_NAMES_ES[Number(from.slice(5, 7)) - 1]} ${from.slice(0, 4)}`,
      };
    }
    case "last_month": {
      const { from, to } = getPreviousMonthRange();
      return {
        from,
        to,
        label: `${MONTH_NAMES_ES[Number(from.slice(5, 7)) - 1]} ${from.slice(0, 4)}`,
      };
    }
    case "last_7_days":
      return {
        from: addDaysYmd(todayYmd, -6),
        to: todayYmd,
        label: "Últimos 7 días",
      };
    case "last_30_days":
      return {
        from: addDaysYmd(todayYmd, -29),
        to: todayYmd,
        label: "Últimos 30 días",
      };
    case "this_year": {
      const y = todayYmd.slice(0, 4);
      return { from: `${y}-01-01`, to: todayYmd, label: y };
    }
    default:
      return { from: todayYmd, to: todayYmd, label: "Hoy" };
  }
}

/** Inclusive range on movement_date (YYYY-MM-DD). */
export function movementDateInInclusiveRange(
  movementDate: string,
  from: string,
  to: string
): boolean {
  const ymd = movementDate.slice(0, 10);
  if (!YMD_RE.test(ymd)) return false;
  return ymd >= from && ymd <= to;
}

export function bankPeriodSelectValue(period: BankPeriodState): string {
  if (period.kind === "preset") return `preset:${period.preset}`;
  if (period.kind === "month") {
    return `month:${period.year}-${String(period.month).padStart(2, "0")}`;
  }
  return "custom";
}

export function parseBankPeriodSelectValue(value: string): BankPeriodState | null {
  if (value === "custom") return null;
  if (value.startsWith("preset:")) {
    const preset = value.slice("preset:".length) as BankPeriodPresetId;
    if (BANK_PERIOD_PRESET_OPTIONS.some((o) => o.value === preset)) {
      return { kind: "preset", preset };
    }
  }
  const monthMatch = /^month:(\d{4})-(\d{2})$/.exec(value);
  if (monthMatch) {
    return {
      kind: "month",
      year: Number(monthMatch[1]),
      month: Number(monthMatch[2]),
    };
  }
  return null;
}

/** Meses seleccionables desde Enero 2026 (piso operativo) hasta el mes actual Montevideo. */
export function listBankMonthOptions(
  todayYmd: string = todayYmdMontevideo()
): Array<{ value: string; label: string; year: number; month: number }> {
  const year = Number(todayYmd.slice(0, 4));
  const month = Number(todayYmd.slice(5, 7));
  const floorYear = 2026;
  const floorMonth = 1;
  const out: Array<{ value: string; label: string; year: number; month: number }> = [];
  for (let y = year; y >= floorYear; y -= 1) {
    const maxM = y === year ? month : 12;
    const minM = y === floorYear ? floorMonth : 1;
    for (let m = maxM; m >= minM; m -= 1) {
      out.push({
        value: `month:${y}-${String(m).padStart(2, "0")}`,
        label: `${MONTH_NAMES_ES[m - 1]} ${y}`,
        year: y,
        month: m,
      });
    }
  }
  return out;
}

export function periodStateKey(period: BankPeriodState): string {
  if (period.kind === "preset") return `preset:${period.preset}`;
  if (period.kind === "month") {
    return `month:${period.year}-${String(period.month).padStart(2, "0")}`;
  }
  return `custom:${period.from}:${period.to}`;
}
