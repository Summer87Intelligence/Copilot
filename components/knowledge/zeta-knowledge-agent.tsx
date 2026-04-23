"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";

import { ZetaKnowledgeMarkdown } from "@/components/knowledge/zeta-knowledge-markdown";
import { CopilotCard, CopilotGhostButton, CopilotPrimaryButton } from "@/components/copilot/copilot-ui";

export type ZetaAskSource = {
  title: string;
  url_final: string | null;
  output_md: string;
  snippet: string;
};

export function ZetaKnowledgeAgent({
  onOpenDoc,
}: {
  onOpenDoc: (outputMd: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<ZetaAskSource[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleAsk() {
    const q = question.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    setSources([]);
    try {
      const res = await fetch("/api/knowledge/zeta/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ question: q }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        answer?: string;
        sources?: ZetaAskSource[];
        message?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.message ?? "No se pudo consultar la biblioteca.");
      }
      setAnswer(json.answer ?? "");
      setSources(Array.isArray(json.sources) ? json.sources : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <CopilotCard className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgba(44,40,37,0.06)]">
          <Sparkles className="h-5 w-5 text-[var(--copilot-accent)]" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[var(--copilot-ink)]">Asistente de consultas (local)</h3>
          <p className="mt-1 text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
            Respuestas armadas solo con recuperación textual sobre los `.md` de `docs/zeta/markdown/`. Sin modelos
            externos ni otras fuentes.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ej.: ¿Cómo habilito las APIs para un desarrollador?"
          className="min-h-[44px] flex-1 rounded-xl border border-[var(--copilot-border)] bg-white px-3 text-sm text-[var(--copilot-ink)] outline-none ring-0 placeholder:text-[var(--copilot-ink-muted)] focus:border-[var(--copilot-accent)]"
        />
        <CopilotPrimaryButton
          type="button"
          onClick={() => void handleAsk()}
          disabled={loading || !question.trim()}
          className="sm:w-40"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Consultando
            </span>
          ) : (
            "Consultar"
          )}
        </CopilotPrimaryButton>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">{error}</p>
      ) : null}

      {answer ? (
        <div className="rounded-xl border border-[var(--copilot-border)] bg-[rgba(255,255,255,0.65)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">Respuesta</p>
          <div className="mt-3 text-sm leading-relaxed text-[var(--copilot-ink)]">
            <ZetaKnowledgeMarkdown markdown={answer} />
          </div>
        </div>
      ) : null}

      {sources.length ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Fuentes usadas
          </p>
          <ul className="mt-2 space-y-2">
            {sources.map((s) => (
              <li
                key={s.output_md}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--copilot-border)] bg-white/70 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--copilot-ink)]">{s.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-[var(--copilot-ink-muted)]">{s.snippet}</p>
                </div>
                <CopilotGhostButton type="button" className="shrink-0 text-xs" onClick={() => onOpenDoc(s.output_md)}>
                  Ver doc
                </CopilotGhostButton>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </CopilotCard>
  );
}
