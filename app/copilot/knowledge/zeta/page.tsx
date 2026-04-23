import type { Metadata } from "next";
import { Suspense } from "react";

import { ZetaKnowledgePage } from "@/components/knowledge/zeta-knowledge-page";
import { CopilotCard, CopilotGhostLink, CopilotSectionTitle } from "@/components/copilot/copilot-ui";
import { getCopilotIsSuperadminServer } from "@/lib/copilot-superadmin-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Biblioteca Zeta · Copilot",
  description: "Documentación Zeta en markdown local (solo superadmin).",
};

export default async function ZetaKnowledgeRoutePage() {
  const ok = await getCopilotIsSuperadminServer();
  if (!ok) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-6 p-6">
        <CopilotCard className="max-w-lg">
          <CopilotSectionTitle
            title="Acceso restringido"
            subtitle="La biblioteca de conocimiento Zeta solo está disponible para usuarios con rol superadmin."
          />
          <p className="mt-4 text-sm text-[var(--copilot-ink-muted)]">
            Si necesitás acceso, contactá a un administrador de la plataforma.
          </p>
          <div className="mt-6">
            <CopilotGhostLink href="/copilot">Volver al inicio del Copilot</CopilotGhostLink>
          </div>
        </CopilotCard>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] flex-1 items-center justify-center p-6 text-sm text-[var(--copilot-ink-muted)]">
          Cargando biblioteca…
        </div>
      }
    >
      <ZetaKnowledgePage />
    </Suspense>
  );
}
