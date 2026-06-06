"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import {
  COPILOT_UI_STATE_KEYS,
  readCopilotUiBoolean,
  writeCopilotUiBoolean,
} from "@/lib/copilot-ui-state";

export function RutasAdvancedDetailsSection({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(() =>
    readCopilotUiBoolean(COPILOT_UI_STATE_KEYS.rutasMoreOptionsOpen, false)
  );

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      writeCopilotUiBoolean(COPILOT_UI_STATE_KEYS.rutasMoreOptionsOpen, next);
      return next;
    });
  };

  return (
    <section className="rounded-xl border border-[var(--copilot-border)]/60 bg-white/40">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="min-w-0">
          <span className="text-[12px] font-semibold text-[var(--copilot-ink)]">
            Ver detalles avanzados
          </span>
          <span className="mt-0.5 block text-[11px] text-[var(--copilot-ink-muted)]">
            Automatizaciones, señales técnicas, historial completo y análisis interno.
          </span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-[var(--copilot-ink-muted)] transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="space-y-3.5 border-t border-[var(--copilot-border)]/50 px-3 py-3">
          {children}
        </div>
      ) : null}
    </section>
  );
}
