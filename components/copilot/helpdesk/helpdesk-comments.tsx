"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HelpdeskComment } from "@/lib/helpdesk-types";
import { formatDate } from "./helpdesk-date-utils";

type Props = {
  ticketId: string;
};

const inputClass =
  "w-full rounded-lg border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)] px-3 py-2 text-sm text-[var(--copilot-text)] placeholder:text-[var(--copilot-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] resize-y";

export function HelpdeskComments({ ticketId }: Props) {
  const [comments, setComments] = useState<HelpdeskComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/copilot/helpdesk/tickets/${ticketId}/comments`);
      const json = await res.json() as { ok: boolean; comments?: HelpdeskComment[]; message?: string };
      if (json.ok) setComments(json.comments ?? []);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!loading) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [loading, comments.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/copilot/helpdesk/tickets/${ticketId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const json = await res.json() as { ok: boolean; message?: string };
      if (!json.ok) {
        setError(json.message ?? "Error al enviar comentario.");
      } else {
        setBody("");
        await load();
      }
    } catch {
      setError("Error de conexión.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-[var(--copilot-text)]">Comentarios</h3>

      {loading ? (
        <p className="text-xs text-[var(--copilot-muted)]">Cargando comentarios…</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-[var(--copilot-muted)]">No hay comentarios aún.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-xl bg-[var(--copilot-soft-bg)] px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--copilot-text)]">
                  {c.created_by_name ?? "Usuario"}
                </span>
                <span className="text-[11px] text-[var(--copilot-muted)]">
                  {formatDate(c.created_at)}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--copilot-text)]">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      <div ref={bottomRef} />

      <form onSubmit={handleSubmit} className="space-y-2">
        <textarea
          className={inputClass}
          placeholder="Escribí un comentario…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={submitting}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting || !body.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Enviando…" : "Comentar"}
          </button>
        </div>
      </form>
    </div>
  );
}
