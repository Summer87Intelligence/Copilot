import { NextResponse } from "next/server";

import { MSG_DB_USER } from "@/lib/copilot-data-integrity";
import type { ProtoCrudResult } from "@/lib/copilot-proto-crud-types";

export function nextResponseFromProtoCrud<T>(result: ProtoCrudResult<T>): NextResponse {
  if (result.ok) {
    return NextResponse.json(result);
  }
  const status =
    result.code === "NOT_FOUND"
      ? 404
      : result.code === "INTEGRITY_BLOCK" || result.code === "DUPLICATE_TAX_PERIOD"
        ? 409
        : result.code === "VALIDATION"
          ? 400
          : 500;
  const body =
    result.code === "DATABASE" ? { ...result, message: MSG_DB_USER } : result;
  return NextResponse.json(body, { status });
}
