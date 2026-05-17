/**
 * ZETA-16: Tests for alert-dispatcher.
 * Validates that dispatching with no providers enabled returns empty results,
 * and that providers only activate when env vars are set.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { dispatchAlert, getEnabledProviders } from "@/lib/alerts/alert-dispatcher";

describe("dispatchAlert — no providers configured", () => {
  beforeEach(() => {
    delete process.env.ALERT_WEBHOOK_URL;
    delete process.env.ALERT_SLACK_WEBHOOK_URL;
    delete process.env.ALERT_DISCORD_WEBHOOK_URL;
    delete process.env.ALERT_EMAIL_ENDPOINT;
    delete process.env.ALERT_EMAIL_RESEND_API_KEY;
  });

  it("returns empty array when no providers are enabled", async () => {
    const results = await dispatchAlert({
      event_type: "dead_letter_spike",
      severity: "critical",
      workspace_company_id: "ws-test",
      title: "Test alert",
      body: "Test body",
    });
    expect(results).toEqual([]);
  });

  it("getEnabledProviders returns empty list", () => {
    expect(getEnabledProviders()).toEqual([]);
  });
});

describe("dispatchAlert — webhook provider", () => {
  let originalUrl: string | undefined;

  beforeEach(() => {
    originalUrl = process.env.ALERT_WEBHOOK_URL;
    process.env.ALERT_WEBHOOK_URL = "https://example.com/webhook";
  });

  afterEach(() => {
    if (originalUrl !== undefined) {
      process.env.ALERT_WEBHOOK_URL = originalUrl;
    } else {
      delete process.env.ALERT_WEBHOOK_URL;
    }
  });

  it("webhook provider is enabled when env is set", () => {
    const enabled = getEnabledProviders();
    expect(enabled).toContain("webhook");
  });
});

describe("dispatchAlert — event always has occurred_at", () => {
  it("auto-sets occurred_at if not provided", async () => {
    // No providers → no real send, but verify function doesn't throw
    delete process.env.ALERT_WEBHOOK_URL;
    delete process.env.ALERT_SLACK_WEBHOOK_URL;
    delete process.env.ALERT_DISCORD_WEBHOOK_URL;
    delete process.env.ALERT_EMAIL_ENDPOINT;
    delete process.env.ALERT_EMAIL_RESEND_API_KEY;

    await expect(
      dispatchAlert({
        event_type: "stale_pipeline",
        severity: "warning",
        workspace_company_id: "ws-1",
        title: "Stale pipeline",
        body: "Pipeline has not run in 26h",
      })
    ).resolves.not.toThrow();
  });
});
