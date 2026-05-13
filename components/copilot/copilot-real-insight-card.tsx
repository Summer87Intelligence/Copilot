"use client";

import type { CopilotRealInsight } from "@/lib/copilot-real-insights";
import { CopilotCard, CopilotPrimaryLink } from "@/components/copilot/copilot-ui";

function evidenceBlock(insight: CopilotRealInsight): string {
  switch (insight.type) {
    case "deuda_vencida":
      return `Monto vencido: $ ${insight.evidence.amount.toLocaleString("es-AR", { maximumFractionDigits: 0 })} · Hasta ${insight.evidence.days_overdue} días de atraso desde el vencimiento más lejano`;
    case "concentracion_deuda":
      return `Vencido total: $ ${insight.evidence.total_overdue.toLocaleString("es-AR", { maximumFractionDigits: 0 })} · Top 2: $ ${insight.evidence.top2_amount.toLocaleString("es-AR", { maximumFractionDigits: 0 })} (${(insight.evidence.top2_share_pct * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%)`;
    case "obl_fiscal_vencida":
      return `Saldo pendiente: $ ${insight.evidence.amount.toLocaleString("es-AR", { maximumFractionDigits: 0 })} · Venció el ${insight.evidence.due_date} (${insight.evidence.days_overdue} días) · ${insight.evidence.tax_type} · ${insight.evidence.period_label}`;
    case "desbalance_caja":
      return `Caja disponible: $ ${insight.evidence.available_cash.toLocaleString("es-AR", { maximumFractionDigits: 0 })} · Cobranzas esperadas: $ ${insight.evidence.expected_inflows.toLocaleString("es-AR", { maximumFractionDigits: 0 })} · Egresos esperados: $ ${insight.evidence.expected_outflows.toLocaleString("es-AR", { maximumFractionDigits: 0 })} · Balance proyectado: $ ${insight.evidence.projected_balance.toLocaleString("es-AR", { maximumFractionDigits: 0 })} · Riesgo: ${insight.evidence.risk_level}`;
    case "atraso_historico":
      return `${insight.evidence.invoices_count} facturas en la cuenta · ${insight.evidence.overdue_invoices} con vencimiento vencido y saldo · Comportamiento: ${insight.evidence.payment_behavior}`;
    default:
      return "";
  }
}

const typeLabel: Record<CopilotRealInsight["type"], string> = {
  deuda_vencida: "Deuda vencida",
  concentracion_deuda: "Concentración de deuda",
  obl_fiscal_vencida: "Obligación fiscal vencida",
  desbalance_caja: "Desbalance de caja",
  atraso_historico: "Atraso histórico de pago",
};

export function CopilotRealInsightCard({ insight }: { insight: CopilotRealInsight }) {
  return (
    <CopilotCard className="space-y-2 border-[var(--copilot-border)] bg-white/90 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            {typeLabel[insight.type]}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-[var(--copilot-ink)]">
            {insight.company_name}
          </p>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
          Impacto operativo
        </span>
      </div>
      <p className="text-sm font-medium text-[var(--copilot-accent)]">{insight.message}</p>
      <p className="text-xs leading-relaxed text-[var(--copilot-ink)]">{evidenceBlock(insight)}</p>
      <p className="text-[11px] text-[var(--copilot-ink-muted)]">{insight.basedOnLine}</p>
      <div className="flex justify-end border-t border-[var(--copilot-border)] pt-2">
        <CopilotPrimaryLink href={insight.href} className="inline-flex min-w-[7.5rem] justify-center px-3 py-1.5 text-xs">
          {insight.action}
        </CopilotPrimaryLink>
      </div>
    </CopilotCard>
  );
}
