import { CopilotGhostLink } from "@/components/copilot/copilot-ui";

export function CopilotHoyReturnLink({ className }: { className?: string }) {
  return (
    <CopilotGhostLink
      href="/copilot/hoy"
      className={className ?? "font-semibold text-[var(--copilot-accent)]"}
    >
      Ir a Hoy
    </CopilotGhostLink>
  );
}
