"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";

import {
  resolveCopilotReadingKey,
  useCopilotReadingKeyOverride,
} from "@/components/copilot/copilot-reading-key-context";

export default function ReadingKeyPanel() {
  const pathname = usePathname();
  const { override } = useCopilotReadingKeyOverride();

  const entry = useMemo(
    () => resolveCopilotReadingKey(pathname, override),
    [pathname, override]
  );

  if (!entry) {
    return null;
  }

  return (
    <aside className="hidden w-[300px] shrink-0 xl:block">
      <div className="sticky top-6">
        <div className="rounded-2xl border border-[var(--copilot-border)] bg-white/80 p-4 shadow-sm backdrop-blur-sm">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--copilot-ink-muted)]">
            {entry.title}
          </div>
          <div className="space-y-2 text-sm leading-relaxed text-[var(--copilot-ink)]">
            {entry.lines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
