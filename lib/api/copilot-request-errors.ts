import { NextResponse } from "next/server";
import type { z } from "zod";

const INVALID_JSON_MSG =
  "El cuerpo no es JSON válido. Revisá Content-Type y el formato del body.";

const INVALID_PAYLOAD_MSG =
  "El cuerpo no cumple el contrato esperado. Revisá los campos requeridos y los tipos.";

export const COPILOT_INTERNAL_ERROR_MESSAGE = "Error interno. Intentá de nuevo.";

/** Respuesta 500 genérica — no expone detalle de excepciones ni errores de DB. */
export function copilotInternalErrorResponse(
  extras?: Record<string, unknown>,
  status = 500
): NextResponse {
  return NextResponse.json(
    {
      ok: false as const,
      error: COPILOT_INTERNAL_ERROR_MESSAGE,
      message: COPILOT_INTERNAL_ERROR_MESSAGE,
      ...extras,
    },
    { status }
  );
}

export type CopilotInvalidIssue = {
  path: string;
  message: string;
};

function flattenZodIssues(error: z.ZodError): CopilotInvalidIssue[] {
  return error.issues.map((i) => ({
    path: i.path.length ? i.path.join(".") : "(root)",
    message: i.message,
  }));
}

function summaryFromIssues(issues: CopilotInvalidIssue[]): string {
  if (issues.length === 0) return INVALID_PAYLOAD_MSG;
  const first = issues[0];
  return `${first.path}: ${first.message}`;
}

/** JSON malformado o body no parseable como JSON (400). */
export function copilotInvalidJsonResponse(): NextResponse {
  const message = INVALID_JSON_MSG;
  return NextResponse.json(
    {
      ok: false as const,
      code: "INVALID_JSON" as const,
      message,
      error: message,
    },
    { status: 400 }
  );
}

/** Shape / tipos / campos requeridos según schema Zod (400). */
export function copilotInvalidPayloadResponse(error: z.ZodError): NextResponse {
  const issues = flattenZodIssues(error);
  const message = summaryFromIssues(issues);
  return NextResponse.json(
    {
      ok: false as const,
      code: "INVALID_PAYLOAD" as const,
      message,
      error: message,
      issues,
    },
    { status: 400 }
  );
}
