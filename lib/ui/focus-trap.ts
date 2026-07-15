/**
 * FASE 7 — Núcleo puro del focus trap (testeable sin DOM real).
 * La lógica de "a qué elemento saltar al presionar Tab" no depende del navegador.
 */

export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Dado el orden de elementos enfocables y el elemento activo, decide a cuál
 * mover al presionar Tab / Shift+Tab. Devuelve el destino SOLO cuando hay que
 * envolver (wrap) o recuperar el foco perdido; null si el navegador ya lo maneja.
 */
export function resolveTabWrap<T>(
  focusables: readonly T[],
  active: T | null,
  shift: boolean
): T | null {
  if (focusables.length === 0) return null;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const insideIndex = active === null ? -1 : focusables.indexOf(active);
  if (insideIndex === -1) return shift ? last : first; // foco fuera del trap → traerlo
  if (shift && active === first) return last;
  if (!shift && active === last) return first;
  return null;
}
