"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import type { HelpdeskTicket, HelpdeskStatus } from "@/lib/helpdesk-types";
import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { HelpdeskTicketList } from "./helpdesk-ticket-list";
import { HelpdeskTicketForm } from "./helpdesk-ticket-form";
import { HelpdeskTicketDetail } from "./helpdesk-ticket-detail";
import { HelpdeskFilters, type HelpdeskFiltersState } from "./helpdesk-filters";
import { copilotCardStandardClass } from "@/components/copilot/ui/copilot-visual-system";

type Toast = { message: string; ok: boolean };

const DEFAULT_FILTERS: HelpdeskFiltersState = {
  status: "all",
  priority: "all",
  type: "all",
  module_key: "all",
};

type ListResponse = {
  ok: boolean;
  tickets?: HelpdeskTicket[];
  is_admin?: boolean;
  message?: string;
};

export function HelpdeskPageClient() {
  const [tickets, setTickets] = useState<HelpdeskTicket[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<HelpdeskTicket | null>(null);
  const [filters, setFilters] = useState<HelpdeskFiltersState>(DEFAULT_FILTERS);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, ok: boolean) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, ok });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const buildQuery = useCallback((f: HelpdeskFiltersState) => {
    const p = new URLSearchParams();
    if (f.status !== "all") p.set("status", f.status);
    if (f.priority !== "all") p.set("priority", f.priority);
    if (f.type !== "all") p.set("type", f.type);
    if (f.module_key !== "all") p.set("module_key", f.module_key);
    return p.toString() ? `?${p.toString()}` : "";
  }, []);

  const load = useCallback(async (f: HelpdeskFiltersState) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/copilot/helpdesk/tickets${buildQuery(f)}`);
      const json = (await res.json()) as ListResponse;
      if (json.ok) {
        setTickets(json.tickets ?? []);
        setIsAdmin(json.is_admin ?? false);
      }
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => { void load(filters); }, [load, filters]);

  const handleFilterChange = (f: HelpdeskFiltersState) => {
    setFilters(f);
  };

  const handleCreate = async (fd: FormData, files: File[]) => {
    setFormLoading(true);
    try {
      const body = {
        title: fd.get("title") as string,
        description: fd.get("description") as string,
        type: fd.get("type") as string,
        priority: fd.get("priority") as string,
        module_key: fd.get("module_key") ?? undefined,
      };

      const res = await fetch("/api/copilot/helpdesk/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json() as { ok: boolean; ticket?: HelpdeskTicket; message?: string };

      if (!json.ok || !json.ticket) {
        showToast(json.message ?? "Error al crear el ticket.", false);
        return;
      }

      const ticketId = json.ticket.id;

      for (const file of files) {
        const fileFd = new FormData();
        fileFd.set("file", file);
        await fetch(`/api/copilot/helpdesk/tickets/${ticketId}/attachments`, {
          method: "POST",
          body: fileFd,
        });
      }

      showToast("Ticket creado correctamente.", true);
      setShowForm(false);
      await load(filters);
      setSelectedTicket(json.ticket);
    } catch {
      showToast("Error de conexión.", false);
    } finally {
      setFormLoading(false);
    }
  };

  const handleStatusChange = async (id: string, status: HelpdeskStatus) => {
    const res = await fetch(`/api/copilot/helpdesk/tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const json = await res.json() as { ok: boolean; message?: string };
    if (!json.ok) {
      showToast(json.message ?? "Error al actualizar.", false);
    } else {
      showToast("Estado actualizado.", true);
      await load(filters);
    }
  };

  if (selectedTicket) {
    return (
      <div className="relative min-h-screen space-y-0 pb-8">
        {toast && (
          <div
            className={`fixed right-4 top-4 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
              toast.ok
                ? "border border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]"
                : "border border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]"
            }`}
          >
            {toast.message}
          </div>
        )}
        <CopilotPageHeader
          title="Mesa de ayuda"
          description="Dejá sugerencias, reportá problemas o pedí cambios para el sistema."
        />
        <div className="px-4 py-4 sm:px-6">
          <HelpdeskTicketDetail
            ticket={selectedTicket}
            isAdmin={isAdmin}
            onBack={() => {
              setSelectedTicket(null);
              void load(filters);
            }}
            onStatusChange={handleStatusChange}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen space-y-0 pb-8">
      {toast && (
        <div
          className={`fixed right-4 top-4 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
            toast.ok
              ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
              : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
          }`}
        >
          {toast.message}
        </div>
      )}

      <CopilotPageHeader
        title="Mesa de ayuda"
        description="Dejá sugerencias, reportá problemas o pedí cambios para el sistema."
        right={
          !showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--copilot-accent)] bg-[var(--copilot-accent)] px-4 py-2 text-sm font-semibold text-[var(--copilot-on-accent)] shadow-sm transition hover:border-[var(--copilot-accent-hover)] hover:bg-[var(--copilot-accent-hover)]"
            >
              <Plus className="h-4 w-4" />
              Nuevo ticket
            </button>
          ) : undefined
        }
      />

      <div className="space-y-4 px-4 py-4 sm:px-6">
        {showForm && (
          <div className={copilotCardStandardClass}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--copilot-text)]">Nuevo ticket</h2>
              <button
                onClick={() => setShowForm(false)}
                className="text-[var(--copilot-muted)] hover:text-[var(--copilot-text)] transition-colors"
                aria-label="Cerrar formulario"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <HelpdeskTicketForm
              onSubmit={handleCreate}
              onCancel={() => setShowForm(false)}
              loading={formLoading}
            />
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[var(--copilot-muted)]">
            {loading ? "Cargando…" : `${tickets.length} ticket${tickets.length !== 1 ? "s" : ""}`}
          </p>
          <HelpdeskFilters filters={filters} isAdmin={isAdmin} onChange={handleFilterChange} />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-[var(--copilot-muted)]">Cargando tickets…</p>
          </div>
        ) : (
          <HelpdeskTicketList
            tickets={tickets}
            isAdmin={isAdmin}
            onSelect={(t) => setSelectedTicket(t)}
          />
        )}
      </div>
    </div>
  );
}
