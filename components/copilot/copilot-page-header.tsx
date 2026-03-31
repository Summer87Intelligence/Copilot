import type { ReactNode } from "react";

export function CopilotPageHeader({
  eyebrow = "Summer87 Copilot",
  title,
  description,
  readingKey,
  right,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  /** Bloque opcional de guía cognitiva (p. ej. `CopilotReadingKey`). */
  readingKey?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="border-b border-[var(--copilot-border)] bg-[rgba(255,255,255,0.45)] px-6 py-7 backdrop-blur-sm">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="min-w-0 max-w-3xl flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--copilot-ink-muted)]">
            {eyebrow}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--copilot-ink)] sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 text-sm leading-relaxed text-[var(--copilot-ink-muted)]">
              {description}
            </p>
          ) : null}
        </div>
        {(readingKey != null || right != null) && (
          <div className="flex w-full shrink-0 flex-col gap-4 sm:max-w-md lg:w-auto lg:max-w-[min(100%,20rem)]">
            {readingKey}
            {right ? (
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                {right}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </header>
  );
}
