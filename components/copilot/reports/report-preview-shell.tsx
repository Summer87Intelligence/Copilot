"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { FileDown, Loader2, X } from "lucide-react";

import { CopilotGhostButton } from "@/components/copilot/copilot-ui";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  onDownloadPdf: () => void;
  downloadLoading?: boolean;
  downloadError?: string | null;
  filterSlot?: ReactNode;
  children: ReactNode;
  dialogId?: string;
};

export function ReportPreviewShell({
  open,
  onClose,
  title,
  subtitle,
  onDownloadPdf,
  downloadLoading = false,
  downloadError,
  filterSlot,
  children,
  dialogId = "report-preview-dialog",
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !downloadLoading) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, downloadLoading, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${dialogId}-title`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !downloadLoading) onClose();
      }}
    >
      <div
        className="flex w-full max-w-4xl flex-col rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] shadow-2xl"
        style={{ maxHeight: "92dvh" }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--copilot-border)] px-5 py-4">
          <div className="min-w-0">
            <h2
              id={`${dialogId}-title`}
              className="text-base font-semibold text-[var(--copilot-ink)]"
            >
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 text-xs text-[var(--copilot-ink-muted)]">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={downloadLoading}
            className="shrink-0 rounded-lg p-1 text-[var(--copilot-ink-muted)] hover:bg-black/[0.04] disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* Filters */}
        {filterSlot ? (
          <div className="shrink-0 border-b border-[var(--copilot-border)] bg-slate-50/60 px-5 py-3">
            {filterSlot}
          </div>
        ) : null}

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {children}
          {downloadError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
              {downloadError}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--copilot-border)] px-5 py-3">
          <CopilotGhostButton type="button" onClick={onClose} disabled={downloadLoading}>
            Cerrar
          </CopilotGhostButton>
          <button
            type="button"
            onClick={onDownloadPdf}
            disabled={downloadLoading}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--copilot-accent)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {downloadLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <FileDown className="h-4 w-4" aria-hidden />
            )}
            Generar PDF
          </button>
        </div>
      </div>
    </div>
  );
}
