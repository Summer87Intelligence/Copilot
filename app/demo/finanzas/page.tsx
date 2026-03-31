import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import {
  CopilotCard,
  CopilotPrimaryButton,
  CopilotSectionTitle,
} from "@/components/copilot/copilot-ui";
import { MOCK_FINANCE } from "@/lib/copilot-mock-data";

function BarRow({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div>
      <div className="flex justify-between text-xs text-[var(--copilot-ink-muted)]">
        <span>{label}</span>
        <span>{value} k</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-[rgba(44,40,37,0.08)]">
        <div
          className="h-full rounded-full bg-[var(--copilot-accent)]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function CopilotFinanzasPage() {
  const maxFlow = Math.max(
    ...MOCK_FINANCE.cashFlow.flatMap((w) => [w.in, w.out])
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        title="Finanzas"
        description="Caja, ingresos y gastos en una lectura clara — sin overload de términos contables."
      />

      <div className="flex-1 space-y-8 overflow-auto px-6 py-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <CopilotCard>
            <CopilotSectionTitle
              title="Resumen"
              subtitle="Montos referenciales del período (miles $)."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-white/80 p-4 ring-1 ring-[var(--copilot-border)]">
                <p className="text-xs font-semibold text-[var(--copilot-ink-muted)]">
                  Ingresos operativos
                </p>
                <p className="mt-2 text-2xl font-semibold text-[var(--copilot-ink)]">
                  $ {MOCK_FINANCE.incomeVsExpense.income} M
                </p>
              </div>
              <div className="rounded-xl bg-white/80 p-4 ring-1 ring-[var(--copilot-border)]">
                <p className="text-xs font-semibold text-[var(--copilot-ink-muted)]">
                  Gastos totales
                </p>
                <p className="mt-2 text-2xl font-semibold text-[var(--copilot-ink)]">
                  $ {MOCK_FINANCE.incomeVsExpense.expense} M
                </p>
              </div>
            </div>
            <div className="mt-6">
              <CopilotPrimaryButton className="w-full sm:w-auto">
                Ver detalle de movimientos
              </CopilotPrimaryButton>
            </div>
          </CopilotCard>

          <CopilotCard>
            <CopilotSectionTitle
              title="Ingresos vs gastos"
              subtitle="Balance aproximado del mes."
            />
            <div className="flex h-40 items-end gap-4">
              <div className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full max-w-[100px] rounded-t-xl bg-[var(--copilot-accent)]"
                  style={{
                    height: `${(MOCK_FINANCE.incomeVsExpense.income / 25) * 100}%`,
                    minHeight: "40%",
                  }}
                />
                <span className="text-xs font-medium text-[var(--copilot-ink-muted)]">
                  Ingresos
                </span>
              </div>
              <div className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full max-w-[100px] rounded-t-xl bg-[rgba(44,40,37,0.28)]"
                  style={{
                    height: `${(MOCK_FINANCE.incomeVsExpense.expense / 25) * 100}%`,
                    minHeight: "35%",
                  }}
                />
                <span className="text-xs font-medium text-[var(--copilot-ink-muted)]">
                  Gastos
                </span>
              </div>
            </div>
            <p className="mt-4 text-sm text-[var(--copilot-ink-muted)]">
              Margen estimado del mes:{" "}
              <span className="font-semibold text-[var(--copilot-ink)]">
                {MOCK_FINANCE.marginPct}%
              </span>
            </p>
          </CopilotCard>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <CopilotCard>
            <CopilotSectionTitle
              title="Flujo de caja semanal"
              subtitle="Entradas y salidas aproximadas (miles $)."
            />
            <div className="space-y-4">
              {MOCK_FINANCE.cashFlow.map((w) => (
                <div key={w.label} className="space-y-2">
                  <p className="text-xs font-semibold text-[var(--copilot-ink)]">
                    {w.label}
                  </p>
                  <BarRow label="Entradas" value={w.in} max={maxFlow} />
                  <BarRow label="Salidas" value={w.out} max={maxFlow} />
                </div>
              ))}
            </div>
          </CopilotCard>

          <CopilotCard>
            <CopilotSectionTitle
              title="Evolución mensual"
              subtitle="Ventas netas aproximadas (millones $)."
            />
            <div className="flex h-44 items-end justify-between gap-3 px-1">
              {MOCK_FINANCE.monthly.map((m) => {
                const h = 30 + (m.v / 20) * 70;
                return (
                  <div key={m.m} className="flex flex-1 flex-col items-center gap-2">
                    <div
                      className="w-full max-w-[56px] rounded-t-xl bg-[rgba(90,75,120,0.35)]"
                      style={{ height: `${h}%` }}
                    />
                    <span className="text-xs font-medium text-[var(--copilot-ink-muted)]">
                      {m.m}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-sm text-[var(--copilot-ink-muted)]">
              Tendencia estable con leve aceleración en el último mes.
            </p>
          </CopilotCard>
        </div>
      </div>
    </div>
  );
}
