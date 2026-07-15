"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ListPlus, X } from "lucide-react";

import { RelatedTasksCard } from "@/components/copilot/tasks/related-tasks-card";
import { useCopilotPermissions } from "@/lib/auth/copilot-permissions-context";
import { alertSeverityToPriority, alertTaskTitle } from "@/lib/tasks/alert-task";

/**
 * FASE 7 — CTA "Crear tarea" desde una alerta (§20).
 * - Vincula la tarea a la alerta (source_type 'alert', source_id = alertId).
 * - Prioridad sugerida según severidad (editable dentro de permisos).
 * - Prefill de título con el título visible de la alerta (sin volcar payload).
 * - Dedup visual: el modal lista las tareas ya vinculadas a la alerta, de modo
 *   que el usuario abre la existente en vez de duplicar.
 * - NO modifica la alerta ni la lógica que la genera. Módulo de origen 'manual'
 *   (general) para respetar permisos efectivos sin exigir acceso a 'hoy'.
 */
export function AlertTaskButton({
  alertId,
  alertTitle,
  severity,
}: {
  alertId: string;
  alertTitle: string;
  severity: string;
}) {
  const { modulePermissions } = useCopilotPermissions();
  const level = modulePermissions["daily_tasks"];
  const canWrite = level === "write" || level === "admin";
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-[11.5px] font-semibold text-[var(--copilot-accent)] transition-opacity hover:opacity-75"
      >
        <ListPlus className="h-3 w-3" aria-hidden />
        Crear tarea
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
          role="presentation"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="alert-task-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-panel-bg)] shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--copilot-border)] px-4 py-3">
              <h2 id="alert-task-title" className="text-sm font-semibold text-[var(--copilot-ink)]">
                Tarea desde alerta
              </h2>
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                aria-label="Cerrar"
                className="rounded-lg p-1 text-[var(--copilot-ink-muted)] hover:bg-[var(--copilot-hover-bg)]"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="p-4">
              <RelatedTasksCard
                sourceType="alert"
                sourceId={alertId}
                moduleKey="manual"
                canWrite={canWrite}
                title="Tareas de esta alerta"
                defaultTitle={alertTaskTitle(alertTitle)}
                defaultPriority={alertSeverityToPriority(severity)}
                actionUrl="/copilot/alertas"
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
