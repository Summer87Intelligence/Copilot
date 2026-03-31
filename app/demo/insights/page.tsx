import { CopilotPageHeader } from "@/components/copilot/copilot-page-header";
import { CopilotCard, CopilotBadge } from "@/components/copilot/copilot-ui";
import { MOCK_INSIGHTS } from "@/lib/copilot-mock-data";

export default function CopilotInsightsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CopilotPageHeader
        title="Insights"
        description="Historial del razonamiento del copiloto — transparente, trazable y priorizado."
      />

      <div className="flex-1 overflow-auto px-6 py-8">
        <div className="relative mx-auto max-w-3xl">
          <div
            className="absolute bottom-0 left-[15px] top-8 w-px bg-[var(--copilot-border)]"
            aria-hidden
          />
          <ul className="space-y-6">
            {MOCK_INSIGHTS.map((item) => (
              <li key={item.id} className="relative flex gap-5 pl-2">
                <div className="relative z-[1] mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white ring-2 ring-[var(--copilot-border)]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--copilot-accent)]" />
                </div>
                <CopilotCard className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <CopilotBadge
                      tone={
                        item.priority === "Alta"
                          ? "warning"
                          : item.priority === "Media"
                            ? "neutral"
                            : "success"
                      }
                    >
                      Prioridad {item.priority}
                    </CopilotBadge>
                    <CopilotBadge tone="neutral">{item.category}</CopilotBadge>
                    <span className="text-xs text-[var(--copilot-ink-muted)]">
                      {item.date}
                    </span>
                  </div>
                  <h2 className="mt-3 text-base font-semibold text-[var(--copilot-ink)]">
                    {item.title}
                  </h2>
                  <p className="mt-3 text-sm text-[var(--copilot-ink-muted)]">
                    Estado:{" "}
                    <span className="font-medium text-[var(--copilot-ink)]">
                      {item.status}
                    </span>
                  </p>
                </CopilotCard>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
