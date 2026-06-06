import { describe, expect, it } from "vitest";

import {
  enforcePdfRateLimit,
  PDF_RATE_LIMIT_MESSAGE,
  resolvePdfRateLimitMaxPerWindow,
} from "@/lib/security/pdf-rate-limit";
import { resetLoginRateLimitStoreForTests } from "@/lib/security/login-rate-limit";

function mockRequest(): import("next/server").NextRequest {
  return new Request("https://example.com/api/copilot/reports/debtors.pdf") as import("next/server").NextRequest;
}

describe("pdf-rate-limit", () => {
  it("permite hasta el máximo configurado por endpoint y usuario", () => {
    resetLoginRateLimitStoreForTests();
    const max = resolvePdfRateLimitMaxPerWindow();
    const req = mockRequest();

    for (let i = 0; i < max; i += 1) {
      expect(enforcePdfRateLimit(req, "reports/debtors", "user-1")).toBeNull();
    }

    const blocked = enforcePdfRateLimit(req, "reports/debtors", "user-1");
    expect(blocked?.status).toBe(429);
  });

  it("429 incluye mensaje claro", async () => {
    resetLoginRateLimitStoreForTests();
    const max = resolvePdfRateLimitMaxPerWindow();
    const req = mockRequest();

    for (let i = 0; i < max; i += 1) {
      enforcePdfRateLimit(req, "reports/debtors", "user-2");
    }

    const blocked = enforcePdfRateLimit(req, "reports/debtors", "user-2");
    const body = (await blocked?.json()) as { error?: string };
    expect(body.error).toBe(PDF_RATE_LIMIT_MESSAGE);
  });

  it("aisla buckets por endpoint", () => {
    resetLoginRateLimitStoreForTests();
    const max = resolvePdfRateLimitMaxPerWindow();
    const req = mockRequest();

    for (let i = 0; i < max; i += 1) {
      enforcePdfRateLimit(req, "reports/debtors", "user-3");
    }
    expect(enforcePdfRateLimit(req, "reports/debtors", "user-3")?.status).toBe(429);
    expect(enforcePdfRateLimit(req, "reports/net-sales", "user-3")).toBeNull();
  });
});
