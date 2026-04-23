"use client";

import type { ReactNode } from "react";

export function ZetaKnowledgeLayout({
  header,
  children,
}: {
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-4 sm:p-6">
      {header}
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
