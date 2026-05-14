import { invalidateCachedRutasSnapshot } from "@/lib/copilot-rutas-snapshot-cache";

export type OperationalRuntimeInvalidationInput = {
  workspaceCompanyId: string;
  snapshot?: boolean;
  workflows?: boolean;
  timeline?: boolean;
  reason?: string;
};

export function invalidateOperationalRuntime(input: OperationalRuntimeInvalidationInput): void {
  const workspaceCompanyId = input.workspaceCompanyId.trim();
  if (!workspaceCompanyId) return;

  if (input.snapshot !== false) {
    invalidateCachedRutasSnapshot(workspaceCompanyId);
  }

  if (process.env.NODE_ENV !== "development") return;
  console.debug("[copilot-operational-runtime]", {
    workspaceCompanyId,
    snapshot: input.snapshot !== false,
    workflows: input.workflows === true,
    timeline: input.timeline === true,
    reason: input.reason ?? null,
  });
}
