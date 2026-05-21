"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import type { CurrencyExecutiveBlock } from "@/lib/copilot-today-business-pulse";

import { MetricLine } from "./hoy-metric-line";

export function CurrencyExecutiveCard({ block }: { block: CurrencyExecutiveBlock }) {
  const [showExpected, setShowExpected] = useState(false);
  const ratePct =
    block.collectionRate !== null ? `${Math.round(block.collectionRate * 100)}%` : null;

  const title = block.currency === "USD" ? "Dólares (USD)" : "Pesos (UYU)";

  return (
    <div className="rounded-2xl border border-[var(--copilot-border)] bg-white p-5 shadow-sm">
      <div className="mb-1 flex items-baseline justify-between gap-2 border-b border-[var(--copilot-border)] pb-3">
        <h3 className="text-base font-bold text-[var(--copilot-ink)]">{title}</h3>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          {block.currency}
        </span>
      </div>

      <div className="divide-y divide-[var(--copilot-border)]/50">
        <MetricLine
          label="Facturado neto"
          helper="Facturas menos notas de crédito del período."
          amount={block.billedPeriod}
          tone="neutral"
        />
        <MetricLine
          label="Cobrado"
          helper="Cobrado en el período"
          amount={block.collectedPeriod}
          tone="positive"
          suffix={ratePct}
        />
        <MetricLine
          label="Falta cobrar"
          helper="Saldo pendiente actual"
          amount={block.pendingCurrent}
          tone="warning"
          empty="Sin saldo pendiente"
        />
        <MetricLine
          label="Crítico +30 días"
          helper="Vencido con más de 30 días"
          amount={block.overdueCritical30}
          tone="danger"
          empty="Sin mora crítica"
        />
      </div>

      {(block.expectedIncome ||
        block.expectedIncomeCurrent ||
        block.expectedIncomeAtRisk) && (
        <div className="mt-3 border-t border-dashed border-[var(--copilot-border)] pt-2">
          <button
            type="button"
            onClick={() => setShowExpected((v) => !v)}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1.5 text-left text-[11px] font-medium text-[var(--copilot-ink-muted)] hover:bg-[rgba(44,40,37,0.03)]"
          >
            Ingresos esperados (detalle)
            <ChevronDown
              className={`h-3.5 w-3.5 transition ${showExpected ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          {showExpected ? (
            <div className="mt-2 space-y-0 rounded-lg bg-[rgba(44,40,37,0.03)] px-2 py-1">
              <MetricLine
                label="Al día (0–30)"
                amount={block.expectedIncomeCurrent}
                tone="positive"
                empty="—"
              />
              <MetricLine
                label="En riesgo (+30)"
                amount={block.expectedIncomeAtRisk}
                tone="danger"
                empty="—"
              />
            </div>
          ) : null}
        </div>
      )}

      <p className="mt-3 text-[11px] text-[var(--copilot-ink-muted)]">
        {block.debtorClientsCount}{" "}
        {block.debtorClientsCount === 1 ? "cliente con deuda activa" : "clientes con deuda activa"}
      </p>
    </div>
  );
}
