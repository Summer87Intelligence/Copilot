"use client";

import { Library } from "lucide-react";

import { ZetaKnowledgeTree } from "@/components/knowledge/zeta-knowledge-tree";
import { type ZetaNavTreeNode } from "@/lib/knowledge/zeta-knowledge-nav-tree";
import { CopilotBadge } from "@/components/copilot/copilot-ui";

export function ZetaKnowledgeSidebar({
  branches,
  expandedKeys,
  onToggleKey,
  activePath,
  onSelectDoc,
  loading,
  emptyHint,
}: {
  branches: ZetaNavTreeNode[];
  expandedKeys: ReadonlySet<string>;
  onToggleKey: (key: string) => void;
  activePath: string | null;
  onSelectDoc: (outputMd: string) => void;
  loading: boolean;
  emptyHint?: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--copilot-border)] bg-white/80 shadow-sm">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--copilot-border)] px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Library className="h-4 w-4 shrink-0 text-[var(--copilot-accent)]" />
          <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            Explorar
          </p>
        </div>
        {!loading && branches.length ? (
          <CopilotBadge tone="neutral">
            {branches.length} ramas
          </CopilotBadge>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 [scrollbar-width:thin]">
        {loading ? (
          <p className="px-2 py-6 text-center text-xs text-[var(--copilot-ink-muted)]">Cargando índice…</p>
        ) : !branches.length ? (
          <p className="px-2 py-6 text-center text-xs text-[var(--copilot-ink-muted)]">
            {emptyHint ?? "Sin documentos en el índice."}
          </p>
        ) : (
          <ZetaKnowledgeTree
            nodes={branches}
            depth={0}
            expandedKeys={expandedKeys}
            onToggle={onToggleKey}
            activePath={activePath}
            onSelectDoc={onSelectDoc}
          />
        )}
      </div>
    </div>
  );
}
