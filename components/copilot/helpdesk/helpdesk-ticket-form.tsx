"use client";

import { useCallback, useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import {
  HELPDESK_TICKET_TYPES,
  HELPDESK_TICKET_TYPE_LABELS,
  HELPDESK_MODULE_KEYS,
  HELPDESK_MODULE_KEY_LABELS,
  HELPDESK_PRIORITIES,
  HELPDESK_PRIORITY_LABELS,
  type HelpdeskTicketType,
  type HelpdeskModuleKey,
  type HelpdeskPriority,
} from "@/lib/helpdesk-types";

type Props = {
  onSubmit: (data: FormData, files: File[]) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
};

const inputClass =
  "w-full rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-2 text-sm text-[var(--copilot-text)] placeholder:text-[var(--copilot-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500";

const labelClass = "block text-xs font-semibold uppercase tracking-wide text-[var(--copilot-muted)] mb-1";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
const MAX_SIZE = 10 * 1024 * 1024;

export function HelpdeskTicketForm({ onSubmit, onCancel, loading }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<HelpdeskTicketType>("suggestion");
  const [moduleKey, setModuleKey] = useState<HelpdeskModuleKey | "">("");
  const [priority, setPriority] = useState<HelpdeskPriority>("medium");
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    setFileError(null);
    const valid: File[] = [];
    for (const f of Array.from(incoming)) {
      if (!ALLOWED_TYPES.includes(f.type)) {
        setFileError(`Tipo no permitido: ${f.name}. Solo PNG, JPG, WebP o PDF.`);
        return;
      }
      if (f.size > MAX_SIZE) {
        setFileError(`El archivo ${f.name} supera 10 MB.`);
        return;
      }
      valid.push(f);
    }
    setFiles((prev) => [...prev, ...valid]);
  }, []);

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    const fd = new FormData();
    fd.set("title", title.trim());
    fd.set("description", description.trim());
    fd.set("type", type);
    fd.set("priority", priority);
    if (moduleKey) fd.set("module_key", moduleKey);
    await onSubmit(fd, files);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="hd-title" className={labelClass}>
          Título <span className="text-red-500">*</span>
        </label>
        <input
          id="hd-title"
          className={inputClass}
          placeholder="¿Qué querés reportar o sugerir?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
        />
      </div>

      <div>
        <label htmlFor="hd-description" className={labelClass}>
          Descripción <span className="text-red-500">*</span>
        </label>
        <textarea
          id="hd-description"
          className={`${inputClass} min-h-[120px] resize-y`}
          placeholder="Describí el problema, la mejora o la sugerencia con el mayor detalle posible."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          maxLength={2000}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="hd-type" className={labelClass}>
            Tipo <span className="text-red-500">*</span>
          </label>
          <select
            id="hd-type"
            className={inputClass}
            value={type}
            onChange={(e) => setType(e.target.value as HelpdeskTicketType)}
          >
            {HELPDESK_TICKET_TYPES.map((t) => (
              <option key={t} value={t}>
                {HELPDESK_TICKET_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="hd-module" className={labelClass}>
            Módulo relacionado
          </label>
          <select
            id="hd-module"
            className={inputClass}
            value={moduleKey}
            onChange={(e) => setModuleKey(e.target.value as HelpdeskModuleKey | "")}
          >
            <option value="">— No aplica —</option>
            {HELPDESK_MODULE_KEYS.map((m) => (
              <option key={m} value={m}>
                {HELPDESK_MODULE_KEY_LABELS[m]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="hd-priority" className={labelClass}>
            Prioridad
          </label>
          <select
            id="hd-priority"
            className={inputClass}
            value={priority}
            onChange={(e) => setPriority(e.target.value as HelpdeskPriority)}
          >
            {HELPDESK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {HELPDESK_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Adjuntos */}
      <div>
        <p className={labelClass}>Adjuntos (opcional)</p>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)] px-4 py-3 text-sm text-[var(--copilot-muted)] hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          <Paperclip className="h-4 w-4 shrink-0" />
          Adjuntar imagen o PDF (máx. 10 MB)
        </button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept=".png,.jpg,.jpeg,.webp,.pdf"
          multiple
          onChange={(e) => addFiles(e.target.files)}
        />
        {fileError && (
          <p className="mt-1 text-xs text-red-600">{fileError}</p>
        )}
        {files.length > 0 && (
          <ul className="mt-2 space-y-1">
            {files.map((f, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-lg bg-[var(--copilot-soft-bg)] px-3 py-1.5 text-xs"
              >
                <span className="truncate text-[var(--copilot-text)]">{f.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="ml-2 shrink-0 text-[var(--copilot-muted)] hover:text-red-500"
                  aria-label="Quitar archivo"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end gap-3 border-t border-[var(--copilot-border)] pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="rounded-lg px-4 py-2 text-sm text-[var(--copilot-muted)] hover:text-[var(--copilot-text)] transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading || !title.trim() || !description.trim()}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Enviando…" : "Crear ticket"}
        </button>
      </div>
    </form>
  );
}
