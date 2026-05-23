import type { ReactNode } from "react";

import type { CopilotSurfaceId } from "@/lib/copilot-surface-status";

// Props kept for backward compatibility — all callers remain unchanged.
export function CopilotPageHeader(_props: {
  eyebrow?: string;
  title: string;
  description?: string;
  right?: ReactNode;
  surfaceId?: CopilotSurfaceId;
  dense?: boolean;
}) {
  return null;
}
