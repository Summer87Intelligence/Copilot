"use client";

import { useParams } from "next/navigation";

import { CopilotClient360View } from "@/components/copilot/copilot-client-360-view";

/**
 * Ficha Cliente 360 — estado de cuenta + contexto comercial (solo datos persistidos en Copilot).
 */
export default function CopilotCliente360Page() {
  const params = useParams();
  const companyId = String(params.companyId ?? "").trim();

  if (!companyId) {
    return (
      <div className="px-6 py-8 text-sm text-[var(--copilot-ink-muted)]">
        Identificador de cliente no válido.
      </div>
    );
  }

  return <CopilotClient360View companyId={companyId} />;
}
