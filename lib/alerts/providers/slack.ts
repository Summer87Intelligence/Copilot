/**
 * Slack alert provider (Incoming Webhooks).
 * Enabled when ALERT_SLACK_WEBHOOK_URL is set.
 */

import type { AlertEvent, AlertDeliveryResult, AlertProvider } from "@/lib/alerts/types";

export class SlackAlertProvider implements AlertProvider {
  readonly type = "slack" as const;

  isEnabled(): boolean {
    return Boolean(process.env.ALERT_SLACK_WEBHOOK_URL?.trim());
  }

  async send(event: AlertEvent): Promise<AlertDeliveryResult> {
    const url = process.env.ALERT_SLACK_WEBHOOK_URL?.trim();
    if (!url) return { provider: this.type, delivered: false, error: "ALERT_SLACK_WEBHOOK_URL not set" };

    const color = event.severity === "critical" ? "#dc2626" : "#d97706";
    const payload = {
      attachments: [
        {
          color,
          title: `[${event.severity.toUpperCase()}] ${event.title}`,
          text: event.body,
          footer: `workspace: ${event.workspace_company_id} | ${event.occurred_at}`,
          fields: event.metadata
            ? Object.entries(event.metadata).slice(0, 5).map(([k, v]) => ({
                title: k,
                value: String(v),
                short: true,
              }))
            : [],
        },
      ],
    };

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        return { provider: this.type, delivered: false, error: `HTTP ${res.status}` };
      }
      return { provider: this.type, delivered: true };
    } catch (e) {
      return { provider: this.type, delivered: false, error: String(e) };
    }
  }
}
