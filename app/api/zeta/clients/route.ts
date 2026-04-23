import { NextRequest, NextResponse } from "next/server";

import {
  buildZetaConnectionBlock,
  ZetaConfigurationError,
} from "@/lib/integrations/zeta/zeta-connection";

const DEFAULT_ZETA_BASE = "https://api.zetasoftware.com/rest/APIs";

/** Colección Postman oficial ZetaSoftware (oct-2025): Contactos → RESTContactosV3Query. */
const ZETA_METHOD_LIST_CONTACTS = "RESTContactosV3Query";

type ZetaClientsResponse = {
  ok: boolean;
  httpStatus: number | null;
  requestUrl: string;
  rawResponse: string | null;
  parsedJson: unknown | null;
  errors: string[];
};

function trimEnv(key: string): string | undefined {
  const v = process.env[key];
  return typeof v === "string" ? v.trim() || undefined : undefined;
}

function collectEnvErrors(): string[] {
  const e: string[] = [];
  if (!trimEnv("ZETA_DEVELOPER_CODE")) e.push("Falta ZETA_DEVELOPER_CODE.");
  if (!trimEnv("ZETA_DEVELOPER_KEY")) e.push("Falta ZETA_DEVELOPER_KEY.");
  if (!trimEnv("ZETA_COMPANY_CODE")) e.push("Falta ZETA_COMPANY_CODE.");
  if (!trimEnv("ZETA_COMPANY_KEY")) e.push("Falta ZETA_COMPANY_KEY.");
  if (!trimEnv("ZETA_ROLE_CODE")) e.push("Falta ZETA_ROLE_CODE.");
  return e;
}

function buildQueryBody(
  connection: ReturnType<typeof buildZetaConnectionBlock>,
  opts: { page: string; esCliente: string; search?: string }
) {
  const filters: Record<string, string> = {
    EsCliente: opts.esCliente,
  };
  if (opts.search) filters.Search = opts.search;

  return {
    QueryIn: {
      Connection: connection,
      Data: {
        Page: opts.page,
        Filters: filters,
      },
    },
  };
}

/**
 * GET /api/zeta/clients
 * Solo lectura: primer página de contactos con `EsCliente` (por defecto "S" = clientes).
 * Query opcionales: `page` (default 1), `search` (nombre/razón social), `esCliente` (default S).
 */
export async function GET(request: NextRequest): Promise<NextResponse<ZetaClientsResponse>> {
  const envErrors = collectEnvErrors();
  if (envErrors.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        httpStatus: null,
        requestUrl: "",
        rawResponse: null,
        parsedJson: null,
        errors: envErrors,
      },
      { status: 400 }
    );
  }

  const sp = request.nextUrl.searchParams;
  const page = (sp.get("page") ?? "1").trim() || "1";
  const search = sp.get("search")?.trim();
  const esCliente = (sp.get("esCliente") ?? "S").trim() || "S";

  const baseUrl = (trimEnv("ZETA_API_BASE_URL") ?? DEFAULT_ZETA_BASE).replace(/\/+$/, "");
  const url = `${baseUrl}/${ZETA_METHOD_LIST_CONTACTS}`;

  let connection: ReturnType<typeof buildZetaConnectionBlock>;
  try {
    connection = buildZetaConnectionBlock(
      {
        desarrolladorCodigo: trimEnv("ZETA_DEVELOPER_CODE")!,
        desarrolladorClave: trimEnv("ZETA_DEVELOPER_KEY")!,
      },
      {
        empresaCodigo: trimEnv("ZETA_COMPANY_CODE")!,
        empresaClave: trimEnv("ZETA_COMPANY_KEY")!,
        rolCodigo: trimEnv("ZETA_ROLE_CODE")!,
      }
    );
  } catch (err) {
    const msg =
      err instanceof ZetaConfigurationError
        ? err.message
        : "No se pudo armar el bloque Connection.";
    return NextResponse.json(
      {
        ok: false,
        httpStatus: null,
        requestUrl: url,
        rawResponse: null,
        parsedJson: null,
        errors: [msg],
      },
      { status: 400 }
    );
  }

  const timeoutMs = Math.min(
    120_000,
    Math.max(5_000, Number(process.env.ZETA_REQUEST_TIMEOUT_MS) || 30_000)
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(buildQueryBody(connection, { page, esCliente, search })),
      signal: controller.signal,
      cache: "no-store",
    });

    const rawResponse = await res.text();
    let parsedJson: unknown = null;
    try {
      parsedJson = rawResponse ? JSON.parse(rawResponse) : null;
    } catch {
      parsedJson = null;
    }

    const errors: string[] = [];
    if (!res.ok) {
      errors.push(`Zeta respondió HTTP ${res.status}.`);
    }

    return NextResponse.json({
      ok: res.ok && errors.length === 0,
      httpStatus: res.status,
      requestUrl: url,
      rawResponse,
      parsedJson,
      errors,
    });
  } catch (e) {
    const message =
      e instanceof Error
        ? e.name === "AbortError"
          ? `Timeout después de ${timeoutMs} ms.`
          : e.message
        : "Error desconocido al llamar a Zeta.";
    return NextResponse.json({
      ok: false,
      httpStatus: null,
      requestUrl: url,
      rawResponse: null,
      parsedJson: null,
      errors: [message],
    });
  } finally {
    clearTimeout(timer);
  }
}
