"use client";

import type { ReactNode } from "react";

import { CopilotReadingKeyProvider } from "@/components/copilot/copilot-reading-key-context";

export function CopilotMainWithReadingPanel({ children }: { children: ReactNode }) {
  return (
    <CopilotReadingKeyProvider>
      {children}
    </CopilotReadingKeyProvider>
  );
}
