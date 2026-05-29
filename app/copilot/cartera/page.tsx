/**
 * /copilot/cartera
 * ----------------
 * Centro de cartera financiera (setup inicial — Bloque 1).
 *
 * Server component:
 *  - Renderiza el header server-side (cero JS para texto estático).
 *  - Delega la interactividad al `CarteraShell` cliente.
 *
 * No hace fetch financiero aquí: la fuente única de verdad es el endpoint
 * `/api/copilot/financial-reconciliation`, consumido por `useFinancialReconciliation`
 * dentro del shell cliente. Esto garantiza:
 *  - cero recálculos en frontend
 *  - cero waterfall de datos al cargar
 *  - el botón "Refrescar" del control bar revalida sin recargar la página
 *
 * Cuando Bloque 3 agregue datos server-side adicionales (p.ej. snapshot ejecutivo
 * pre-rendered), se cargarán en paralelo con `Promise.all` antes de pasar props
 * al shell — manteniendo el contrato render-only del cliente.
 */

import { Suspense } from "react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CarteraShell } from "@/components/copilot/cartera-shell";

export const dynamic = "force-dynamic";

export default function CarteraPage() {
  return (
    <>
      <CopilotPageHeader
        eyebrow="Summer87 Copilot"
        title="Cartera"
        description="Análisis financiero de deuda, cobros y antigüedad. Para contactar clientes, usá Clientes o Acciones."
      />
      <div className="px-6 pb-12 pt-6">
        <Suspense fallback={<CarteraInitialFallback />}>
          <CarteraShell />
        </Suspense>
      </div>
    </>
  );
}

function CarteraInitialFallback() {
  return (
    <div
      className="rounded-2xl border border-dashed border-[var(--copilot-border)] bg-white/40 p-8 text-center"
      aria-live="polite"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--copilot-ink-muted)]">
        Cartera
      </p>
      <p className="mt-2 text-sm text-[var(--copilot-ink-muted)]">
        Cargando…
      </p>
    </div>
  );
}
