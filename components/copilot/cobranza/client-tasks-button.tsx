"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ListChecks, X } from "lucide-react";

import { RelatedTasksCard } from "@/components/copilot/tasks/related-tasks-card";

/**
 * FASE 7 — Botón "Tareas" por cliente en Cobranza. Abre un modal on-demand con
 * las tareas vinculadas al cliente (source_type 'client', módulo cobranza). NO
 * consulta por cliente en la lista: solo fetch al abrir. Mantiene la separación
 * gestión de cobranza (financiera) vs tarea operativa: crear tarea no toca deuda,
 * promesa ni aging.
 */
export function ClientTasksButton({
  companyId,
  companyName,
  canWrite = false,
}: {
  companyId: string;
  companyName: string;
  canWrite?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-2.5 py-1.5 text-xs font-medium text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-panel-bg)]"
      >
        <ListChecks className="h-3.5 w-3.5" aria-hidden />
        Tareas
      </button>
      {open ? (
        <ClientTasksModal
          companyId={companyId}
          companyName={companyName}
          canWrite={canWrite}
          onClose={close}
        />
      ) : null}
    </>
  );
}

function ClientTasksModal({
  companyId,
  companyName,
  canWrite,
  onClose,
}: {
  companyId: string;
  companyName: string;
  canWrite: boolean;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-tasks-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)] shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--copilot-border)] px-4 py-3">
          <h2 id="client-tasks-title" className="text-sm font-semibold text-[var(--copilot-ink)]">
            Tareas · {companyName}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1 text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-hover-bg)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="p-4">
          <RelatedTasksCard
            sourceType="client"
            sourceId={companyId}
            moduleKey="cobranza"
            canWrite={canWrite}
            title="Tareas del cliente"
            defaultTitle={`Seguimiento de cobranza · ${companyName}`}
            actionUrl={`/copilot/clientes/${companyId}#gestion-cobranza`}
          />
        </div>
      </div>
    </div>
  );
}
