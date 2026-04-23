"use client";

import { ChevronDown, ChevronRight, FileText } from "lucide-react";

import { branchDocCount, type ZetaNavTreeNode } from "@/lib/knowledge/zeta-knowledge-nav-tree";

export function ZetaKnowledgeTree({
  nodes,
  depth,
  expandedKeys,
  onToggle,
  activePath,
  onSelectDoc,
}: {
  nodes: ZetaNavTreeNode[];
  depth: number;
  expandedKeys: ReadonlySet<string>;
  onToggle: (key: string) => void;
  activePath: string | null;
  onSelectDoc: (outputMd: string) => void;
}) {
  if (!nodes.length) return null;

  return (
    <ul className={depth === 0 ? "space-y-1" : "mt-1 space-y-1 border-l border-[var(--copilot-border)] pl-2.5"}>
      {nodes.map((node) => {
        const hasSubtree = node.children.length > 0 || node.docs.length > 0;
        const open = expandedKeys.has(node.key);
        return (
          <li key={node.key}>
            {hasSubtree ? (
              <button
                type="button"
                onClick={() => onToggle(node.key)}
                className="flex w-full items-center gap-1 rounded-lg px-1.5 py-1 text-left text-sm font-semibold text-[var(--copilot-ink)] transition hover:bg-[rgba(44,40,37,0.06)]"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[var(--copilot-ink-muted)]">
                  {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{node.label}</span>
                {depth === 0 && hasSubtree ? (
                  <span className="shrink-0 tabular-nums text-[10px] font-medium text-[var(--copilot-ink-muted)]">
                    {branchDocCount(node)}
                  </span>
                ) : null}
              </button>
            ) : (
              <div className="px-2 py-1 text-sm font-semibold text-[var(--copilot-ink)]">{node.label}</div>
            )}

            {hasSubtree && open ? (
              <div className="pb-1">
                {node.docs.map((d) => {
                  const active = d.output_md === activePath;
                  return (
                    <button
                      key={d.output_md}
                      type="button"
                      onClick={() => onSelectDoc(d.output_md)}
                      className={`mb-0.5 flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition ${
                        active
                          ? "bg-[rgba(44,40,37,0.08)] font-semibold text-[var(--copilot-ink)] ring-1 ring-[var(--copilot-accent)]/35"
                          : "text-[var(--copilot-ink-muted)] hover:bg-[rgba(44,40,37,0.05)] hover:text-[var(--copilot-ink)]"
                      }`}
                    >
                      <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />
                      <span className="min-w-0 flex-1 leading-snug">{d.title}</span>
                    </button>
                  );
                })}
                {node.children.length ? (
                  <ZetaKnowledgeTree
                    nodes={node.children}
                    depth={depth + 1}
                    expandedKeys={expandedKeys}
                    onToggle={onToggle}
                    activePath={activePath}
                    onSelectDoc={onSelectDoc}
                  />
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
