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
