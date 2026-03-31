"use client";

import { useState } from "react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotReadingKey } from "@/components/copilot/copilot-reading-key";
import {
  CopilotCard,
  CopilotGhostButton,
  CopilotPrimaryButton,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { MOCK_COMPANY_NAME } from "@/lib/copilot-mock-data";

export default function CopilotConfiguracionPage() {
  const [currency, setCurrency] = useState("ARS");
  const [alertCash, setAlertCash] = useState("2500000");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        title="Configuración"
        description="Datos de empresa, moneda y umbrales — lo esencial para que el copiloto hable tu idioma."
        readingKey={
          <CopilotReadingKey
            lines={[
              "Ajusto cómo me habla el sistema.",
              "Defino reglas básicas de negocio.",
              "Todo queda alineado a mi operación.",
            ]}
          />
        }
      />

      <div className="flex-1 space-y-8 overflow-auto px-6 py-8">
        <CopilotCard>
          <CopilotSectionTitle title="Empresa" subtitle="Identificación básica." />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-[var(--copilot-ink-muted)]">Razón social</span>
              <input
                readOnly
                className="mt-1 w-full rounded-xl border border-[var(--copilot-border)] bg-white/90 px-3 py-2 text-sm text-[var(--copilot-ink)]"
                value={MOCK_COMPANY_NAME}
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--copilot-ink-muted)]">Rubro</span>
              <input
                readOnly
                className="mt-1 w-full rounded-xl border border-[var(--copilot-border)] bg-white/90 px-3 py-2 text-sm text-[var(--copilot-ink)]"
                value="Distribución mayorista"
              />
            </label>
          </div>
        </CopilotCard>

        <CopilotCard>
          <CopilotSectionTitle title="Moneda y formato" />
          <label className="block max-w-xs text-sm">
            <span className="text-[var(--copilot-ink-muted)]">Moneda principal</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--copilot-border)] bg-white px-3 py-2 text-sm"
            >
              <option value="ARS">Peso argentino (ARS)</option>
              <option value="USD">Dólar (USD)</option>
            </select>
          </label>
        </CopilotCard>

        <CopilotCard>
          <CopilotSectionTitle
            title="Umbrales de alertas"
            subtitle="Valores referenciales para disparar avisos de liquidez."
          />
          <label className="block max-w-sm text-sm">
            <span className="text-[var(--copilot-ink-muted)]">
              Caja mínima deseada (ARS)
            </span>
            <input
              value={alertCash}
              onChange={(e) => setAlertCash(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--copilot-border)] bg-white px-3 py-2 text-sm"
            />
          </label>
          <p className="mt-3 text-xs text-[var(--copilot-ink-muted)]">
            Podés ajustar sensibilidad avanzada en Personalización.
          </p>
        </CopilotCard>

        <div className="flex flex-wrap gap-2">
          <CopilotPrimaryButton>Guardar cambios</CopilotPrimaryButton>
          <CopilotGhostButton>Restablecer</CopilotGhostButton>
        </div>
      </div>
    </div>
  );
}
