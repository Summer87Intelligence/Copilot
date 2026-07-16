/**
 * FASE 9E — Serialización del período de Ventas ↔ URL (App Router).
 *
 * Puro y testeable: separa el modelo de período (preset · mes · rango custom)
 * de su representación en query params, para hidratar estado inicial desde la
 * URL y restaurarlo en back/forward sin duplicar lógica en el componente.
 */

import { isValidPeriodPreset, type SalesPeriodPreset } from "@/lib/sales/sales-period";

export type PresetOnly = Exclude<SalesPeriodPreset, "custom">;

/** Estado de período unificado (preset · mes con nombre · rango personalizado). */
export type PeriodState =
  | { kind: "preset"; preset: PresetOnly }
  | { kind: "month"; year: number; month: number }
  | { kind: "custom"; from: string; to: string };

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Serializa el período a query params (`preset` | `year`+`month` | `from`+`to`). */
export function periodToParams(period: PeriodState): URLSearchParams {
  const p = new URLSearchParams();
  if (period.kind === "preset") {
    p.set("preset", period.preset);
  } else if (period.kind === "month") {
    p.set("year", String(period.year));
    p.set("month", String(period.month));
  } else {
    p.set("from", period.from);
    p.set("to", period.to);
  }
  return p;
}

/**
 * Reconstruye el período desde query params. Precedencia: mes con nombre →
 * rango custom → preset. Default seguro `this_month` si nada resuelve.
 */
export function parsePeriodFromParams(sp: URLSearchParams): PeriodState {
  const year = parseInt(sp.get("year") ?? "", 10);
  const month = parseInt(sp.get("month") ?? "", 10);
  if (Number.isFinite(year) && year >= 2020 && Number.isFinite(month) && month >= 1 && month <= 12) {
    return { kind: "month", year, month };
  }
  const from = sp.get("from");
  const to = sp.get("to");
  if (from && to && YMD.test(from) && YMD.test(to)) {
    return { kind: "custom", from, to };
  }
  const preset = sp.get("preset");
  if (isValidPeriodPreset(preset) && preset !== "custom") return { kind: "preset", preset };
  return { kind: "preset", preset: "this_month" };
}

/** Valor del `<select>` para un período (preset · `month:<n>` · `custom`). */
export function periodToSelectValue(period: PeriodState): string {
  if (period.kind === "preset") return period.preset;
  if (period.kind === "month") return `month:${period.month}`;
  return "custom";
}

/** Representación canónica estable para comparar dos períodos (dedupe URL sync). */
export function periodKey(period: PeriodState): string {
  return periodToParams(period).toString();
}
