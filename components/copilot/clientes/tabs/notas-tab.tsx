"use client";

import { NotebookPen } from "lucide-react";

/**
 * Placeholder útil. El backend de notas internas del cliente queda para una
 * fase futura (ver CLIENT-360-EXECUTIVE-WORKSPACE-001, FASE 13). Por ahora la
 * operativa registra observaciones en Cobranza (gestiones) y Tareas diarias.
 */
export function NotasTab() {
  return (
    <div className="px-5 py-4">
      <div className="rounded-2xl border border-dashed border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-5 py-10 text-center">
        <NotebookPen className="mx-auto h-6 w-6 text-[var(--copilot-ink-muted)]" aria-hidden />
        <p className="mt-3 text-sm font-semibold text-[var(--copilot-ink)]">
          Notas internas del cliente
        </p>
        <p className="mx-auto mt-1 max-w-md text-xs text-[var(--copilot-ink-muted)]">
          Acá vas a poder registrar condiciones especiales, acuerdos y observaciones comerciales.
          Por ahora, dejá las observaciones de seguimiento en la pestaña Cobranza o en Tareas
          diarias.
        </p>
      </div>
    </div>
  );
}
