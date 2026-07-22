"use client";

import type { ReactNode } from "react";

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
  return (
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
        className={`relative flex h-full ${panelClassName} flex-col overflow-y-auto border-l border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] shadow-xl`}
      >
        {children}
      </div>
    </div>
  );
}
