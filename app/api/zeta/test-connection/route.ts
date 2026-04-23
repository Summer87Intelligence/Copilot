import { NextResponse } from "next/server";

import {
  buildZetaConnectionBlock,
  ZetaConfigurationError,
} from "@/lib/integrations/zeta/zeta-connection";

const DEFAULT_ZETA_BASE = "https://api.zetasoftware.com/rest/APIs";

/** Misma operación de solo lectura que usa el resto del proyecto (lista vacía o error de negocio sigue validando transporte + auth). */
const ZETA_READ_TEST_METHOD = "RESTFacturaClienteV4QuerySaldosPendientes";

type ZetaTestConnectionBody = {
  ok: boolean;
  /** HTTP de la llamada a Zeta (si se llegó a ejecutar). */
  httpStatus: number | null;
  zetaMethod: string;
  requestUrl: string;
  /** Texto tal cual devuelto por Zeta (puede ser JSON o HTML de error). */
  rawResponse: string | null;
  /** Cuerpo parseado como JSON, o null si no era JSON válido. */
  parsedJson: unknown | null;
  errors: string[];
};

function trimEnv(key: string): string | undefined {
  const v = process.env[key];
  return typeof v === "string" ? v.trim() || undefined : undefined;
}

function resolveDeveloperCredentials(): { codigo: string; clave: string } | null {
  const codigo =
    trimEnv("ZETA_DEVELOPER_CODE") ?? trimEnv("ZETA_DESARROLLADOR_CODIGO");
  const clave =
    trimEnv("ZETA_DEVELOPER_KEY") ?? trimEnv("ZETA_DESARROLLADOR_CLAVE");
  if (codigo && clave) return { codigo, clave };
  return null;
}

function collectConfigErrors(): string[] {
  const errors: string[] = [];
  if (!trimEnv("ZETA_COMPANY_CODE")) errors.push("Falta ZETA_COMPANY_CODE.");
  if (!trimEnv("ZETA_COMPANY_KEY")) errors.push("Falta ZETA_COMPANY_KEY.");
  if (!trimEnv("ZETA_ROLE_CODE")) errors.push("Falta ZETA_ROLE_CODE.");

  const dev = resolveDeveloperCredentials();
  if (!dev) {
    errors.push(
      "Faltan credenciales de desarrollador: definí ZETA_DEVELOPER_CODE y ZETA_DEVELOPER_KEY, o ZETA_DESARROLLADOR_CODIGO y ZETA_DESARROLLADOR_CLAVE (requerido por el contrato Connection de Zeta)."
    );
  }
  return errors;
}

function buildBody(connection: ReturnType<typeof buildZetaConnectionBlock>) {
  return {
    QuerySaldosPendientesIn: {
      Connection: connection,
      Data: {
        Page: "1",
        Filters: { ClienteCodigo: "__copilot_connection_test__" },
      },
    },
  };
}

export async function GET(): Promise<NextResponse<ZetaTestConnectionBody>> {
  const configErrors = collectConfigErrors();
  if (configErrors.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        httpStatus: null,
        zetaMethod: ZETA_READ_TEST_METHOD,
        requestUrl: "",
        rawResponse: null,
        parsedJson: null,
        errors: configErrors,
      },
      { status: 400 }
    );
  }

  const empresaCodigo = trimEnv("ZETA_COMPANY_CODE")!;
  const empresaClave = trimEnv("ZETA_COMPANY_KEY")!;
  const rolCodigo = trimEnv("ZETA_ROLE_CODE")!;
  const dev = resolveDeveloperCredentials()!;

  const baseUrl = (trimEnv("ZETA_API_BASE_URL") ?? DEFAULT_ZETA_BASE).replace(
    /\/+$/,
    ""
  );
  const url = `${baseUrl}/${ZETA_READ_TEST_METHOD}`;

  let connection: ReturnType<typeof buildZetaConnectionBlock>;
  try {
    connection = buildZetaConnectionBlock(
      { desarrolladorCodigo: dev.codigo, desarrolladorClave: dev.clave },
      {
        empresaCodigo,
        empresaClave,
        rolCodigo,
      }
    );
  } catch (e) {
    const msg =
      e instanceof ZetaConfigurationError
        ? e.message
        : "No se pudo armar el bloque Connection.";
    return NextResponse.json(
      {
        ok: false,
        httpStatus: null,
        zetaMethod: ZETA_READ_TEST_METHOD,
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
      body: JSON.stringify(buildBody(connection)),
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

    return NextResponse.json(
      {
        ok: res.ok && errors.length === 0,
        httpStatus: res.status,
        zetaMethod: ZETA_READ_TEST_METHOD,
        requestUrl: url,
        rawResponse,
        parsedJson,
        errors,
      },
      { status: 200 }
    );
  } catch (e) {
    const message =
      e instanceof Error
        ? e.name === "AbortError"
          ? `Timeout después de ${timeoutMs} ms.`
          : e.message
        : "Error desconocido al llamar a Zeta.";

    return NextResponse.json(
      {
        ok: false,
        httpStatus: null,
        zetaMethod: ZETA_READ_TEST_METHOD,
        requestUrl: url,
        rawResponse: null,
        parsedJson: null,
        errors: [message],
      },
      { status: 200 }
    );
  } finally {
    clearTimeout(timer);
  }
}
