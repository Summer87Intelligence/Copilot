"use client";

import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";

import { ZetaKnowledgeMarkdown } from "@/components/knowledge/zeta-knowledge-markdown";
import { CopilotCard, CopilotGhostButton } from "@/components/copilot/copilot-ui";

export function ZetaKnowledgeViewer({
  title,
  urlOriginal,
  urlFinal,
  markdown,
  loading,
}: {
  title: string | null;
  urlOriginal: string | null;
  urlFinal: string | null;
  markdown: string | null;
  loading: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <CopilotCard className="flex min-h-[min(52vh,560px)] flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--copilot-border)] pb-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Documento
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--copilot-ink)]">
            {title ?? "Seleccioná un documento"}
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {urlOriginal ? (
              <a
                href={urlOriginal}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--copilot-accent)] hover:underline"
              >
                URL original <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
            {urlFinal && urlFinal !== urlOriginal ? (
              <a
                href={urlFinal}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--copilot-accent)] hover:underline"
              >
                URL final <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
        </div>
        <CopilotGhostButton
          type="button"
          onClick={handleCopy}
          disabled={!markdown || loading}
          className="shrink-0 gap-2"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copiado" : "Copiar markdown"}
        </CopilotGhostButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-[var(--copilot-ink-muted)]">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Cargando documento…</p>
          </div>
        ) : markdown ? (
          <ZetaKnowledgeMarkdown markdown={markdown} />
        ) : (
          <p className="py-12 text-center text-sm text-[var(--copilot-ink-muted)]">
            Elegí un documento en el panel izquierdo, en recientes o en los resultados de búsqueda.
          </p>
        )}
      </div>
    </CopilotCard>
  );
}
