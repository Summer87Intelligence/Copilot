import {
  classifyZetaHttpResponse,
  classifyZetaNetworkError,
  computeBackoffMs,
  parseRetryAfterMs,
} from "@/lib/integrations/zeta/zeta-transport";
import { zetaLog } from "@/lib/integrations/zeta/zeta-log";

export type ZetaCallContext = {
  requestId: string;
  tenantId?: string;
  syncRunId?: string;
};

export class ZetaHttpError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly bodySnippet: string;

  constructor(opts: {
    code: string;
    message: string;
    httpStatus: number;
    bodySnippet: string;
  }) {
    super(opts.message);
    this.name = "ZetaHttpError";
    this.code = opts.code;
    this.httpStatus = opts.httpStatus;
    this.bodySnippet = opts.bodySnippet;
  }
}

function truncateBody(text: string, max = 500): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * POST JSON a `baseUrl/{methodName}` con `Content-Type: application/json`.
 * El `body` debe incluir ya el bloque `Connection` donde corresponda (contrato ZetaSoftware).
 */
export async function zetaPostJson(
  ctx: ZetaCallContext,
  opts: {
    baseUrl: string;
    methodName: string;
    body: unknown;
    timeoutMs: number;
    maxRetries: number;
  }
): Promise<{ status: number; json: unknown; textFallback: string }> {
  const url = `${opts.baseUrl.replace(/\/+$/, "")}/${opts.methodName}`;
  const maxAttempts = opts.maxRetries + 1;
  let lastHttpError: ZetaHttpError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(opts.body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      const classification = classifyZetaHttpResponse(res.status, res.headers);

      zetaLog.info("zeta_http_response", {
        request_id: ctx.requestId,
        zeta_method: opts.methodName,
        tenant_id: ctx.tenantId,
        sync_run_id: ctx.syncRunId,
        zeta_attempt: attempt,
        http_status: res.status,
      });

      if (res.ok) {
        return { status: res.status, json, textFallback: text };
      }

      const httpErr = new ZetaHttpError({
        code: classification.reason,
        message: `Zeta HTTP ${res.status}`,
        httpStatus: res.status,
        bodySnippet: truncateBody(text),
      });

      if (classification.policy === "no_retry") {
        zetaLog.warn("zeta_http_terminal", {
          request_id: ctx.requestId,
          zeta_method: opts.methodName,
          tenant_id: ctx.tenantId,
          sync_run_id: ctx.syncRunId,
          zeta_attempt: attempt,
          http_status: res.status,
          zeta_error_code: classification.reason,
          zeta_error_message: truncateBody(text, 200),
        });
        throw httpErr;
      }

      lastHttpError = httpErr;
      const delayMs =
        classification.delayMs ??
        parseRetryAfterMs(res.headers.get("retry-after")) ??
        computeBackoffMs(attempt);

      zetaLog.warn(
        "zeta_http_retry_scheduled",
        {
          request_id: ctx.requestId,
          zeta_method: opts.methodName,
          tenant_id: ctx.tenantId,
          sync_run_id: ctx.syncRunId,
          zeta_attempt: attempt,
          http_status: res.status,
        },
        httpErr
      );
      await sleep(delayMs);
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof ZetaHttpError) throw e;

      const net = classifyZetaNetworkError(e);
      if (net.policy === "no_retry") {
        zetaLog.error(
          "zeta_request_failed",
          {
            request_id: ctx.requestId,
            zeta_method: opts.methodName,
            tenant_id: ctx.tenantId,
            sync_run_id: ctx.syncRunId,
            zeta_attempt: attempt,
          },
          e
        );
        throw e;
      }

      zetaLog.warn(
        "zeta_network_retry",
        {
          request_id: ctx.requestId,
          zeta_method: opts.methodName,
          tenant_id: ctx.tenantId,
          sync_run_id: ctx.syncRunId,
          zeta_attempt: attempt,
        },
        e
      );
      await sleep(computeBackoffMs(attempt));
    }
  }

  zetaLog.error(
    "zeta_max_retries_exceeded",
    {
      request_id: ctx.requestId,
      zeta_method: opts.methodName,
      tenant_id: ctx.tenantId,
      sync_run_id: ctx.syncRunId,
      zeta_attempt: maxAttempts,
    },
    lastHttpError
  );

  throw (
    lastHttpError ??
    new ZetaHttpError({
      code: "zeta_retries_exhausted",
      message: "Zeta: reintentos agotados.",
      httpStatus: 0,
      bodySnippet: "",
    })
  );
}
