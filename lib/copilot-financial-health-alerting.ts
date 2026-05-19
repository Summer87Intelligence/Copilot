/**
 * Alerting adapter interfaces for the Financial Health Monitor.
 *
 * Adapters are stubs only — no HTTP calls or side effects are made.
 * Implementations (Slack, email, Discord) should be added per-channel when needed.
 */

import type { FinancialHealthReport } from "./copilot-financial-health";

// ── Adapter contract ──────────────────────────────────────────────────────────

export type AlertChannelAdapter = {
  name: string;
  send(report: FinancialHealthReport): Promise<void>;
};

// ── Slack stub ────────────────────────────────────────────────────────────────

export function createSlackAdapter(webhookUrl?: string): AlertChannelAdapter {
  return {
    name: "slack",
    async send(report) {
      if (!webhookUrl) return;
      // TODO: POST JSON payload to webhookUrl
      // Format: { text: `[${report.severity}] ${report.workspaceCompanyId} — ${report.checks.filter(c => c.severity !== "ok").length} issue(s)` }
      void report;
    },
  };
}

// ── Email stub ────────────────────────────────────────────────────────────────

export function createEmailAdapter(to?: string[]): AlertChannelAdapter {
  return {
    name: "email",
    async send(report) {
      if (!to?.length) return;
      // TODO: Send structured email via Resend / SendGrid
      void report;
    },
  };
}

// ── Discord stub ──────────────────────────────────────────────────────────────

export function createDiscordAdapter(webhookUrl?: string): AlertChannelAdapter {
  return {
    name: "discord",
    async send(report) {
      if (!webhookUrl) return;
      // TODO: POST Discord embed to webhookUrl
      void report;
    },
  };
}

// ── Dashboard stub (no-op — reports are already persisted via zeta_sync_metrics) ──

export function createDashboardAdapter(): AlertChannelAdapter {
  return {
    name: "dashboard",
    async send(_report) {
      // Persistence is handled by the cron endpoint via recordSyncMetric.
      // This adapter is a no-op placeholder for future push-to-dashboard logic.
    },
  };
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

/**
 * Sends the health report to all provided adapters.
 * Only dispatches to channels when overall severity is warning or critical.
 * Errors per adapter are caught and not re-thrown.
 */
export async function dispatchHealthAlerts(
  report: FinancialHealthReport,
  adapters: AlertChannelAdapter[]
): Promise<void> {
  if (report.severity === "ok") return;

  await Promise.allSettled(
    adapters.map((adapter) =>
      adapter.send(report).catch((err) => {
        console.warn(
          JSON.stringify({
            source: "financial-health-alerting",
            kind: "adapter_error",
            adapter: adapter.name,
            workspace: report.workspaceCompanyId,
            error: String(err),
          })
        );
      })
    )
  );
}
