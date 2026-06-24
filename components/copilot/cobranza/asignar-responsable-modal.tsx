"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { copilotApiFetch } from "@/lib/copilot-fetch";
import type { OwnershipEntry } from "@/lib/copilot-cobranza-summary";

type AssignableUser = { id: string; name: string; email: string; role: string };

interface AsignarResponsableModalProps {
  companyId: string;
  companyName: string;
  currentOwnerUserId: string | null;
  onClose: () => void;
  onSuccess: (companyId: string, entry: OwnershipEntry | null) => void;
}

export function AsignarResponsableModal({
  companyId,
  companyName,
  currentOwnerUserId,
  onClose,
  onSuccess,
}: AsignarResponsableModalProps) {
  const [users, setUsers] = useState<AssignableUser[] | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>(currentOwnerUserId ?? "");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void copilotApiFetch("/api/copilot/cobranza/usuarios-asignables")
      .then((r) => r.json())
      .then((data) => {
        setUsers((data as { users?: AssignableUser[] }).users ?? []);
      })
      .catch(() => setError("No se pudo cargar la lista de usuarios."));
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await copilotApiFetch("/api/copilot/cobranza/asignar-responsable", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          userId: selectedUserId || null,
          note: note.trim() || undefined,
        }),
      });

      const json = (await res.json()) as {
        ok: boolean;
        assignedTo?: { id: string; name: string; email: string };
        message?: string;
      };

      if (!res.ok) {
        setError(
          res.status === 403
            ? "No tenés permisos para asignar responsables."
            : (json.message ?? "Error al guardar la asignación.")
        );
        return;
      }

      const entry: OwnershipEntry | null = json.assignedTo
        ? { userId: json.assignedTo.id, name: json.assignedTo.name, email: json.assignedTo.email }
        : null;
      onSuccess(companyId, entry);
    } catch {
      setError("Error de conexión. Intentá de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Asignar responsable — ${companyName}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
              Asignar responsable
            </p>
            <p className="mt-0.5 text-sm font-semibold text-[var(--copilot-ink)]">
              {companyName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-panel-bg)]"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error ? (
          <div className="mb-3 rounded-lg border border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] px-3 py-2 text-xs text-[var(--copilot-danger-text-strong)]">
            {error}
          </div>
        ) : null}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--copilot-ink-muted)]">
              Responsable
            </label>
            {users === null && !error ? (
              <div className="h-9 animate-pulse rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)]" />
            ) : (
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                disabled={submitting}
                className="w-full rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-2 text-sm text-[var(--copilot-ink)] focus:border-[var(--copilot-accent)] focus:outline-none disabled:opacity-60"
              >
                <option value="">— Sin asignar —</option>
                {(users ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--copilot-ink-muted)]">
              Nota <span className="font-normal">(opcional)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={submitting}
              rows={2}
              maxLength={200}
              placeholder="Ej: priorizar esta semana, aguardar respuesta"
              className="w-full resize-none rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-2 text-sm text-[var(--copilot-ink)] placeholder:text-[var(--copilot-ink-muted)] focus:border-[var(--copilot-accent)] focus:outline-none disabled:opacity-60"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-3 py-1.5 text-xs font-medium text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-panel-bg)] disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            ref={saveRef}
            type="button"
            onClick={() => void handleSave()}
            disabled={submitting || (users === null && !error)}
            className="rounded-lg bg-[var(--copilot-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
