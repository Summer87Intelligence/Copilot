"use client";

import { useState } from "react";

import { FINANCIAL_UX_COPY } from "@/lib/copilot-financial-ux-copy";
import { CopilotGhostButton, CopilotPrimaryButton } from "@/components/copilot/copilot-ui";

export function ExportDisclaimerModal({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [ack, setAck] = useState(false);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar modal de exportación"
        onClick={() => {
          setAck(false);
          onCancel();
        }}
        className="fixed inset-0 z-40 bg-[rgba(19,23,22,0.35)]"
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl border border-[var(--copilot-border)] bg-[var(--copilot-card)] p-5 shadow-2xl">
          <p className="text-base font-semibold text-[var(--copilot-ink)]">
            {FINANCIAL_UX_COPY.exportModalTitle}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
            {FINANCIAL_UX_COPY.exportModalBody}
          </p>
          <label className="mt-4 flex items-start gap-2 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 p-3 text-sm text-[var(--copilot-ink)]">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
              className="mt-0.5"
            />
            <span>{FINANCIAL_UX_COPY.exportModalAcknowledge}</span>
          </label>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <CopilotGhostButton
              type="button"
              onClick={() => {
                setAck(false);
                onCancel();
              }}
            >
              {FINANCIAL_UX_COPY.exportModalCancel}
            </CopilotGhostButton>
            <CopilotPrimaryButton
              type="button"
              disabled={!ack}
              onClick={() => {
                setAck(false);
                onConfirm();
              }}
            >
              {FINANCIAL_UX_COPY.exportModalConfirm}
            </CopilotPrimaryButton>
          </div>
        </div>
      </div>
    </>
  );
}
