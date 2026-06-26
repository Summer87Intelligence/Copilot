"use client";

import { useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import {
  HELPDESK_TICKET_TYPE_LABELS,
  HELPDESK_MODULE_KEY_LABELS,
  HELPDESK_STATUSES,
  HELPDESK_STATUS_LABELS,
  type HelpdeskTicket,
  type HelpdeskStatus,
} from "@/lib/helpdesk-types";
import { HelpdeskStatusBadge, HelpdeskPriorityBadge } from "./helpdesk-status-badge";
import { HelpdeskComments } from "./helpdesk-comments";
import { HelpdeskAttachments } from "./helpdesk-attachments";
import { formatDate } from "./helpdesk-date-utils";
import { copilotCardStandardClass } from "@/components/copilot/ui/copilot-visual-system";

type Props = {
  ticket: HelpdeskTicket;
  isAdmin: boolean;
  onBack: () => void;
  onStatusChange: (id: string, status: HelpdeskStatus) => Promise<void>;
};

export function HelpdeskTicketDetail({ ticket, isAdmin, onBack, onStatusChange }: Props) {
  const [updating, setUpdating] = useState(false);
  const [localStatus, setLocalStatus] = useState<HelpdeskStatus>(ticket.status);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const handleStatusChange = async (status: HelpdeskStatus) => {
    if (status === localStatus) return;
    setUpdating(true);
    setShowStatusMenu(false);
    try {
      await onStatusChange(ticket.id, status);
      setLocalStatus(status);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-[var(--copilot-muted)] hover:text-[var(--copilot-text)] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a la lista
        </button>
      </div>

      <div className={copilotCardStandardClass}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-[var(--copilot-text)]">{ticket.title}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <HelpdeskStatusBadge status={localStatus} />
              <HelpdeskPriorityBadge priority={ticket.priority} />
              <span className="text-xs text-[var(--copilot-muted)]">
                {HELPDESK_TICKET_TYPE_LABELS[ticket.type]}
              </span>
              {ticket.module_key && (
                <span className="text-xs text-[var(--copilot-muted)]">
                  · {HELPDESK_MODULE_KEY_LABELS[ticket.module_key]}
                </span>
              )}
            </div>
          </div>

          {isAdmin && (
            <div className="relative shrink-0">
              <button
                onClick={() => setShowStatusMenu((v) => !v)}
                disabled={updating}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-1.5 text-sm text-[var(--copilot-text)] hover:bg-[var(--copilot-soft-bg)] disabled:opacity-50 transition-colors"
              >
                {updating ? "Actualizando…" : "Cambiar estado"}
                {showStatusMenu ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
              {showStatusMenu && (
                <div className="absolute right-0 z-20 mt-1 w-40 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] py-1 shadow-lg">
                  {HELPDESK_STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={() => void handleStatusChange(s)}
                      className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-[var(--copilot-soft-bg)] ${
                        s === localStatus ? "font-semibold text-blue-600" : "text-[var(--copilot-text)]"
                      }`}
                    >
                      {HELPDESK_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-xs text-[var(--copilot-muted)] sm:grid-cols-3">
          <div>
            <span className="font-semibold">Creado por</span>
            <p className="text-[var(--copilot-text)]">{ticket.created_by_name ?? "—"}</p>
          </div>
          <div>
            <span className="font-semibold">Fecha</span>
            <p className="text-[var(--copilot-text)]">{formatDate(ticket.created_at)}</p>
          </div>
          {ticket.assigned_to_name && (
            <div>
              <span className="font-semibold">Asignado a</span>
              <p className="text-[var(--copilot-text)]">{ticket.assigned_to_name}</p>
            </div>
          )}
          {ticket.resolved_at && (
            <div>
              <span className="font-semibold">Resuelto</span>
              <p className="text-[var(--copilot-text)]">{formatDate(ticket.resolved_at)}</p>
            </div>
          )}
        </div>

        <div className="mt-4 border-t border-[var(--copilot-border)] pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">Descripción</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--copilot-text)]">
            {ticket.description}
          </p>
        </div>
      </div>

      <div className={copilotCardStandardClass}>
        <HelpdeskAttachments ticketId={ticket.id} canUpload={true} />
      </div>

      <div className={copilotCardStandardClass}>
        <HelpdeskComments ticketId={ticket.id} />
      </div>
    </div>
  );
}
