"use client";

import { useEffect, useMemo, useState } from "react";

import { DataFreshnessBanner } from "@/components/copilot/data-freshness-banner";
import { FinancialStatusBadge } from "@/components/copilot/financial-status-badge";
import { FinancialWarningBanner } from "@/components/copilot/financial-warning-banner";
import { CopilotInteractiveText } from "@/components/copilot/copilot-interactive-text";
import { CopilotInsightsEvidenceDrawer } from "@/components/copilot/copilot-insights-evidence-drawer";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotOperationalEmptyState } from "@/components/copilot/copilot-operational-empty-state";
import {
  CopilotCard,
  CopilotBadge,
  CopilotGhostButton,
  copilotPageMainClass,
} from "@/components/copilot/copilot-ui";
import { CopilotTraceMeta } from "@/components/copilot/copilot-trace-meta";
import { COPILOT_EMPTY_COPY } from "@/lib/copilot-empty-state";
import { getProtoInvoices, type DataRow } from "@/lib/copilot-data";
import { deriveFinancialFlags } from "@/lib/derive-financial-flags";
import { FINANCIAL_UX_COPY } from "@/lib/copilot-financial-ux-copy";
import { getFinancialSnapshot } from "@/lib/copilot-financial-engine";
import type { CopilotInsightItem } from "@/lib/copilot-insight-engine";
import { traceFromInsightEngineItem } from "@/lib/copilot-trace-meta";

export function CopilotInsightsClient({ insights }: { insights: CopilotInsightItem[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
  const [invoiceRows, setInvoiceRows] = useState<DataRow[]>([]);
  const [financialAsOfDate, setFinancialAsOfDate] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getProtoInvoices("active"), getFinancialSnapshot()])
      .then(([inv, snap]) => {
        if (!cancelled) {
          setInvoiceRows(inv);
          setFinancialAsOfDate(snap?.as_of_date ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInvoiceRows([]);
          setFinancialAsOfDate(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const externalValidated = false;

  const insightFinancialFlags = useMemo(
    () =>
      deriveFinancialFlags({
        invoices: invoiceRows,
        asOfDate: financialAsOfDate,
        externalFinancialValidation: externalValidated,
      }),
    [invoiceRows, financialAsOfDate, externalValidated]
  );

  const selectedEvidence = useMemo(() => {
    if (!selectedId) return null;
    return insights.find((i) => i.id === selectedId)?.evidence ?? null;
  }, [insights, selectedId]);

  const openEvidence = (id: string) => {
    setSelectedId(id);
    setIsEvidenceOpen(true);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        surfaceId="copilot.insights"
        title="Insights"
        description="Historial del razonamiento del copiloto — transparente, trazable y priorizado."
      />

      <div className={copilotPageMainClass}>
        <div className="mx-auto mb-4 max-w-3xl space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <FinancialStatusBadge flags={insightFinancialFlags} />
            <span className="text-xs text-[var(--copilot-ink-muted)]">
              {insightFinancialFlags.open_invoices_count > 0
                ? `${insightFinancialFlags.open_invoices_count} factura(s) con saldo operativo abierto.`
                : FINANCIAL_UX_COPY.noOpenBalanceNotValidated}
            </span>
          </div>
          <FinancialWarningBanner body={FINANCIAL_UX_COPY.reportWarningBody} />
          <DataFreshnessBanner freshness={insightFinancialFlags} />
        </div>
        {insights.length === 0 ? (
          <div className="mx-auto max-w-3xl">
            <CopilotOperationalEmptyState
              title="Timeline operativo"
              status="Sin eventos con evidencia suficiente en esta carga"
              statusTone="healthy"
              metrics={[
                { label: "Eventos", value: 0 },
                { label: "Alta prioridad", value: 0 },
                { label: "Con respaldo", value: 0 },
                { label: "Entidades", value: 0 },
              ]}
              footnote={COPILOT_EMPTY_COPY.insights.example}
            />
          </div>
        ) : (
          <div className="relative mx-auto max-w-3xl">
            <CopilotTraceMeta
              trace={traceFromInsightEngineItem(insights[0])}
              variant="embed"
              dense
              className="mb-4"
            />
            <div
              className="absolute bottom-0 left-[13px] top-6 w-px bg-[var(--copilot-border)]"
              aria-hidden
            />
            <ul className="space-y-3">
              {insights.map((item) => {
                const evidenceActive = isEvidenceOpen && selectedId === item.id;
                return (
                  <li key={item.id} className="relative flex gap-3 pl-1.5">
                    <div className="relative z-[1] mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--copilot-card-bg)] ring-2 ring-[var(--copilot-border)]">
                      <span className="h-2 w-2 rounded-full bg-[var(--copilot-accent)]" />
                    </div>
                    <CopilotCard
                      className={`flex-1 ${
                        evidenceActive
                          ? "ring-2 ring-[rgba(31,107,74,0.22)]"
                          : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <CopilotBadge
                          tone={
                            item.priority === "Alta"
                              ? "warning"
                              : item.priority === "Media"
                                ? "neutral"
                                : "success"
                          }
                        >
                          Prioridad {item.priority}
                        </CopilotBadge>
                        <CopilotBadge tone="neutral">{item.category}</CopilotBadge>
                        <span className="text-xs text-[var(--copilot-ink-muted)]">
                          {item.date}
                        </span>
                        {evidenceActive ? (
                          <span className="rounded-full bg-[var(--copilot-accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--copilot-accent)]">
                            Respaldo abierto
                          </span>
                        ) : null}
                      </div>
                      <h2 className="mt-2 text-sm font-semibold leading-snug">
                        <CopilotInteractiveText
                          icon="panel"
                          layout="block"
                          className="!font-semibold text-base leading-snug"
                          onClick={() => openEvidence(item.id)}
                        >
                          {item.title}
                        </CopilotInteractiveText>
                      </h2>
                      <p className="mt-1.5 text-xs text-[var(--copilot-ink-muted)]">
                        Estado:{" "}
                        <span className="font-medium text-[var(--copilot-ink)]">
                          {item.status}
                        </span>
                      </p>
                      <div className="mt-2">
                        <CopilotGhostButton
                          className="w-full justify-center sm:w-auto"
                          onClick={() => openEvidence(item.id)}
                        >
                          Ver respaldo
                        </CopilotGhostButton>
                      </div>
                    </CopilotCard>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <CopilotInsightsEvidenceDrawer
        insightId={selectedId}
        evidenceOverride={selectedEvidence}
        isOpen={isEvidenceOpen && selectedId != null}
        onClose={() => setIsEvidenceOpen(false)}
      />
    </div>
  );
}
