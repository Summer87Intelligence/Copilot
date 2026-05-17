/**
 * ZETA-16: Alert dispatcher.
 *
 * Registers all providers and dispatches events to all enabled ones.
 * Feature-flag controlled: providers only send if their env vars are set.
 *
 * Design:
 *   - Never throws — all errors are caught and logged.
 *   - Delivers in parallel to all enabled providers.
 *   - No deduplication (callers are responsible for not flooding).
 *
 * Usage:
 *   await dispatchAlert({
 *     event_type: "dead_letter_spike",
 *     severity: "critical",
 *     workspace_company_id: workspaceId,
 *     title: "Dead letter spike detected",
 *     body: "5 new dead letter jobs in the last hour.",
 *   });
 */

import { EmailAlertProvider } from "@/lib/alerts/providers/email";
import { SlackAlertProvider } from "@/lib/alerts/providers/slack";
import { DiscordAlertProvider } from "@/lib/alerts/providers/discord";
import { WebhookAlertProvider } from "@/lib/alerts/providers/webhook";
import type { AlertEvent, AlertDeliveryResult } from "@/lib/alerts/types";

const PROVIDERS = [
  new EmailAlertProvider(),
  new SlackAlertProvider(),
  new DiscordAlertProvider(),
  new WebhookAlertProvider(),
];

/** Returns the list of currently enabled provider types. */
export function getEnabledProviders(): string[] {
  return PROVIDERS.filter((p) => p.isEnabled()).map((p) => p.type);
}

/**
 * Dispatches an alert event to all enabled providers.
 * Returns per-provider delivery results.
 * Never throws.
 */
export async function dispatchAlert(
  input: Omit<AlertEvent, "occurred_at"> & { occurred_at?: string }
): Promise<AlertDeliveryResult[]> {
  const event: AlertEvent = {
    ...input,
    occurred_at: input.occurred_at ?? new Date().toISOString(),
  };

  const enabled = PROVIDERS.filter((p) => p.isEnabled());

  if (enabled.length === 0) {
    console.info(
      JSON.stringify({
        source: "alert-dispatcher",
        kind: "no_providers_enabled",
        event_type: event.event_type,
        workspace_company_id: event.workspace_company_id,
      })
    );
    return [];
  }

  const results = await Promise.allSettled(
    enabled.map((p) =>
      p.send(event).catch((e): AlertDeliveryResult => ({
        provider: p.type,
        delivered: false,
        error: String(e),
      }))
    )
  );

  const deliveryResults: AlertDeliveryResult[] = results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { provider: enabled[i].type, delivered: false, error: String((r as PromiseRejectedResult).reason) }
  );

  const anyFailed = deliveryResults.some((r) => !r.delivered);
  if (anyFailed) {
    console.warn(
      JSON.stringify({
        source: "alert-dispatcher",
        kind: "delivery_partial_failure",
        event_type: event.event_type,
        results: deliveryResults,
      })
    );
  } else {
    console.info(
      JSON.stringify({
        source: "alert-dispatcher",
        kind: "delivered",
        event_type: event.event_type,
        providers: deliveryResults.map((r) => r.provider),
      })
    );
  }

  return deliveryResults;
}
