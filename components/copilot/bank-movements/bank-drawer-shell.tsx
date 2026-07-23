"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useLockApplicationScroll } from "@/hooks/use-lock-application-scroll";

/**
 * FASE BANK-END-TO-END-RECONCILIATION-FLOW-UX-CORRECTION-001 —
 * Overlay de drawer que deja visible el chrome de Banco (tabs sticky z-[70]).
 *
 * FASE BANK-RECONCILIATION-FULL-SYSTEM-AUDIT-AND-SIMPLIFICATION-001 — offset
 * superior despeja franja de fecha/salud + tabs sticky.
 *
 * FASE BANK-SIMPLE-ASSOCIATION-PANEL-LAYOUT-FIX-001 — Portal a document.body,
 * Escape, focus trap, restore focus.
 *
 * FASE BANK-ASSOCIATION-DRAWER-SCROLL-ANCHOR-FIX-002 — `useLockApplicationScroll`
 * bloquea html/body/module-scroll owner real; panel `overflow-hidden` con
 * body interno scrolleable (header/footer fijos vía composición del hijo).
 */
export function BankDrawerShell({
  children,
  onBackdropClick,
  zClassName = "z-[60]",
  panelClassName = "w-full max-w-[820px]",
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

  useLockApplicationScroll(true, panelRef);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const focusFirst = () => {
      const first = panelRef.current?.querySelector<HTMLElement>(focusableSelector);
      (first ?? panelRef.current)?.focus();
    };
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
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [onBackdropClick]);

  const content = (
    <div
      className={`fixed inset-x-0 bottom-0 top-0 ${zClassName} flex justify-end bg-black/30 pt-[6.5rem] sm:pt-[7rem]`}
      role="presentation"
      data-bank-drawer-backdrop-root
      style={{ height: "100dvh" }}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Cerrar panel"
        data-bank-drawer-backdrop
        onClick={onBackdropClick}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        data-bank-drawer-panel
        className={`relative flex h-full max-h-[calc(100dvh-6.5rem)] sm:max-h-[calc(100dvh-7rem)] ${panelClassName} flex-col overflow-hidden border-l border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] shadow-xl focus:outline-none`}
      >
        {children}
      </div>
    </div>
  );

  if (typeof document === "undefined") return content;
  return createPortal(content, document.body);
}

/** Header fijo del drawer (no scrollea). */
export function BankDrawerHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div data-bank-drawer-header className={`shrink-0 ${className}`}>
      {children}
    </div>
  );
}

/** Cuerpo scrolleable del drawer (único overflow-y interno). */
export function BankDrawerBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div data-bank-drawer-body className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain ${className}`}>
      {children}
    </div>
  );
}

/** Footer fijo del drawer (acciones siempre visibles). */
export function BankDrawerFooter({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div data-bank-drawer-footer className={`shrink-0 ${className}`}>
      {children}
    </div>
  );
}
