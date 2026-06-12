import { CopilotCard } from "@/components/copilot/copilot-ui";

type Props = {
  title: string;
  paragraphs: readonly string[];
  example?: string;
  importance?: string;
};

export function CopilotEmptyPanel({ title, paragraphs, example, importance }: Props) {
  return (
    <CopilotCard className="border-dashed border-[var(--copilot-border)] bg-[var(--copilot-soft-bg)]">
      <h2 className="text-sm font-semibold text-[var(--copilot-ink)]">{title}</h2>
      <div className="mt-2 space-y-2 text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {example ? (
        <p className="mt-3 rounded-xl border border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/70 px-3 py-2 text-xs text-[var(--copilot-ink)]">
          <span className="font-semibold text-[var(--copilot-ink)]">Ejemplo: </span>
          {example}
        </p>
      ) : null}
      {importance ? (
        <div
          role="note"
          className="mt-3 rounded-xl border border-[var(--copilot-warning-border)]/90 bg-[var(--copilot-tone-warning-bg)]/80 px-3 py-2 text-xs text-[var(--copilot-warning-text-strong)]"
        >
          {importance}
        </div>
      ) : null}
    </CopilotCard>
  );
}
