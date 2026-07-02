"use client";

import { useState } from "react";
import { ArrowLeft, ArrowUpRight, ChevronDown, ChevronUp } from "lucide-react";
import {
  HELPDESK_TICKET_TYPE_LABELS,
  HELPDESK_MODULE_KEY_LABELS,
  HELPDESK_STATUSES,
  HELPDESK_STATUS_LABELS,
  getHelpdeskModuleRoute,
  type HelpdeskTicket,
  type HelpdeskStatus,
} from "@/lib/helpdesk-types";
import { HelpdeskStatusBadge, HelpdeskPriorityBadge } from "./helpdesk-status-badge";
import { HelpdeskComments } from "./helpdesk-comments";
import { HelpdeskAttachments } from "./helpdesk-attachments";
import { formatDate } from "./helpdesk-date-utils";
import { copilotCardStandardClass } from "@/components/copilot/ui/copilot-visual-system";

const textareaClass =
  "w-full rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-2 text-sm text-[var(--copilot-text)] placeholder:text-[var(--copilot-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[96px] resize-y";

type Props = {
  ticket: HelpdeskTicket;
  isAdmin: boolean;
  onBack: () => void;
  onStatusChange: (id: string, status: HelpdeskStatus) => Promise<void>;
  onResolutionNoteChange: (id: string, note: string) => Promise<void>;
};

export function HelpdeskTicketDetail({
  ticket,
  isAdmin,
  onBack,
  onStatusChange,
  onResolutionNoteChange,
}: Props) {
  const [updating, setUpdating] = useState(false);
  const [localStatus, setLocalStatus] = useState<HelpdeskStatus>(ticket.status);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [noteInput, setNoteInput] = useState(ticket.resolution_note ?? "");
  const [savedNote, setSavedNote] = useState(ticket.resolution_note ?? "");
  const [noteSaving, setNoteSaving] = useState(false);

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

  const handleSaveNote = async () => {
    setNoteSaving(true);
    try {
      await onResolutionNoteChange(ticket.id, noteInput);
      setSavedNote(noteInput.trim());
    } finally {
      setNoteSaving(false);
    }
  };

  const moduleRoute = getHelpdeskModuleRoute(ticket.module_key);

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

          <div className="flex shrink-0 items-center gap-2">
            {moduleRoute && (
              <a
                href={moduleRoute}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-1.5 text-sm text-[var(--copilot-text)] hover:bg-[var(--copilot-soft-bg)] transition-colors"
              >
                Ir al módulo relacionado
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}

            {isAdmin && (
              <div className="relative">
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
                  <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] py-1 shadow-lg">
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

      {/* Respuesta del equipo — visible para todos cuando hay nota */}
      {savedNote && (
        <div className={`${copilotCardStandardClass} border-emerald-200/70 dark:border-emerald-800/40`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Respuesta del equipo
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--copilot-text)]">
            {savedNote}
          </p>
        </div>
      )}

      {/* Nota de resolución — solo admin puede editar */}
      {isAdmin && (
        <div className={copilotCardStandardClass}>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">
            Nota de resolución
          </p>
          <p className="mb-2 mt-0.5 text-[11px] text-[var(--copilot-muted)]">
            Visible para el usuario como "Respuesta del equipo" cuando el ticket está resuelto, publicado o rechazado.
          </p>
          <textarea
            className={textareaClass}
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            placeholder="Ej: Publicado en la versión 1.2.0. Ahora podés cambiar la moneda desde el banner superior."
            maxLength={2000}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-[var(--copilot-muted)]">
              {noteInput.length}/2000
            </span>
            <button
              type="button"
              onClick={() => void handleSaveNote()}
              disabled={noteSaving || noteInput.trim() === savedNote}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              {noteSaving ? "Guardando…" : "Guardar nota"}
            </button>
          </div>
        </div>
      )}

      <div className={copilotCardStandardClass}>
        <HelpdeskAttachments ticketId={ticket.id} canUpload={true} />
      </div>

      <div className={copilotCardStandardClass}>
        <HelpdeskComments ticketId={ticket.id} />
      </div>
    </div>
  );
}
