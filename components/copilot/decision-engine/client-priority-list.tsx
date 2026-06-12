"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Clock, History, Phone, ArrowUpRight, Bell, Eye, Hourglass, FileCheck, CalendarClock } from "lucide-react";
import type { RankedClient, ClientInstruction, DECollectionAction } from "@/lib/decision-engine/de-types";
import type { CollectionActionType, CollectionStatus } from "@/lib/copilot-collection-types";
import { ActionRecommendationBadge } from "./action-recommendation-badge";
import { ClientTimeline } from "./client-timeline";

type QuickActionDefaults = {
  actionType: CollectionActionType;
  status: CollectionStatus;
  notes?: string;
};

type Props = {
  clients: RankedClient[];
  onActionClick?: (client: RankedClient, defaults?: QuickActionDefaults) => void;
  recentActions?: DECollectionAction[];
  title?: string;
  emptyMessage?: string;
};

const INSTRUCTION_CONFIG: Record<ClientInstruction, { label: string; pill: string; icon: React.ReactNode }> = {
  llamar_hoy:      { label: "Llamar hoy",             pill: "bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)] border border-[var(--copilot-danger-border)]",     icon: <Phone className="h-3 w-3" /> },
  escalar:         { label: "Escalar",                 pill: "bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)] border border-[var(--copilot-danger-border)]",    icon: <ArrowUpRight className="h-3 w-3" /> },
  recordatorio:    { label: "Enviar recordatorio",     pill: "bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)] border border-[var(--copilot-warning-border)]",  icon: <Bell className="h-3 w-3" /> },
  seguimiento:     { label: "Seguimiento esta semana", pill: "bg-[var(--copilot-tone-neutral-bg)] text-[var(--copilot-accent)] border border-[var(--copilot-border)]",     icon: <Clock className="h-3 w-3" /> },
  monitorear:      { label: "Monitorear",              pill: "bg-[var(--copilot-soft-bg)] text-[var(--copilot-ink-muted)] border border-[var(--copilot-border)]",  icon: <Eye className="h-3 w-3" /> },
  esperar_promesa: { label: "Esperar fecha prometida", pill: "bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)] border border-[var(--copilot-success-border)]", icon: <Hourglass className="h-3 w-3" /> },
};

const BUCKET_LABEL: Record<string, string> = {
  not_due: "No vencida",
  "0-30":  "0-30 días",
  "31-60": "31-60 días",
  "61-90": "61-90 días",
  "90+":   "90+ días",
};

// Quick action presets
const QUICK_ACTIONS: Array<{
  label: string;
  icon: React.ReactNode;
  defaults: QuickActionDefaults;
}> = [
  {
    label: "Llamé",
    icon: <Phone className="h-3 w-3" />,
    defaults: { actionType: "call", status: "contacted" },
  },
  {
    label: "Prometió",
    icon: <FileCheck className="h-3 w-3" />,
    defaults: { actionType: "payment_promise", status: "promised_payment" },
  },
  {
    label: "Pagó",
    icon: <FileCheck className="h-3 w-3" />,
    defaults: { actionType: "internal_note", status: "paid" },
  },
  {
    label: "Reprogramar",
    icon: <CalendarClock className="h-3 w-3" />,
    defaults: { actionType: "internal_note", status: "pending_review" },
  },
];

export function ClientPriorityList({
  clients,
  onActionClick,
  recentActions = [],
  title = "Clientes",
  emptyMessage = "Sin clientes pendientes.",
}: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Record<string, "recommendation" | "timeline">>({});

  function getTab(key: string): "recommendation" | "timeline" {
    return activeTab[key] ?? "recommendation";
  }

  function setTab(key: string, tab: "recommendation" | "timeline") {
    setActiveTab((prev) => ({ ...prev, [key]: tab }));
  }

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
          const tab = getTab(key);
          const clientActions = recentActions
            .filter((a) => a.company_id === client.company_id)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

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
                <div className="px-4 pb-4 pt-1 bg-[var(--copilot-surface-alt)] space-y-3">
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
                          <span className={`shrink-0 ${ev.is_decisive ? "text-[var(--copilot-danger-text)] font-semibold" : "text-[var(--copilot-text-muted)]"}`}>
                            {ev.label}:
                          </span>
                          <span className="text-[var(--copilot-text-secondary)]">{ev.value}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Active promise */}
                  {client.has_active_promise && client.promise_date && (
                    <p className="text-xs text-[var(--copilot-success-text-strong)] bg-[var(--copilot-tone-positive-bg)] border border-[var(--copilot-success-border)] rounded px-2 py-1">
                      Promesa de pago activa para{" "}
                      {new Date(client.promise_date).toLocaleDateString("es-UY", { day: "numeric", month: "short" })}
                      {client.promise_amount && (
                        <> · {client.promise_currency ?? client.currency_code} {client.promise_amount.toLocaleString("es-UY", { maximumFractionDigits: 0 })}</>
                      )}
                    </p>
                  )}

                  {/* Tab switcher: Recomendación | Historial */}
                  <div className="flex gap-1 border-b border-[var(--copilot-border)] pb-1">
                    <button
                      type="button"
                      onClick={() => setTab(key, "recommendation")}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-t transition-colors ${tab === "recommendation" ? "font-semibold text-[var(--copilot-accent)] border-b-2 border-[var(--copilot-accent)] -mb-px" : "text-[var(--copilot-text-muted)] hover:text-[var(--copilot-text)]"}`}
                    >
                      Recomendación
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab(key, "timeline")}
                      className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-t transition-colors ${tab === "timeline" ? "font-semibold text-[var(--copilot-accent)] border-b-2 border-[var(--copilot-accent)] -mb-px" : "text-[var(--copilot-text-muted)] hover:text-[var(--copilot-text)]"}`}
                    >
                      <History className="h-3 w-3" />
                      Historial
                      {clientActions.length > 0 && (
                        <span className="ml-0.5 text-[10px] bg-[var(--copilot-border)] text-[var(--copilot-text-secondary)] rounded-full px-1.5 py-0.5 leading-none">
                          {clientActions.length}
                        </span>
                      )}
                    </button>
                  </div>

                  {tab === "recommendation" && (
                    <ActionRecommendationBadge
                      recommendation={client.recommendation}
                      risk={client.risk_assessment}
                    />
                  )}

                  {tab === "timeline" && (
                    <ClientTimeline actions={clientActions} />
                  )}

                  {/* Quick actions */}
                  {onActionClick && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-[var(--copilot-border)]">
                      {QUICK_ACTIONS.map((qa) => (
                        <button
                          key={qa.label}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onActionClick(client, qa.defaults);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-[var(--copilot-border)] bg-[var(--copilot-surface)] text-[var(--copilot-text-secondary)] hover:bg-[var(--copilot-surface-hover,var(--copilot-surface-alt))] hover:text-[var(--copilot-text)] transition-colors"
                        >
                          {qa.icon}
                          {qa.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onActionClick(client); }}
                        className="text-xs font-medium text-[var(--copilot-accent)] hover:underline ml-1"
                      >
                        + Registrar acción
                      </button>
                    </div>
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
