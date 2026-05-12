import { describe, expect, it } from "vitest";

import {
  getCopilotSessionCookieClearOptions,
  getCopilotSessionCookieSecure,
  getCopilotSessionCookieSetOptions,
  getCopilotSessionMaxAgeSeconds,
} from "@/lib/copilot-cookie-options";

describe("copilot-cookie-options", () => {
  it("set and clear options share secure and sameSite", () => {
    const set = getCopilotSessionCookieSetOptions();
    const clear = getCopilotSessionCookieClearOptions();
    expect(set.httpOnly).toBe(true);
    expect(clear.httpOnly).toBe(true);
    expect(set.sameSite).toBe("lax");
    expect(clear.sameSite).toBe("lax");
    expect(set.secure).toBe(clear.secure);
    expect(set.maxAge).toBeGreaterThan(0);
    expect(clear.maxAge).toBe(0);
  });

  it("max age respects SESSION_TTL_SECONDS when valid", () => {
    const prev = process.env.SESSION_TTL_SECONDS;
    try {
      process.env.SESSION_TTL_SECONDS = "3600";
      expect(getCopilotSessionMaxAgeSeconds()).toBe(3600);
    } finally {
      if (prev === undefined) delete process.env.SESSION_TTL_SECONDS;
      else process.env.SESSION_TTL_SECONDS = prev;
    }
  });

  it("COOKIE_SECURE false forces secure false", () => {
    const prev = process.env.COPILOT_SESSION_COOKIE_SECURE;
    try {
      process.env.COPILOT_SESSION_COOKIE_SECURE = "false";
      expect(getCopilotSessionCookieSecure()).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.COPILOT_SESSION_COOKIE_SECURE;
      else process.env.COPILOT_SESSION_COOKIE_SECURE = prev;
    }
  });
});
