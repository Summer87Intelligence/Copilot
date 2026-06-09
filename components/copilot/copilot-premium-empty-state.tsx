import Link from "next/link";

type CopilotPremiumEmptyStateProps = {
  title: string;
  why: string;
  whatToDo: string;
  whatHappens: string;
  cta?: { label: string; href: string };
  className?: string;
};

/**
 * Empty state orientado al dueño: por qué, qué hacer y qué esperar.
 */
export function CopilotPremiumEmptyState({
  title,
  why,
  whatToDo,
  whatHappens,
  cta,
  className = "",
}: CopilotPremiumEmptyStateProps) {
  return (
    <div
      className={`rounded-2xl border border-dashed border-[var(--copilot-border)] bg-[var(--copilot-card-bg)]/80 px-5 py-6 ${className}`.trim()}
    >
      <h3 className="text-sm font-semibold text-[var(--copilot-ink)]">{title}</h3>
      <dl className="mt-3 space-y-2.5 text-xs leading-relaxed text-[var(--copilot-ink-muted)]">
        <div>
          <dt className="font-semibold text-[var(--copilot-ink)]">¿Por qué está vacío?</dt>
          <dd className="mt-0.5">{why}</dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--copilot-ink)]">¿Qué debo hacer?</dt>
          <dd className="mt-0.5">{whatToDo}</dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--copilot-ink)]">¿Qué pasará cuando haya datos?</dt>
          <dd className="mt-0.5">{whatHappens}</dd>
        </div>
      </dl>
      {cta ? (
        <Link
          href={cta.href}
          className="mt-4 inline-flex items-center rounded-lg bg-[var(--copilot-accent)] px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
        >
          {cta.label}
        </Link>
      ) : null}
    </div>
  );
}
