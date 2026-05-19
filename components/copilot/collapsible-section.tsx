"use client";

import { useState, useLayoutEffect, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";

type CollapsibleSectionProps = {
  /** Unique id used as localStorage key `cartera-section-{id}`. */
  id: string;
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  /** "primary" = top-level block (card with shadow). "secondary" = sub-section inside a primary. */
  variant?: "primary" | "secondary";
};

/**
 * Reusable collapsible section for /copilot/cartera.
 * - Persists open/closed state in localStorage (client-side only, SSR-safe).
 * - Animates with framer-motion; respects prefers-reduced-motion.
 * - Nested usage: primary sections can contain secondary sections.
 */
export function CollapsibleSection({
  id,
  title,
  subtitle,
  defaultOpen = false,
  children,
  className = "",
  variant = "primary",
}: CollapsibleSectionProps) {
  const storageKey = `cartera-section-${id}`;
  // Initialize with defaultOpen so SSR and first client render match (no hydration mismatch).
  const [open, setOpen] = useState(defaultOpen);
  const reduce = useReducedMotion();

  // Read persisted preference before paint (same pattern as module-shell.tsx).
  useLayoutEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored !== null) setOpen(stored === "true");
    } catch {
      // localStorage unavailable (private browsing, etc.) — silently ignore.
    }
  }, [storageKey]);

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(storageKey, String(next));
      } catch {}
      return next;
    });
  };

  const isPrimary = variant === "primary";

  // Primary: full card with border/shadow. Secondary: flat accordion row, no card.
  if (!isPrimary) {
    return (
      <div className={`border-t border-[var(--copilot-border)]/60 ${className}`}>
        <button
          type="button"
          aria-expanded={open}
          onClick={toggle}
          className="flex w-full items-center justify-between py-3 text-left focus-visible:outline-none"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--copilot-ink-muted)] transition-colors hover:text-[var(--copilot-ink)]">
              {title}
            </p>
            {subtitle ? (
              <p className="mt-0 text-[12px] text-[var(--copilot-ink-muted)]/80">{subtitle}</p>
            ) : null}
          </div>
          <ChevronDown
            aria-hidden
            className={`ml-2 h-3.5 w-3.5 shrink-0 text-[var(--copilot-ink-muted)]/40 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="body"
              initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              style={{ overflow: "hidden" }}
            >
              <div className="pb-2">{children}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <section
      className={`overflow-hidden rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] shadow-[var(--copilot-shadow)] ${className}`}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-[rgba(44,40,37,0.02)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--copilot-accent)]/40"
      >
        <div className="min-w-0">
          <p className="text-[15px] font-semibold tracking-tight text-[var(--copilot-ink)]">
            {title}
          </p>
          {subtitle ? (
            <p className="mt-0.5 text-[12px] text-[var(--copilot-ink-muted)]/85">{subtitle}</p>
          ) : null}
        </div>
        <ChevronDown
          aria-hidden
          className={`ml-3 h-4 w-4 shrink-0 text-[var(--copilot-ink-muted)]/60 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="space-y-4 border-t border-[var(--copilot-border)] p-5">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
