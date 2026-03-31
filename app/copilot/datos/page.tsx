import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotReadingKey } from "@/components/copilot/copilot-reading-key";
import {
  CopilotCard,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { MOCK_INTEGRATIONS, MOCK_SYNC_LOGS } from "@/lib/copilot-mock-data";

function StatusPill({
  status,
}: {
  status: "conectado" | "pendiente" | "error";
}) {
  const map = {
    conectado: "bg-emerald-100 text-emerald-900",
    pendiente: "bg-slate-100 text-slate-800",
    error: "bg-rose-100 text-rose-900",
  };
  const label = {
    conectado: "Conectado",
    pendiente: "Pendiente",
    error: "Error",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${map[status]}`}
    >
      {label[status]}
    </span>
  );
}

export default function CopilotDatosPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        title="Datos e integraciones"
        description="Origen de la información que alimenta al copiloto — claridad y confianza."
        readingKey={
          <CopilotReadingKey
            lines={[
              "Sé de dónde sale la información.",
              "Confío en las fuentes conectadas.",
              "Sin datos claros, no hay copiloto.",
            ]}
          />
        }
      />

      <div className="flex-1 space-y-8 overflow-auto px-6 py-8">
        <CopilotCard>
          <CopilotSectionTitle
            title="Estado de conexión"
            subtitle="Resumen de fuentes configuradas."
          />
          <p className="text-sm text-[var(--copilot-ink-muted)]">
            Todo operativo para lectura ejecutiva. Las sincronizaciones son
            incrementales cuando hay cambios.
          </p>
        </CopilotCard>

        <div className="grid gap-4 lg:grid-cols-3">
          {MOCK_INTEGRATIONS.map((src) => (
            <CopilotCard key={src.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--copilot-ink)]">
                    {src.name}
                  </p>
                  <p className="mt-2 text-sm text-[var(--copilot-ink-muted)]">
                    {src.detail}
                  </p>
                </div>
                <StatusPill status={src.status} />
              </div>
            </CopilotCard>
          ))}
        </div>

        <CopilotCard>
          <CopilotSectionTitle
            title="Registro de sincronización"
            subtitle="Actividad reciente simulada — útil para auditoría ligera."
          />
          <ul className="divide-y divide-[var(--copilot-border)] rounded-xl border border-[var(--copilot-border)] bg-white/70">
            {MOCK_SYNC_LOGS.map((log) => (
              <li
                key={`${log.time}-${log.message}`}
                className="flex flex-wrap gap-3 px-4 py-3 text-sm"
              >
                <span className="w-14 shrink-0 font-mono text-xs text-[var(--copilot-ink-muted)]">
                  {log.time}
                </span>
                <span className="text-[var(--copilot-ink)]">{log.message}</span>
              </li>
            ))}
          </ul>
        </CopilotCard>
      </div>
    </div>
  );
}
