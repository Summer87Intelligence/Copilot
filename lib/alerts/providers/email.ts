/**
 * Email alert provider.
 * Enabled when ALERT_EMAIL_ENDPOINT is set (expects a POST endpoint
 * that accepts { to, subject, body } — e.g. Resend, SendGrid, or a custom relay).
 *
 * Alternatively, use ALERT_EMAIL_RESEND_API_KEY + ALERT_EMAIL_FROM + ALERT_EMAIL_TO
 * for direct Resend integration.
 */

import type { AlertEvent, AlertDeliveryResult, AlertProvider } from "@/lib/alerts/types";

export class EmailAlertProvider implements AlertProvider {
  readonly type = "email" as const;

  isEnabled(): boolean {
    return (
      Boolean(process.env.ALERT_EMAIL_ENDPOINT?.trim()) ||
      Boolean(process.env.ALERT_EMAIL_RESEND_API_KEY?.trim())
    );
  }

  async send(event: AlertEvent): Promise<AlertDeliveryResult> {
    // Resend direct mode
    if (process.env.ALERT_EMAIL_RESEND_API_KEY?.trim()) {
      return this.sendViaResend(event);
    }

    const endpoint = process.env.ALERT_EMAIL_ENDPOINT?.trim();
    if (!endpoint) return { provider: this.type, delivered: false, error: "Email provider not configured" };

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: `[${event.severity.toUpperCase()}] ${event.title}`,
          body: `${event.body}\n\nworkspace: ${event.workspace_company_id}\nevent: ${event.event_type}\nat: ${event.occurred_at}`,
          metadata: event.metadata,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) return { provider: this.type, delivered: false, error: `HTTP ${res.status}` };
      return { provider: this.type, delivered: true };
    } catch (e) {
      return { provider: this.type, delivered: false, error: String(e) };
    }
  }

  private async sendViaResend(event: AlertEvent): Promise<AlertDeliveryResult> {
    const apiKey = process.env.ALERT_EMAIL_RESEND_API_KEY!;
    const from = process.env.ALERT_EMAIL_FROM ?? "alerts@copilot.app";
    const to = process.env.ALERT_EMAIL_TO;
    if (!to) return { provider: this.type, delivered: false, error: "ALERT_EMAIL_TO not set" };

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject: `[${event.severity.toUpperCase()}] ${event.title}`,
          text: `${event.body}\n\nworkspace: ${event.workspace_company_id}\nevent: ${event.event_type}\nat: ${event.occurred_at}`,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) return { provider: this.type, delivered: false, error: `Resend HTTP ${res.status}` };
      return { provider: this.type, delivered: true };
    } catch (e) {
      return { provider: this.type, delivered: false, error: String(e) };
    }
  }
}
