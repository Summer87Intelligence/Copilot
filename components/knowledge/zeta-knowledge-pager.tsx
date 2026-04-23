"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { CopilotGhostButton } from "@/components/copilot/copilot-ui";

export function ZetaKnowledgePager({
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
}: {
  onPrev: () => void;
  onNext: () => void;
  prevDisabled: boolean;
  nextDisabled: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <CopilotGhostButton
        type="button"
        disabled={prevDisabled}
        onClick={onPrev}
        className="gap-1.5 text-xs font-medium"
      >
        <ChevronLeft className="h-4 w-4 shrink-0" />
        Anterior
      </CopilotGhostButton>
      <CopilotGhostButton
        type="button"
        disabled={nextDisabled}
        onClick={onNext}
        className="gap-1.5 text-xs font-medium"
      >
        Siguiente
        <ChevronRight className="h-4 w-4 shrink-0" />
      </CopilotGhostButton>
    </div>
  );
}
