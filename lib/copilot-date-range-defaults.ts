/**
 * Defaults de rango para inputs `<input type="date">` (YYYY-MM-DD, calendario local).
 *
 * Usado por Cartera y otras vistas que precargan "mes actual → hoy" sin
 * disparar fetch hasta que el usuario confirma.
 *
 * IMPORTANTE (hidratación SSR/cliente): el "hoy" DEBE derivarse de la fecha
 * canónica de Montevideo (`todayYmdMontevideo`), no de `new Date()` en la zona
 * del runtime. El SSR de Vercel corre en UTC y el navegador en la zona del
 * usuario; usar `new Date().getDate()` produce un "hoy" distinto entre servidor
 * y cliente en la franja nocturna de Uruguay (p.ej. 23:xx UY = 02:xx UTC del
 * día siguiente), lo que genera texto divergente y el hydration mismatch
 * React #418 en Cartera. `todayYmdMontevideo` es idempotente para el mismo
 * instante absoluto en ambos entornos.
 */

import { todayYmdMontevideo } from "@/lib/date/summer87-today";

/** Formatea una fecha local como YYYY-MM-DD (compatible con input type="date"). */
export function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Componentes calendario (año, índice de mes 0-11) de un YYYY-MM-DD. */
function ymdParts(ymd: string): { year: number; monthIndex: number } {
  return {
    year: Number(ymd.slice(0, 4)),
    monthIndex: Number(ymd.slice(5, 7)) - 1,
  };
}

/**
 * Primer día del mes actual → hoy, ambos en la fecha canónica de Montevideo.
 * Determinístico SSR vs cliente (misma salida para el mismo instante).
 */
export function getCurrentMonthToTodayRange(): { from: string; to: string } {
  const to = todayYmdMontevideo();
  return {
    from: `${to.slice(0, 7)}-01`,
    to,
  };
}

/** Mes calendario anterior completo (1 → último día), relativo a Montevideo. */
export function getPreviousMonthRange(): { from: string; to: string } {
  const { year, monthIndex } = ymdParts(todayYmdMontevideo());
  const firstDay = new Date(year, monthIndex - 1, 1);
  const lastDay = new Date(year, monthIndex, 0);
  return {
    from: formatDateInput(firstDay),
    to: formatDateInput(lastDay),
  };
}

/** Primer día del trimestre calendario actual → hoy, relativo a Montevideo. */
export function getCurrentQuarterToTodayRange(): { from: string; to: string } {
  const to = todayYmdMontevideo();
  const { year, monthIndex } = ymdParts(to);
  const quarterStartMonth = Math.floor(monthIndex / 3) * 3;
  const firstDay = new Date(year, quarterStartMonth, 1);
  return {
    from: formatDateInput(firstDay),
    to,
  };
}

/** Etiqueta corta para selector de período, ej. "Junio 2026". */
export function formatPeriodPresetLabel(from: string, to: string): string {
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${from} – ${to}`;
  }
  const sameMonth =
    start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
  if (sameMonth) {
    return start.toLocaleDateString("es-UY", { month: "long", year: "numeric" });
  }
  const startLabel = start.toLocaleDateString("es-UY", { month: "short", year: "numeric" });
  const endLabel = end.toLocaleDateString("es-UY", { month: "short", year: "numeric" });
  return `${startLabel} – ${endLabel}`;
}

export type CarteraPeriodPreset = "current_month" | "previous_month" | "quarter" | "custom";

export function resolveCarteraPeriodPresetRange(
  preset: CarteraPeriodPreset
): { from: string; to: string } | null {
  switch (preset) {
    case "current_month":
      return getCurrentMonthToTodayRange();
    case "previous_month":
      return getPreviousMonthRange();
    case "quarter":
      return getCurrentQuarterToTodayRange();
    case "custom":
      return null;
  }
}
