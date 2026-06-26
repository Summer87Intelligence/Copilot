"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileImage, FileText, Paperclip, X } from "lucide-react";
import type { HelpdeskAttachment } from "@/lib/helpdesk-types";
import { formatDate } from "./helpdesk-date-utils";

type Props = {
  ticketId: string;
  canUpload: boolean;
};

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
const MAX_SIZE = 10 * 1024 * 1024;

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function AttachmentIcon({ type }: { type: string }) {
  if (type === "application/pdf") return <FileText className="h-4 w-4 shrink-0 text-red-500" />;
  return <FileImage className="h-4 w-4 shrink-0 text-blue-500" />;
}

export function HelpdeskAttachments({ ticketId, canUpload }: Props) {
  const [attachments, setAttachments] = useState<HelpdeskAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/copilot/helpdesk/tickets/${ticketId}/attachments`);
      const json = await res.json() as { ok: boolean; attachments?: HelpdeskAttachment[] };
      if (json.ok) setAttachments(json.attachments ?? []);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { void load(); }, [load]);

  const handleFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setFileError(null);
    for (const f of Array.from(list)) {
      if (!ALLOWED_TYPES.includes(f.type)) {
        setFileError(`Tipo no permitido: ${f.name}`);
        return;
      }
      if (f.size > MAX_SIZE) {
        setFileError(`El archivo ${f.name} supera 10 MB.`);
        return;
      }
    }

    setUploading(true);
    try {
      for (const f of Array.from(list)) {
        const fd = new FormData();
        fd.set("file", f);
        const res = await fetch(`/api/copilot/helpdesk/tickets/${ticketId}/attachments`, {
          method: "POST",
          body: fd,
        });
        const json = await res.json() as { ok: boolean; message?: string };
        if (!json.ok) {
          setFileError(json.message ?? "Error al subir archivo.");
          return;
        }
      }
      await load();
    } catch {
      setFileError("Error de conexión al subir archivo.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-[var(--copilot-text)]">Adjuntos</h3>

      {loading ? (
        <p className="text-xs text-[var(--copilot-muted)]">Cargando adjuntos…</p>
      ) : attachments.length === 0 ? (
        <p className="text-xs text-[var(--copilot-muted)]">No hay adjuntos.</p>
      ) : (
        <ul className="space-y-2">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] px-3 py-2"
            >
              <AttachmentIcon type={a.file_type} />
              <div className="min-w-0 flex-1">
                <a
                  href={`/api/copilot/helpdesk/tickets/${ticketId}/attachments/${a.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-sm font-medium text-blue-600 hover:underline"
                >
                  {a.file_name}
                </a>
                <p className="text-[11px] text-[var(--copilot-muted)]">
                  {formatBytes(a.file_size_bytes)} · {formatDate(a.created_at)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canUpload && (
        <div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--copilot-border)] px-3 py-2 text-xs text-[var(--copilot-muted)] hover:border-blue-400 hover:text-blue-600 disabled:opacity-50 transition-colors"
          >
            {uploading ? (
              <span>Subiendo…</span>
            ) : (
              <>
                <Paperclip className="h-3.5 w-3.5" />
                Agregar adjunto
              </>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".png,.jpg,.jpeg,.webp,.pdf"
            multiple
            onChange={(e) => void handleFiles(e.target.files)}
          />
          {fileError && <p className="mt-1 text-xs text-red-600">{fileError}</p>}
        </div>
      )}
    </div>
  );
}
