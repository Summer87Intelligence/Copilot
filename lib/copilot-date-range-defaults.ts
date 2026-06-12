/**
 * Defaults de rango para inputs `<input type="date">` (YYYY-MM-DD, calendario local).
 *
 * Usado por Cartera y otras vistas que precargan "mes actual → hoy" sin
 * disparar fetch hasta que el usuario confirma.
 */

/** Formatea una fecha local como YYYY-MM-DD (compatible con input type="date"). */
export function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Primer día del mes actual → hoy (ambos en calendario local del runtime). */
export function getCurrentMonthToTodayRange(): { from: string; to: string } {
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  return {
    from: formatDateInput(firstDayOfMonth),
    to: formatDateInput(today),
  };
}

/** Mes calendario anterior completo (1 → último día). */
export function getPreviousMonthRange(): { from: string; to: string } {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
  return {
    from: formatDateInput(firstDay),
    to: formatDateInput(lastDay),
  };
}

/** Primer día del trimestre calendario actual → hoy. */
export function getCurrentQuarterToTodayRange(): { from: string; to: string } {
  const today = new Date();
  const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
  const firstDay = new Date(today.getFullYear(), quarterStartMonth, 1);
  return {
    from: formatDateInput(firstDay),
    to: formatDateInput(today),
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
