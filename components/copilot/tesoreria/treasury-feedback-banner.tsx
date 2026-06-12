"use client";

import { X } from "lucide-react";

export function TreasuryFeedbackBanner({
  tone,
  message,
  onClose,
}: {
  tone: "success" | "error";
  message: string;
  onClose: () => void;
}) {
  const palette =
    tone === "success"
      ? "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)]"
      : "border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)]";

  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${palette}`}
      role="status"
      aria-live="polite"
    >
      <p>{message}</p>
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg p-1 transition hover:bg-black/5"
        aria-label="Cerrar mensaje"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
