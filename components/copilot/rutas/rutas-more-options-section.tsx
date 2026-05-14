"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

type RutasMoreOptionsSectionProps = {
  children: ReactNode;
};

export function RutasMoreOptionsSection({ children }: RutasMoreOptionsSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-[var(--copilot-border)]/70 bg-white/50">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="min-w-0">
          <span className="text-sm font-semibold text-[var(--copilot-ink)]">Más opciones de Hoy</span>
          <span className="mt-0.5 block text-xs text-[var(--copilot-ink-muted)]">
            Atención prioritaria, alertas, recomendaciones y rutas guiadas.
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--copilot-ink-muted)] transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="space-y-4 border-t border-[var(--copilot-border)]/60 px-3 py-2.5 [&_.mb-3]:mb-2 [&_.mt-2]:mt-1.5 [&_.mt-3]:mt-2 [&_.mt-4]:mt-2.5 [&_.rounded-2xl.border]:p-3 [&_.space-y-2]:space-y-1.5 [&_.space-y-3]:space-y-2 [&_.space-y-8]:space-y-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}
