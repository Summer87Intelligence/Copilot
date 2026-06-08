"use client";

import { Download, Paperclip } from "lucide-react";

import {
  collectionAttachmentChannelHint,
  type CollectionAccountStatementAttachment,
} from "@/lib/account-statement/build-collection-account-statement-attachments";

type Props = {
  attachments: CollectionAccountStatementAttachment[];
  channel: "whatsapp" | "email";
};

export function CollectionSuggestedAttachments({ attachments, channel }: Props) {
  if (attachments.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Paperclip className="h-3.5 w-3.5 text-[var(--copilot-accent)]" aria-hidden />
        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--copilot-ink)]">
          Adjuntos sugeridos
        </p>
      </div>

      <ul className="space-y-2">
        {attachments.map((attachment) => (
          <li key={attachment.currency}>
            <a
              href={attachment.pdfUrl}
              download={attachment.downloadFilename}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--copilot-border)] bg-[rgba(44,40,37,0.02)] px-3 py-2 text-[12px] font-medium text-[var(--copilot-accent)] transition hover:bg-[var(--copilot-panel-bg)]"
            >
              <Download className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{attachment.label}</span>
              <span className="text-[var(--copilot-ink-muted)]">— Descargar PDF</span>
            </a>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--copilot-ink-muted)]">
        {collectionAttachmentChannelHint(channel)}
      </p>
    </div>
  );
}
