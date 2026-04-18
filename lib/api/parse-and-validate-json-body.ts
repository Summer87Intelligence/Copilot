import type { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";

import { copilotInvalidPayloadResponse } from "@/lib/api/copilot-request-errors";
import { parseJsonBody } from "@/lib/api/parse-json-body";

export type ParsedValidatedResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

export async function parseAndValidateJsonBody<T>(
  request: NextRequest,
  schema: z.ZodType<T>
): Promise<ParsedValidatedResult<T>> {
  const parsed = await parseJsonBody(request);
  if (!parsed.ok) return parsed;
  const result = schema.safeParse(parsed.value);
  if (!result.success) {
    return { ok: false, response: copilotInvalidPayloadResponse(result.error) };
  }
  return { ok: true, data: result.data };
}
