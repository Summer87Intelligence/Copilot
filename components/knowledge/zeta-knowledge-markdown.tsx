"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h2 className="mt-6 text-xl font-semibold tracking-tight text-[var(--copilot-ink)]">{children}</h2>
  ),
  h2: ({ children }) => (
    <h3 className="mt-5 text-lg font-semibold text-[var(--copilot-ink)]">{children}</h3>
  ),
  h3: ({ children }) => (
    <h4 className="mt-4 text-base font-semibold text-[var(--copilot-ink)]">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="mt-3 text-sm leading-relaxed text-[var(--copilot-ink)]">{children}</p>
  ),
  ul: ({ children }) => <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{children}</ul>,
  ol: ({ children }) => <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed text-[var(--copilot-ink)]">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="font-medium text-[var(--copilot-accent)] underline-offset-2 hover:underline"
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="mt-4 max-w-full overflow-x-auto rounded-xl border border-[var(--copilot-border)]">
      <table className="min-w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[rgba(44,40,37,0.04)]">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-[var(--copilot-border)] px-3 py-2 font-semibold text-[var(--copilot-ink)]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-[var(--copilot-border)] px-3 py-2 text-[var(--copilot-ink)]">{children}</td>
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = Boolean(className);
    if (isBlock) {
      return (
        <code
          className={`block overflow-x-auto rounded-lg bg-[rgba(44,40,37,0.06)] p-3 text-xs ${className ?? ""}`}
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-[rgba(44,40,37,0.08)] px-1 py-0.5 font-mono text-[0.85em]" {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mt-4 overflow-x-auto rounded-xl border border-[var(--copilot-border)] bg-[rgba(44,40,37,0.04)] p-4 text-xs">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mt-4 border-l-4 border-[var(--copilot-accent)] pl-4 text-sm italic text-[var(--copilot-ink-muted)]">
      {children}
    </blockquote>
  ),
};

export function ZetaKnowledgeMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="prose-zeta max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
