"use client";

import { useState } from "react";

import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import {
  CopilotCard,
  CopilotPrimaryButton,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-[var(--copilot-border)] bg-white/75 px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-[var(--copilot-ink)]">{label}</p>
        <p className="mt-1 text-sm text-[var(--copilot-ink-muted)]">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition ${
          checked ? "bg-[var(--copilot-accent)]" : "bg-[rgba(44,40,37,0.15)]"
        }`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${
            checked ? "left-7" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}

export default function CopilotPersonalizacionPage() {
  const [alertsOn, setAlertsOn] = useState(true);
  const [alertsCob, setAlertsCob] = useState(true);
  const [alertsProv, setAlertsProv] = useState(false);
  const [kpiCash, setKpiCash] = useState(true);
  const [kpiSales, setKpiSales] = useState(true);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        surfaceId="copilot.personalizacion"
        title="Personalización"
        description="Adaptá alertas, umbrales y qué ver en tu panel — sin complejidad técnica."
      />

      <div className="flex-1 space-y-8 overflow-auto px-6 py-8">
        <CopilotCard>
          <CopilotSectionTitle
            title="Alertas"
            subtitle="Activá o silenciá categorías según tu operación."
          />
          <div className="space-y-3">
            <Toggle
              checked={alertsOn}
              onChange={setAlertsOn}
              label="Alertas de liquidez"
              description="Avisos cuando la caja se acerca al piso definido."
            />
            <Toggle
              checked={alertsCob}
              onChange={setAlertsCob}
              label="Alertas de cobranza"
              description="Facturas vencidas y clientes con deuda concentrada."
            />
            <Toggle
              checked={alertsProv}
              onChange={setAlertsProv}
              label="Alertas de proveedores"
              description="Próximamente: condiciones y plazos clave."
            />
          </div>
        </CopilotCard>

        <CopilotCard>
          <CopilotSectionTitle
            title="Sensibilidad"
            subtitle="Qué tan estricto es el copiloto al marcar riesgos."
          />
          <label className="block max-w-md text-sm">
            <span className="text-[var(--copilot-ink-muted)]">Nivel</span>
            <input
              type="range"
              min={1}
              max={5}
              defaultValue={3}
              className="mt-2 w-full accent-[var(--copilot-accent)]"
            />
            <div className="mt-1 flex justify-between text-xs text-[var(--copilot-ink-muted)]">
              <span>Calmado</span>
              <span>Estricto</span>
            </div>
          </label>
        </CopilotCard>

        <CopilotCard>
          <CopilotSectionTitle
            title="Enfoque del negocio"
            subtitle="Ajusta cómo se priorizan las recomendaciones."
          />
          <label className="block max-w-md text-sm">
            <span className="text-[var(--copilot-ink-muted)]">Tipo de empresa</span>
            <select className="mt-1 w-full rounded-xl border border-[var(--copilot-border)] bg-white px-3 py-2 text-sm">
              <option>Distribución / mayorista</option>
              <option>Servicios</option>
              <option>Retail</option>
              <option>Producción</option>
            </select>
          </label>
        </CopilotCard>

        <CopilotCard>
          <CopilotSectionTitle
            title="Widgets del panel"
            subtitle="Qué bloques querés ver primero en el dashboard."
          />
          <div className="space-y-3">
            <Toggle
              checked={kpiCash}
              onChange={setKpiCash}
              label="KPI de caja y ventas"
              description="Tarjetas superiores con números del mes."
            />
            <Toggle
              checked={kpiSales}
              onChange={setKpiSales}
              label="Bloque de escenario actual"
              description="Resumen del estado operativo simulado."
            />
          </div>
        </CopilotCard>

        <CopilotPrimaryButton>Guardar preferencias</CopilotPrimaryButton>
      </div>
    </div>
  );
}
