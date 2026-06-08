"use client";

import {
  CopilotDataTrainingBlock,
} from "@/components/copilot/copilot-data-training-block";
import { CopilotGhostButton } from "@/components/copilot/copilot-ui";
import { DATA_TRAINING } from "@/lib/copilot-data-integrity";

export function CopilotProtoDeleteDialog({
  open,
  title,
  description,
  loading,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  loading: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[60] bg-[rgba(19,23,22,0.35)]"
        aria-label="Cerrar"
        onClick={onCancel}
      />
      <div className="fixed left-1/2 top-1/2 z-[70] max-h-[min(90vh,720px)] w-[min(100%,520px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-[var(--copilot-ink)]">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
          {description}
        </p>
        <CopilotDataTrainingBlock
          className="mt-4"
          title="Antes de archivar"
          severity={DATA_TRAINING.delete.severity}
          paragraphs={DATA_TRAINING.delete.paragraphs}
        />
        {error ? (
          <p className="mt-3 text-sm text-rose-700">{error}</p>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <CopilotGhostButton type="button" onClick={onCancel} disabled={loading}>
            Cancelar
          </CopilotGhostButton>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className="rounded-xl bg-[var(--copilot-accent)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-100 disabled:bg-[var(--copilot-disabled-bg)] disabled:text-[var(--copilot-disabled-text)]"
          >
            {loading ? "Archivando…" : "Archivar"}
          </button>
        </div>
      </div>
    </>
  );
}
