"use client";

import { ChevronRight } from "lucide-react";

import { CopilotCard } from "@/components/copilot/copilot-ui";
import { CopilotDataProvenanceStrip } from "@/components/copilot/copilot-data-provenance-strip";
import { ClientAgentBlock } from "@/components/copilot/clientes/client-agent-block";
import type { Client360Payload } from "@/lib/copilot-client-360";
import type { TimelineEvent } from "@/lib/copilot-client-operational-summary";
import { getDaysLate } from "@/lib/copilot/operating-aging";
import { todayYmdMontevideo } from "@/lib/date/summer87-today";

import { TimelineBlock } from "../client-360-timeline";
import { cleanSerieNumero, formatDateShort } from "../client-360-format";

const RESUMEN_ACTIVITY_LIMIT = 5;
const RESUMEN_LIST_LIMIT = 4;

type TabId =
  | "resumen"
  | "finanzas"
  | "cobranza"
  | "cuenta"
  | "facturas"
  | "cobros"
  | "contactos"
  | "identificacion"
  | "actividad"
  | "notas";

function moneySym(currency: string | null): string {
  return currency === "USD" ? "U$S" : "$";
}

export function ResumenTab({
  data,
  timelineEvents,
  onNavigateTab,
}: {
  data: Client360Payload;
  timelineEvents: TimelineEvent[];
  onNavigateTab: (tab: TabId) => void;
}) {
  const today = todayYmdMontevideo();
  const commercialEvents = timelineEvents.filter((e) => e.kind !== "sync");

  const pendingInvoices = data.invoices
    .filter((inv) => inv.saldo_amount > 0.005)
    .slice(0, RESUMEN_LIST_LIMIT);
  const recentReceipts = data.receipts.slice(0, RESUMEN_LIST_LIMIT);

  return (
    <div className="space-y-4 px-5 py-4">
      <CopilotDataProvenanceStrip
        updatedAt={data.last_sync_at}
        periodLabel="estado actual del cliente"
      />

      <ClientAgentBlock
        data={data}
        onNavigateTab={(tab) => onNavigateTab(tab as TabId)}
        onScrollToAssistant={() => onNavigateTab("cobranza")}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Facturas pendientes recientes */}
        <CopilotCard>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-[var(--copilot-ink)]">Facturas pendientes</p>
            <button
              type="button"
              onClick={() => onNavigateTab("facturas")}
              className="text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
            >
              Ver todas
            </button>
          </div>
          {pendingInvoices.length === 0 ? (
            <p className="text-sm text-[var(--copilot-ink-muted)]">Sin saldo pendiente.</p>
          ) : (
            <ul className="divide-y divide-[var(--copilot-border)]">
              {pendingInvoices.map((inv) => {
                const late = inv.due_date != null && getDaysLate(inv.due_date, today) > 0;
                const sym = moneySym(inv.currency_code);
                return (
                  <li key={inv.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[var(--copilot-ink)]">
                        {cleanSerieNumero(inv.serie_numero)}
                      </p>
                      <p className="text-xs text-[var(--copilot-ink-muted)]">
                        {formatDateShort(inv.issue_date)}
                        {late ? " · Con atraso" : ""}
                      </p>
                    </div>
                    <span className={`tabular-nums text-sm ${late ? "font-semibold text-[var(--copilot-danger-text)]" : "text-[var(--copilot-ink)]"}`}>
                      {`${sym} ${inv.saldo}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CopilotCard>

        {/* Últimos cobros */}
        <CopilotCard>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-[var(--copilot-ink)]">Últimos cobros</p>
            <button
              type="button"
              onClick={() => onNavigateTab("cobros")}
              className="text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
            >
              Ver todos
            </button>
          </div>
          {recentReceipts.length === 0 ? (
            <p className="text-sm text-[var(--copilot-ink-muted)]">Sin cobros registrados.</p>
          ) : (
            <ul className="divide-y divide-[var(--copilot-border)]">
              {recentReceipts.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[var(--copilot-ink)]">
                      {formatDateShort(r.receipt_date)}
                    </p>
                    <p className="truncate text-xs text-[var(--copilot-ink-muted)]">{r.medio ?? "Cobro"}</p>
                  </div>
                  <span className="tabular-nums text-sm font-medium text-[var(--copilot-success-text)]">
                    {`$ ${r.importe.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CopilotCard>
      </div>

      {/* Actividad reciente */}
      <div className="rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-4 shadow-sm">
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--copilot-ink-muted)]">
          Actividad reciente
        </p>
        <TimelineBlock events={timelineEvents} maxEvents={RESUMEN_ACTIVITY_LIMIT} commercialOnly />
        {commercialEvents.length > RESUMEN_ACTIVITY_LIMIT ? (
          <button
            type="button"
            onClick={() => onNavigateTab("actividad")}
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--copilot-accent)] hover:underline"
          >
            Ver actividad completa
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}
