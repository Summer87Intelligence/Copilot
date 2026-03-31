import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotReadingKey } from "@/components/copilot/copilot-reading-key";
import {
  CopilotCard,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { MOCK_CLIENTS, MOCK_COMPANY_NAME } from "@/lib/copilot-mock-data";

function riskTone(r: string) {
  if (r === "Alto") return "text-rose-800 bg-rose-100/80";
  if (r === "Medio") return "text-amber-900 bg-amber-100/80";
  return "text-emerald-900 bg-emerald-100/80";
}

export default function CopilotClientesPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        title="Clientes"
        description={`Cuentas relevantes para ${MOCK_COMPANY_NAME}: facturación, deuda y riesgo — en lenguaje de negocio.`}
        readingKey={
          <CopilotReadingKey
            lines={[
              "Esto es claro.",
              "Lo entiendo.",
              "Lo usaría.",
            ]}
          />
        }
      />

      <div className="flex-1 space-y-8 overflow-auto px-6 py-8">
        <div className="grid gap-4 lg:grid-cols-3">
          <CopilotCard>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Top clientes
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink)]">
              Metalúrgica Delta y Distribuidora Sur concentran el{" "}
              <span className="font-semibold">40%</span> de la facturación del mes.
            </p>
          </CopilotCard>
          <CopilotCard>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Clientes con deuda
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink)]">
              Tres cuentas con saldo vencido; el{" "}
              <span className="font-semibold">62%</span> del vencido está en dos
              clientes.
            </p>
          </CopilotCard>
          <CopilotCard>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Riesgo de concentración
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink)]">
              Dependencia moderada-alta: revisá condiciones y plan comercial de
              respaldo.
            </p>
          </CopilotCard>
        </div>

        <CopilotCard className="overflow-hidden p-0">
          <div className="border-b border-[var(--copilot-border)] px-5 py-4">
            <CopilotSectionTitle
              title="Cartera activa"
              subtitle="Vista resumida — ordenada por facturación."
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="bg-[rgba(255,255,255,0.65)] text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">Facturación</th>
                  <th className="px-5 py-3">Deuda</th>
                  <th className="px-5 py-3">Riesgo</th>
                  <th className="px-5 py-3">Participación</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_CLIENTS.map((row, i) => (
                  <tr
                    key={row.name}
                    className={
                      i % 2 === 0
                        ? "bg-[var(--copilot-card)]"
                        : "bg-[rgba(255,255,255,0.5)]"
                    }
                  >
                    <td className="px-5 py-3.5 font-medium text-[var(--copilot-ink)]">
                      {row.name}
                    </td>
                    <td className="px-5 py-3.5 text-[var(--copilot-ink-muted)]">
                      {row.billing}
                    </td>
                    <td className="px-5 py-3.5 text-[var(--copilot-ink-muted)]">
                      {row.debt}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${riskTone(row.risk)}`}
                      >
                        {row.risk}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-[var(--copilot-ink-muted)]">
                      {row.share}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CopilotCard>
      </div>
    </div>
  );
}
