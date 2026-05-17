/**
 * ZETA-16: Alert system types.
 *
 * Providers are registered via feature flags.
 * No real delivery happens unless the provider is enabled via env vars.
 */

export type AlertProviderType = "email" | "slack" | "discord" | "webhook";

export type AlertEvent = {
  event_type: string;
  severity: "warning" | "critical";
  workspace_company_id: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  occurred_at: string;
};

export type AlertDeliveryResult = {
  provider: AlertProviderType;
  delivered: boolean;
  error?: string;
};

export interface AlertProvider {
  readonly type: AlertProviderType;
  /** Returns false if the provider is not configured (feature-flagged off). */
  isEnabled(): boolean;
  send(event: AlertEvent): Promise<AlertDeliveryResult>;
}
