"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Phone, ArrowUpRight, Bell, Clock, Eye, Hourglass } from "lucide-react";
import type { RankedClient, ClientInstruction } from "@/lib/decision-engine/de-types";

type Props = {
  clients: RankedClient[];
  onActionClick?: (client: RankedClient) => void;
  title?: string;
  emptyMessage?: string;
};

const INSTRUCTION_CONFIG: Record<ClientInstruction, { label: string; pill: string; icon: React.ReactNode }> = {
  llamar_hoy:      { label: "Llamar hoy",             pill: "bg-rose-50 text-rose-700 border border-rose-200",     icon: <Phone className="h-3 w-3" /> },
  escalar:         { label: "Escalar",                 pill: "bg-rose-100 text-rose-800 border border-rose-300",    icon: <ArrowUpRight className="h-3 w-3" /> },
  recordatorio:    { label: "Enviar recordatorio",     pill: "bg-amber-50 text-amber-700 border border-amber-200",  icon: <Bell className="h-3 w-3" /> },
  seguimiento:     { label: "Seguimiento esta semana", pill: "bg-blue-50 text-blue-700 border border-blue-200",     icon: <Clock className="h-3 w-3" /> },
  monitorear:      { label: "Monitorear",              pill: "bg-slate-50 text-slate-600 border border-slate-200",  icon: <Eye className="h-3 w-3" /> },
  esperar_promesa: { label: "Esperar fecha prometida", pill: "bg-emerald-50 text-emerald-700 border border-emerald-200", icon: <Hourglass className="h-3 w-3" /> },
};

const BUCKET_LABEL: Record<string, string> = {
  not_due: "No vencida",
  "0-30":  "0-30 días",
  "31-60": "31-60 días",
  "61-90": "61-90 días",
  "90+":   "90+ días",
};

export function ClientPriorityList({ clients, onActionClick, title = "Clientes", emptyMessage = "Sin clientes pendientes." }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (clients.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-surface)] p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)] mb-2">{title}</h3>
        <p className="text-sm text-[var(--copilot-text-muted)]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-surface)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--copilot-border)]">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-text-muted)]">
          {title} <span className="ml-1 text-[var(--copilot-text-secondary)]">({clients.length})</span>
        </h3>
      </div>
      <ul className="divide-y divide-[var(--copilot-border)]">
        {clients.map((client) => {
          const key = `${client.company_id}::${client.currency_code}`;
          const isOpen = expanded === key;
          const cfg = INSTRUCTION_CONFIG[client.instruction];

          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : key)}
                className="w-full text-left px-4 py-3 hover:bg-[var(--copilot-surface-alt)] transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium text-[var(--copilot-text)] truncate">{client.company_name}</span>
                      <span className="text-xs text-[var(--copilot-text-muted)]">{client.currency_code}</span>
                    </div>
                    <p className="text-xs text-[var(--copilot-text-muted)] mt-0.5 line-clamp-1">{client.reason}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.pill}`}>
                      {cfg.icon}
                      <span className="hidden sm:inline">{cfg.label}</span>
                    </span>
                    <span className="text-xs font-bold tabular-nums text-[var(--copilot-text-secondary)] w-6 text-right">
                      {client.score}
                    </span>
                    {isOpen
                      ? <ChevronDown className="h-3.5 w-3.5 text-[var(--copilot-text-muted)]" />
                      : <ChevronRight className="h-3.5 w-3.5 text-[var(--copilot-text-muted)]" />
                    }
                  </div>
                </div>
              </button>

              {isOpen && (
                <div className="px-4 pb-3 pt-1 bg-[var(--copilot-surface-alt)] space-y-3">
                  {/* Amount + aging */}
                  <div className="flex gap-4 flex-wrap text-xs">
                    <div>
                      <span className="text-[var(--copilot-text-muted)]">Pendiente </span>
                      <span className="font-semibold tabular-nums text-[var(--copilot-text)]">
                        {client.currency_code} {client.pending_amount.toLocaleString("es-UY", { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--copilot-text-muted)]">Antigüedad </span>
                      <span className="font-semibold text-[var(--copilot-text)]">
                        {BUCKET_LABEL[client.dominant_bucket] ?? client.dominant_bucket}
                      </span>
                    </div>
                    {client.oldest_days > 0 && (
                      <div>
                        <span className="text-[var(--copilot-text-muted)]">Días máx. vencido </span>
                        <span className="font-semibold text-[var(--copilot-text)]">{client.oldest_days}</span>
                      </div>
                    )}
                  </div>

                  {/* Evidence */}
                  {client.evidence.length > 0 && (
                    <ul className="space-y-1">
                      {client.evidence.map((ev, i) => (
                        <li key={i} className="flex gap-2 text-xs">
                          <span className={`shrink-0 ${ev.is_decisive ? "text-rose-500 font-semibold" : "text-[var(--copilot-text-muted)]"}`}>
                            {ev.label}:
                          </span>
                          <span className="text-[var(--copilot-text-secondary)]">{ev.value}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Active promise */}
                  {client.has_active_promise && client.promise_date && (
                    <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                      Promesa de pago activa para{" "}
                      {new Date(client.promise_date).toLocaleDateString("es-UY", { day: "numeric", month: "short" })}
                      {client.promise_amount && (
                        <> · {client.promise_currency ?? client.currency_code} {client.promise_amount.toLocaleString("es-UY", { maximumFractionDigits: 0 })}</>
                      )}
                    </p>
                  )}

                  {onActionClick && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onActionClick(client); }}
                      className="text-xs font-medium text-[var(--copilot-accent)] hover:underline"
                    >
                      + Registrar acción
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
