"use client";

import { useEffect, useRef } from "react";

import { FOCUSABLE_SELECTOR, resolveTabWrap } from "@/lib/ui/focus-trap";

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute("disabled") && (el.offsetParent !== null || el === document.activeElement)
  );
}

/**
 * FASE 7 — Focus trap para diálogos/drawers.
 *  - mueve el foco al primer enfocable al abrir;
 *  - Tab / Shift+Tab quedan dentro (envuelven);
 *  - Escape invoca onEscape (leído por ref → no reinicia el foco al re-render,
 *    p.ej. mientras se escribe una nota);
 *  - al cerrar, devuelve el foco al disparador previo.
 * Retorna el ref a asignar al contenedor del diálogo.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean, onEscape?: () => void) {
  const ref = useRef<T>(null);
  const escapeRef = useRef(onEscape);

  useEffect(() => {
    escapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const initial = getFocusable(container);
    (initial[0] ?? container).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        escapeRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = getFocusable(container);
      const target = resolveTabWrap(focusables, document.activeElement as HTMLElement | null, e.shiftKey);
      if (target) {
        e.preventDefault();
        target.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      previouslyFocused?.focus?.();
    };
  }, [active]);

  return ref;
}
