import { Suspense } from "react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { copilotPageMainClass } from "@/components/copilot/copilot-ui";
import { TesoreriaShell } from "@/components/copilot/tesoreria/tesoreria-shell";
import { isModuleAccessDenied } from "@/lib/auth/server-module-permissions";
import { AccessDeniedCard } from "@/components/copilot/access-denied-card";

export const dynamic = "force-dynamic";

export default async function TesoreriaPage() {
  if (await isModuleAccessDenied("tesoreria")) return <AccessDeniedCard />;
  return (
    <>
      <CopilotPageHeader
        eyebrow="Summer87 Copilot"
        title="Tesorería"
        description="Caja disponible Santander, pagos programados y registros manuales."
      />
      <div className={`${copilotPageMainClass} !space-y-4`}>
        <div className="mx-auto w-full max-w-7xl">
          <Suspense fallback={<TesoreriaFallback />}>
            <TesoreriaShell />
          </Suspense>
        </div>
      </div>
    </>
  );
}

function TesoreriaFallback() {
  return (
    <div
      className="rounded-2xl border border-dashed border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/40 p-5 text-center"
      aria-live="polite"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--copilot-ink-muted)]">
        Tesorería
      </p>
      <p className="mt-2 text-sm text-[var(--copilot-ink-muted)]">Cargando módulo de tesorería…</p>
    </div>
  );
}
