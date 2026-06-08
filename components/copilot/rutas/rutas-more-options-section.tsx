"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import {
  COPILOT_UI_STATE_KEYS,
  readCopilotUiBoolean,
  writeCopilotUiBoolean,
} from "@/lib/copilot-ui-state";

type RutasMoreOptionsSectionProps = {
  children: ReactNode;
};

export function RutasMoreOptionsSection({ children }: RutasMoreOptionsSectionProps) {
  const [open, setOpen] = useState(() =>
    readCopilotUiBoolean(COPILOT_UI_STATE_KEYS.rutasMoreOptionsOpen, false)
  );

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      writeCopilotUiBoolean(COPILOT_UI_STATE_KEYS.rutasMoreOptionsOpen, next);
      return next;
    });
  };

  return (
    <section className="rounded-xl border border-[var(--copilot-border)]/70 bg-[var(--copilot-card-bg)]/50">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left"
        aria-expanded={open}
        onClick={toggleOpen}
      >
        <span className="min-w-0">
          <span className="text-[13px] font-semibold text-[var(--copilot-ink)]">Más opciones de Hoy</span>
          <span className="mt-px block text-[11px] text-[var(--copilot-ink-muted)]">
            Atención prioritaria, alertas, recomendaciones y rutas guiadas.
          </span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-[var(--copilot-ink-muted)] transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="space-y-3 border-t border-[var(--copilot-border)]/60 px-2.5 py-2 [&_.mb-3]:mb-1.5 [&_.mt-2]:mt-1 [&_.mt-3]:mt-1.5 [&_.mt-4]:mt-2 [&_.rounded-2xl.border]:p-2.5 [&_.space-y-2]:space-y-1 [&_.space-y-3]:space-y-1.5 [&_.space-y-8]:space-y-3">
          {children}
        </div>
      ) : null}
    </section>
  );
}
