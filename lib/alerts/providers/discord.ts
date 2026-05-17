/**
 * Discord alert provider (Webhook).
 * Enabled when ALERT_DISCORD_WEBHOOK_URL is set.
 */

import type { AlertEvent, AlertDeliveryResult, AlertProvider } from "@/lib/alerts/types";

export class DiscordAlertProvider implements AlertProvider {
  readonly type = "discord" as const;

  isEnabled(): boolean {
    return Boolean(process.env.ALERT_DISCORD_WEBHOOK_URL?.trim());
  }

  async send(event: AlertEvent): Promise<AlertDeliveryResult> {
    const url = process.env.ALERT_DISCORD_WEBHOOK_URL?.trim();
    if (!url) return { provider: this.type, delivered: false, error: "ALERT_DISCORD_WEBHOOK_URL not set" };

    const color = event.severity === "critical" ? 0xdc2626 : 0xd97706;
    const metaFields = event.metadata
      ? Object.entries(event.metadata).slice(0, 5).map(([k, v]) => ({
          name: k,
          value: String(v),
          inline: true,
        }))
      : [];

    const payload = {
      embeds: [
        {
          title: `[${event.severity.toUpperCase()}] ${event.title}`,
          description: event.body,
          color,
          fields: [
            { name: "workspace", value: event.workspace_company_id, inline: true },
            { name: "event_type", value: event.event_type, inline: true },
            ...metaFields,
          ],
          timestamp: event.occurred_at,
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
