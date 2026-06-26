"use client";

import { formatDistanceToNow } from "./helpdesk-date-utils";
import {
  HELPDESK_TICKET_TYPE_LABELS,
  HELPDESK_MODULE_KEY_LABELS,
  type HelpdeskTicket,
} from "@/lib/helpdesk-types";
import { HelpdeskStatusBadge, HelpdeskPriorityBadge } from "./helpdesk-status-badge";
import { copilotTableShellClass } from "@/components/copilot/ui/copilot-visual-system";

type Props = {
  tickets: HelpdeskTicket[];
  isAdmin: boolean;
  onSelect: (ticket: HelpdeskTicket) => void;
};

export function HelpdeskTicketList({ tickets, isAdmin, onSelect }: Props) {
  if (tickets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-6 py-16 text-center">
        <p className="text-sm font-medium text-[var(--copilot-text)]">
          Todavía no hay tickets.
        </p>
        <p className="mt-1 text-xs text-[var(--copilot-muted)]">
          Creá el primero para pedir una mejora o reportar un problema.
        </p>
      </div>
    );
  }

  return (
    <div className={copilotTableShellClass}>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--copilot-border)] bg-[var(--copilot-table-header-bg)]">
            <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">
              Título
            </th>
            <th className="hidden px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)] sm:table-cell">
              Tipo
            </th>
            <th className="hidden px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)] md:table-cell">
              Módulo
            </th>
            <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">
              Estado
            </th>
            {isAdmin && (
              <th className="hidden px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)] sm:table-cell">
                Prioridad
              </th>
            )}
            {isAdmin && (
              <th className="hidden px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)] lg:table-cell">
                Usuario
              </th>
            )}
            <th className="hidden px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)] sm:table-cell">
              Fecha
            </th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr
              key={ticket.id}
              onClick={() => onSelect(ticket)}
              className="cursor-pointer border-b border-[var(--copilot-border)] last:border-0 hover:bg-[var(--copilot-soft-bg)] transition-colors"
            >
              <td className="max-w-xs px-4 py-3">
                <p className="truncate font-medium text-[var(--copilot-text)]">{ticket.title}</p>
              </td>
              <td className="hidden px-3 py-3 text-[var(--copilot-muted)] sm:table-cell">
                {HELPDESK_TICKET_TYPE_LABELS[ticket.type]}
              </td>
              <td className="hidden px-3 py-3 text-[var(--copilot-muted)] md:table-cell">
                {ticket.module_key ? HELPDESK_MODULE_KEY_LABELS[ticket.module_key] : "—"}
              </td>
              <td className="px-3 py-3">
                <HelpdeskStatusBadge status={ticket.status} />
              </td>
              {isAdmin && (
                <td className="hidden px-3 py-3 sm:table-cell">
                  <HelpdeskPriorityBadge priority={ticket.priority} />
                </td>
              )}
              {isAdmin && (
                <td className="hidden px-3 py-3 text-xs text-[var(--copilot-muted)] lg:table-cell">
                  {ticket.created_by_name ?? "—"}
                </td>
              )}
              <td className="hidden px-3 py-3 text-xs text-[var(--copilot-muted)] sm:table-cell">
                {formatDistanceToNow(ticket.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
