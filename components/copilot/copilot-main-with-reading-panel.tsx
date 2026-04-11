"use client";

import type { ReactNode } from "react";

import { CopilotReadingKeyProvider } from "@/components/copilot/copilot-reading-key-context";
import ReadingKeyPanel from "@/components/copilot/ReadingKeyPanel";

export function CopilotMainWithReadingPanel({ children }: { children: ReactNode }) {
  return (
    <CopilotReadingKeyProvider>
      <div className="flex min-h-0 min-w-0 flex-1 gap-6">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
        <ReadingKeyPanel />
      </div>
    </CopilotReadingKeyProvider>
  );
}
