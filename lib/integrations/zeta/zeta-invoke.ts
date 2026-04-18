import { buildZetaConnectionBlock } from "@/lib/integrations/zeta/zeta-connection";
import type { ZetaStaticCredentials } from "@/lib/integrations/zeta/zeta-connection-types";
import type { ZetaCallContext } from "@/lib/integrations/zeta/zeta-http-client";
import { zetaPostJson } from "@/lib/integrations/zeta/zeta-http-client";
import type { loadZetaServerConfig } from "@/lib/integrations/zeta/zeta-config";

export type ZetaServerConfig = ReturnType<typeof loadZetaServerConfig>;

/**
 * Ensambla el patrón estándar ZetaSoftware: `{ [rootInKey]: { Connection, Data } }`.
 * Útil para nuevos endpoints documentados en la colección Postman oficial.
 *
 * @see https://zetasoftware.info/ayuda/apis/soap-y-rest/
 */
export async function zetaInvokeConnectionAndData(
  ctx: ZetaCallContext,
  args: {
    methodName: string;
    /** Ej.: `QuerySaldosPendientesIn` (varía por endpoint). */
    rootInKey: string;
    data: Record<string, unknown>;
    credentials: ZetaStaticCredentials;
    config: ZetaServerConfig;
  }
): Promise<{ status: number; json: unknown; textFallback: string }> {
  const connection = buildZetaConnectionBlock(
    {
      desarrolladorCodigo: args.credentials.desarrolladorCodigo,
      desarrolladorClave: args.credentials.desarrolladorClave,
    },
    {
      empresaCodigo: args.credentials.empresaCodigo,
      empresaClave: args.credentials.empresaClave,
      rolCodigo: args.credentials.rolCodigo,
    }
  );

  const body: Record<string, unknown> = {
    [args.rootInKey]: {
      Connection: connection,
      Data: args.data,
    },
  };

  return zetaPostJson(ctx, {
    baseUrl: args.config.baseUrl,
    methodName: args.methodName,
    body,
    timeoutMs: args.config.timeoutMs,
    maxRetries: args.config.maxRetries,
  });
}
