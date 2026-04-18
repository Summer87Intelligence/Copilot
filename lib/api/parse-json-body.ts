import type { NextRequest, NextResponse } from "next/server";

import { copilotInvalidJsonResponse } from "@/lib/api/copilot-request-errors";

export type ParseJsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; response: NextResponse };

export async function parseJsonBody(
  request: NextRequest
): Promise<ParseJsonBodyResult> {
  try {
    const value = await request.json();
    return { ok: true, value };
  } catch {
    return { ok: false, response: copilotInvalidJsonResponse() };
  }
}
