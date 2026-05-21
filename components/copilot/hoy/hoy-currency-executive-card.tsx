"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { HOY_COPY } from "@/lib/copilot-hoy-ui-contract";
import type { CurrencyExecutiveBlock } from "@/lib/copilot-today-business-pulse";

import { MetricLine } from "./hoy-metric-line";

export function CurrencyExecutiveCard({ block }: { block: CurrencyExecutiveBlock }) {
  const [showAging, setShowAging] = useState(false);
  const ratePct =
    block.collectionRate !== null ? `${Math.round(block.collectionRate * 100)}%` : null;

  const title = block.currency === "USD" ? "Dólares (USD)" : "Pesos (UYU)";
  const debtFooter =
    block.currency === "USD"
      ? `${block.debtorClientsCount} ${block.debtorClientsCount === 1 ? "cliente" : "clientes"} con deuda en USD`
      : `${block.debtorClientsCount} ${block.debtorClientsCount === 1 ? "cliente" : "clientes"} con deuda en UYU`;

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
          helper="Facturas menos notas de crédito."
          amount={block.billedPeriod}
          tone="neutral"
        />
        <MetricLine
          label="Cobrado"
          helper="Cobros aplicados en el período."
          amount={block.collectedPeriod}
          tone="positive"
          suffix={ratePct}
        />
        <MetricLine
          label="Por cobrar"
          helper="Saldo pendiente actual."
          amount={block.pendingCurrent}
          tone="warning"
          empty="Sin saldo pendiente"
        />
        <MetricLine
          label="Vencido +30 días"
          helper="Saldos con más de 30 días de atraso."
          amount={block.overdueCritical30}
          tone="danger"
          empty="Sin mora +30"
        />
      </div>

      {(block.expectedIncomeCurrent || block.expectedIncomeAtRisk) && (
        <div className="mt-3 border-t border-dashed border-[var(--copilot-border)] pt-2">
          <button
            type="button"
            onClick={() => setShowAging((v) => !v)}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1.5 text-left text-[11px] font-medium text-[var(--copilot-ink-muted)] hover:bg-[rgba(44,40,37,0.03)]"
          >
            {HOY_COPY.agingDetailTitle}
            <ChevronDown
              className={`h-3.5 w-3.5 transition ${showAging ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          {showAging ? (
            <div className="mt-2 space-y-0 rounded-lg bg-[rgba(44,40,37,0.03)] px-2 py-1">
              <MetricLine
                label="Al día / 0–30 días"
                amount={block.expectedIncomeCurrent}
                tone="positive"
                empty="—"
              />
              <MetricLine
                label="Vencido +30 días"
                amount={block.expectedIncomeAtRisk}
                tone="danger"
                empty="—"
              />
            </div>
          ) : null}
        </div>
      )}

      {block.debtorClientsCount > 0 ? (
        <p className="mt-3 text-xs font-medium text-[var(--copilot-ink-muted)]">{debtFooter}</p>
      ) : null}
    </div>
  );
}
