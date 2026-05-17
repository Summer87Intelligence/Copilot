/**
 * Webhook alert provider.
 * Enabled when ALERT_WEBHOOK_URL is set.
 * POSTs the AlertEvent as JSON to the configured URL.
 */

import type { AlertEvent, AlertDeliveryResult, AlertProvider } from "@/lib/alerts/types";

export class WebhookAlertProvider implements AlertProvider {
  readonly type = "webhook" as const;

  isEnabled(): boolean {
    return Boolean(process.env.ALERT_WEBHOOK_URL?.trim());
  }

  async send(event: AlertEvent): Promise<AlertDeliveryResult> {
    const url = process.env.ALERT_WEBHOOK_URL?.trim();
    if (!url) return { provider: this.type, delivered: false, error: "ALERT_WEBHOOK_URL not set" };

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...event }),
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
