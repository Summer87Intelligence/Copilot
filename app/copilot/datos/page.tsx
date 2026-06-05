import { Suspense } from "react";

import CopilotDatosPageClient from "./datos-client";
import { isModuleAccessDenied } from "@/lib/auth/server-module-permissions";
import { AccessDeniedCard } from "@/components/copilot/access-denied-card";

/**
 * Segmento servidor: el `Suspense` debe vivir aquí para `useSearchParams` en el cliente
 * (evita resolución incorrecta de módulos RSC/webpack en `page.tsx` marcado como client).
 */
export default async function CopilotDatosPage() {
  if (await isModuleAccessDenied("datos")) return <AccessDeniedCard />;
  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-20 text-sm text-[var(--copilot-ink-muted)]">
          Cargando Datos…
        </div>
      }
    >
      <CopilotDatosPageClient />
    </Suspense>
  );
}
