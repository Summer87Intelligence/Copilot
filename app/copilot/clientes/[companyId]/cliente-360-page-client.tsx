"use client";

import { Suspense } from "react";

import { CopilotClient360View } from "@/components/copilot/copilot-client-360-view";
import { useParams } from "next/navigation";

export function Cliente360PageClient() {
  const params = useParams();
  const companyId = String(params.companyId ?? "").trim();

  if (!companyId) {
    return (
      <div className="px-6 py-8 text-sm text-[var(--copilot-ink-muted)]">
        Identificador de cliente no válido.
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="px-6 py-8 text-sm text-[var(--copilot-ink-muted)]">Cargando ficha…</div>
      }
    >
      <CopilotClient360View companyId={companyId} />
    </Suspense>
  );
}
