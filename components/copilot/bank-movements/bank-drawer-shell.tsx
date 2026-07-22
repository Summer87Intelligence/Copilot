"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * FASE BANK-END-TO-END-RECONCILIATION-FLOW-UX-CORRECTION-001 —
 * Overlay de drawer que deja visible el chrome de Banco (tabs sticky z-[70]).
 * Desktop: panel lateral. Mobile: panel full-width.
 *
 * FASE BANK-RECONCILIATION-FULL-SYSTEM-AUDIT-AND-SIMPLIFICATION-001 — el
 * offset superior debe despejar tanto la franja de fecha/salud (~3.25rem)
 * como la barra de tabs sticky (z-[70], ~2.9rem más), porque ambas quedan
 * "pegadas" al tope del mismo contenedor con scroll una vez que el usuario
 * baja la página. Con el offset viejo, el propio header del drawer (título +
 * "Cerrar") quedaba en la misma franja vertical que la barra de tabs y esta,
 * al tener mayor z-index, lo tapaba y bloqueaba el click — reproducido en
 * vivo: "Cerrar" quedaba inalcanzable tras hacer scroll con el drawer abierto.
 *
 * FASE BANK-SIMPLE-ASSOCIATION-PANEL-LAYOUT-FIX-001 — el click-through al
 * contenido de fondo ya estaba bloqueado (el backdrop cubre todo el
 * viewport), pero el body seguía scrolleando detrás del drawer (doble
 * scroll real, verificado en vivo: `document.body` overflow nunca se
 * bloqueaba), Escape no cerraba, el foco podía salirse del drawer por Tab
 * hacia el contenido de fondo, y al cerrar el foco no volvía al botón que
 * abrió el panel. Se monta con un Portal a `document.body` para blindarlo
 * de cualquier ancestro que en el futuro agregue transform/filter/contain
 * (que rompería `position: fixed`), en vez de solo confiar en que hoy no
 * hay ninguno.
 */
export function BankDrawerShell({
  children,
  onBackdropClick,
  zClassName = "z-[60]",
  panelClassName = "w-full max-w-3xl",
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  onBackdropClick?: () => void;
  zClassName?: string;
  panelClassName?: string;
  "aria-label"?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const focusFirst = () => {
      const first = panelRef.current?.querySelector<HTMLElement>(focusableSelector);
      (first ?? panelRef.current)?.focus();
    };
    // Mover el foco adentro del drawer apenas se monta (contrato: nunca dejar
    // el foco "perdido" en el body detrás del backdrop).
    focusFirst();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onBackdropClick?.();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = Array.from(panelRef.current.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (el) => el.offsetParent !== null
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!panelRef.current.contains(document.activeElement)) {
        // El foco escapó del drawer (p. ej. autofocus de un elemento externo) — traerlo de vuelta.
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.removeEventListener("keydown", handleKeyDown, true);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [onBackdropClick]);

  const content = (
    <div
      className={`fixed inset-x-0 bottom-0 top-0 ${zClassName} flex justify-end bg-black/30 pt-[6.5rem] sm:pt-[7rem]`}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Cerrar panel"
        onClick={onBackdropClick}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`relative flex h-full ${panelClassName} flex-col overflow-y-auto border-l border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] shadow-xl focus:outline-none`}
      >
        {children}
      </div>
    </div>
  );

  if (typeof document === "undefined") return content;
  return createPortal(content, document.body);
}
