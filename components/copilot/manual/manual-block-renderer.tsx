"use client";

import type { CopilotManualBlock } from "@/lib/copilot-manual/types";

const C = {
  border: "border-[var(--copilot-border)]",
} as const;

function Callout({
  variant,
  children,
}: {
  variant: "tip" | "warning" | "info";
  children: React.ReactNode;
}) {
  const s = {
    tip: "bg-[var(--copilot-tone-positive-bg)] border-[var(--copilot-success-border)] text-[var(--copilot-success-text-strong)]",
    warning: "bg-[var(--copilot-tone-warning-bg)] border-[var(--copilot-warning-border)] text-[var(--copilot-warning-text-strong)]",
    info: "bg-[var(--copilot-tone-neutral-bg)] border-[var(--copilot-border)] text-[var(--copilot-accent)]",
  }[variant];
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${s}`}>
      {children}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-[var(--copilot-ink)]">
          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--copilot-accent)]" />
          <span className="leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--copilot-accent)] text-[11px] font-bold text-white">
            {i + 1}
          </span>
          <span className="pt-0.5 text-sm leading-relaxed text-[var(--copilot-ink)]">
            {item}
          </span>
        </li>
      ))}
    </ol>
  );
}

function StatusPill({ level }: { level: "ok" | "warning" | "critical" }) {
  const s = {
    ok: "bg-[var(--copilot-tone-positive-bg)] text-[var(--copilot-success-text-strong)] border-[var(--copilot-success-border)]",
    warning: "bg-[var(--copilot-tone-warning-bg)] text-[var(--copilot-warning-text-strong)] border-[var(--copilot-warning-border)]",
    critical: "bg-[var(--copilot-tone-danger-bg)] text-[var(--copilot-danger-text-strong)] border-[var(--copilot-danger-border)]",
  }[level];
  const label = { ok: "Estable", warning: "Atención", critical: "Crítico" }[level];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${s}`}
    >
      {label}
    </span>
  );
}

function SubsectionBox({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border ${C.border} p-4`}>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
        {title}
      </p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function BlockList({ blocks, nested }: { blocks: CopilotManualBlock[]; nested?: boolean }) {
  return (
    <>
      {blocks.map((block, i) => (
        <ManualBlock key={i} block={block} nested={nested} />
      ))}
    </>
  );
}

function ManualBlock({
  block,
  nested,
}: {
  block: CopilotManualBlock;
  nested?: boolean;
}) {
  switch (block.type) {
    case "paragraph":
      return (
        <p className="text-sm leading-relaxed text-[var(--copilot-ink)]">{block.text}</p>
      );
    case "bullets":
      return <Bullets items={block.items} />;
    case "steps":
      return <Steps items={block.items} />;
    case "callout":
      return (
        <Callout variant={block.variant}>
          <span>{block.text}</span>
        </Callout>
      );
    case "subsection":
      if (nested) {
        return (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-[var(--copilot-ink)]">{block.title}</p>
            <BlockList blocks={block.blocks} nested />
          </div>
        );
      }
      return (
        <SubsectionBox title={block.title}>
          <BlockList blocks={block.blocks} nested />
        </SubsectionBox>
      );
    case "glossary":
      return (
        <div className="space-y-3">
          {block.entries.map(({ term, definition }) => (
            <div key={term} className="flex gap-3 text-sm">
              <span className="mt-0.5 inline-flex shrink-0 rounded-md border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80 px-2 py-0.5 text-[11px] font-semibold text-[var(--copilot-ink)]">
                {term}
              </span>
              <span className="text-[var(--copilot-ink-muted)]">{definition}</span>
            </div>
          ))}
        </div>
      );
    case "roles":
      return (
        <div className="space-y-3">
          {block.entries.map((r) => (
            <div
              key={r.role}
              className={`rounded-xl border border-[var(--copilot-border)] p-4`}
            >
              <span className="inline-flex items-center rounded-full border border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--copilot-success-text-strong)]">
                {r.label}
              </span>
              <p className="mt-2 text-sm text-[var(--copilot-ink)]">{r.description}</p>
            </div>
          ))}
        </div>
      );
    case "status":
      return (
        <div className="space-y-3">
          {block.entries.map((row) => {
            const color =
              row.level === "ok"
                ? "border-[var(--copilot-success-border)] bg-[var(--copilot-tone-positive-bg)]/60"
                : row.level === "warning"
                  ? "border-[var(--copilot-warning-border)] bg-[var(--copilot-tone-warning-bg)]/60"
                  : "border-[var(--copilot-danger-border)] bg-[var(--copilot-tone-danger-bg)]/60";
            return (
              <div
                key={row.title}
                className={`flex items-start gap-3 rounded-xl border p-4 ${color}`}
              >
                <StatusPill level={row.level} />
                <p className="text-sm leading-relaxed text-[var(--copilot-ink)]">
                  {row.description}
                </p>
              </div>
            );
          })}
        </div>
      );
    default:
      return null;
  }
}

export function ManualBlockRenderer({ blocks }: { blocks: CopilotManualBlock[] }) {
  return (
    <div className="space-y-4">
      <BlockList blocks={blocks} />
    </div>
  );
}
