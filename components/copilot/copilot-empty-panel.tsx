import { CopilotCard } from "@/components/copilot/copilot-ui";

type Props = {
  title: string;
  paragraphs: readonly string[];
  example?: string;
  importance?: string;
};

export function CopilotEmptyPanel({ title, paragraphs, example, importance }: Props) {
  return (
    <CopilotCard className="border-dashed border-[var(--copilot-border)] bg-[rgba(255,255,255,0.55)]">
      <h2 className="text-base font-semibold text-[var(--copilot-ink)]">{title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {example ? (
        <p className="mt-4 rounded-xl border border-[var(--copilot-border)] bg-white/70 px-4 py-3 text-sm text-[var(--copilot-ink)]">
          <span className="font-semibold text-[var(--copilot-ink)]">Ejemplo: </span>
          {example}
        </p>
      ) : null}
      {importance ? (
        <div
          role="note"
          className="mt-4 rounded-xl border border-amber-200/90 bg-amber-50/80 px-4 py-3 text-sm text-amber-950"
        >
          {importance}
        </div>
      ) : null}
    </CopilotCard>
  );
}
