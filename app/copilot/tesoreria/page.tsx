import { Suspense } from "react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { TesoreriaShell } from "@/components/copilot/tesoreria/tesoreria-shell";

export const dynamic = "force-dynamic";

export default function TesoreriaPage() {
  return (
    <>
      <CopilotPageHeader
        eyebrow="Summer87 Copilot"
        title="Tesorería"
        description="Caja manual, conciliación bancaria, obligaciones futuras y proyección de liquidez."
      />
      <div className="px-6 pb-12 pt-6">
        <Suspense fallback={<TesoreriaFallback />}>
          <TesoreriaShell />
        </Suspense>
      </div>
    </>
  );
}

function TesoreriaFallback() {
  return (
    <div
      className="rounded-2xl border border-dashed border-[var(--copilot-border)] bg-white/40 p-8 text-center"
      aria-live="polite"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--copilot-ink-muted)]">
        Tesorería
      </p>
      <p className="mt-2 text-sm text-[var(--copilot-ink-muted)]">Cargando módulo de tesorería…</p>
    </div>
  );
}
