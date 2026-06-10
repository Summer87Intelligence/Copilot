import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";

import { getCopilotSessionCookieClearOptions } from "@/lib/copilot-cookie-options";
import { COPILOT_SESSION_COOKIE } from "@/lib/copilot-session-cookie";
import { POST as logoutPost } from "@/app/api/copilot/logout/route";

describe("POST /api/copilot/logout", () => {
  it("limpia cookie copilot_session", async () => {
    const res = await logoutPost();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(COPILOT_SESSION_COOKIE);

    const clearOpts = getCopilotSessionCookieClearOptions();
    expect(clearOpts.maxAge).toBe(0);
    expect(setCookie).toMatch(/Max-Age=0/i);
  });
});

describe("getCopilotSessionCookieClearOptions", () => {
  it("expira la cookie inmediatamente", () => {
    const opts = getCopilotSessionCookieClearOptions();
    expect(opts.maxAge).toBe(0);
    expect(opts.path).toBe("/");
  });
});
