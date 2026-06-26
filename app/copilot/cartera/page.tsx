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
import { isModuleAccessDenied } from "@/lib/auth/server-module-permissions";
import { AccessDeniedCard } from "@/components/copilot/access-denied-card";

export const dynamic = "force-dynamic";

export default async function CarteraPage() {
  if (await isModuleAccessDenied("cartera")) return <AccessDeniedCard />;
  return (
    <>
      <CopilotPageHeader
        title="Cartera"
        description="Análisis financiero de deuda, cobros y antigüedad."
      />
      <div className="px-4 pb-12 pt-5 sm:px-6 sm:pt-6 lg:px-8">
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
      className="rounded-2xl border border-dashed border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-5 text-center"
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
