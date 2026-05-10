import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  redactSensitiveKeys,
  sanitizeLogPayload,
  sanitizeError,
  SENSITIVE_KEYS,
  REDACTED,
} from "./sanitize";
import { createLogger, emitError } from "./logger";
import { createCronLogger } from "./cron-logger";

// ── sanitize.ts ───────────────────────────────────────────────────────────────

describe("redactSensitiveKeys", () => {
  it("redacta claves sensibles conocidas", () => {
    const result = redactSensitiveKeys({
      token: "abc123",
      access_token: "xyz",
      password: "s3cr3t",
      apiKey: "key-123",
    });
    expect(result.token).toBe(REDACTED);
    expect(result.access_token).toBe(REDACTED);
    expect(result.password).toBe(REDACTED);
    expect(result.apiKey).toBe(REDACTED);
  });

  it("preserva claves no sensibles", () => {
    const result = redactSensitiveKeys({
      request_id: "req-1",
      pipeline: "zeta-sync-saldos",
      rows_processed: 100,
      source: "zeta_pipeline",
    });
    expect(result.request_id).toBe("req-1");
    expect(result.pipeline).toBe("zeta-sync-saldos");
    expect(result.rows_processed).toBe(100);
    expect(result.source).toBe("zeta_pipeline");
  });

  it("es case-insensitive en la clave (Token, TOKEN, token → todos redactados)", () => {
    const result = redactSensitiveKeys({
      Token: "abc",
      TOKEN: "def",
      token: "ghi",
    });
    expect(result.Token).toBe(REDACTED);
    expect(result.TOKEN).toBe(REDACTED);
    expect(result.token).toBe(REDACTED);
  });

  it("redacta authorization y cookie", () => {
    const result = redactSensitiveKeys({
      authorization: "Bearer xyz",
      cookie: "session=abc",
    });
    expect(result.authorization).toBe(REDACTED);
    expect(result.cookie).toBe(REDACTED);
  });

  it("devuelve objeto vacío para entrada vacía", () => {
    expect(redactSensitiveKeys({})).toEqual({});
  });

  it("no modifica el objeto original", () => {
    const original = { token: "abc", safe: "ok" };
    redactSensitiveKeys(original);
    expect(original.token).toBe("abc");
  });
});

describe("sanitizeLogPayload", () => {
  it("aplica redacción de claves sensibles", () => {
    const result = sanitizeLogPayload({ secret: "my-secret", rows: 5 });
    expect(result.secret).toBe(REDACTED);
    expect(result.rows).toBe(5);
  });

  it("redacta payload y responseBody", () => {
    const result = sanitizeLogPayload({
      payload: { rawData: "..." },
      responseBody: "...",
      endpoint: "/api/zeta",
    });
    expect(result.payload).toBe(REDACTED);
    expect(result.responseBody).toBe(REDACTED);
    expect(result.endpoint).toBe("/api/zeta");
  });
});

describe("sanitizeError", () => {
  it("serializa un Error correctamente", () => {
    const err = new Error("test error");
    const result = sanitizeError(err);
    expect(result).toMatchObject({ name: "Error", message: "test error" });
  });

  it("serializa null de forma segura", () => {
    const result = sanitizeError(null);
    expect(result).toMatchObject({ message: "null" });
  });

  it("serializa string como fallback", () => {
    const result = sanitizeError("algo salió mal");
    expect(result).toMatchObject({ message: "algo salió mal" });
  });
});

describe("SENSITIVE_KEYS", () => {
  it("incluye todas las claves requeridas por la especificación", () => {
    const required = [
      "token",
      "access_token",
      "refresh_token",
      "authorization",
      "password",
      "secret",
      "credential",
      "cookie",
      "payload",
      "responsebody",
    ];
    for (const key of required) {
      expect(SENSITIVE_KEYS.has(key), `falta clave: ${key}`).toBe(true);
    }
  });
});

// ── logger.ts ─────────────────────────────────────────────────────────────────

describe("createLogger — emisión básica", () => {
  afterEach(() => vi.restoreAllMocks());

  it("emite JSON válido a console.log para nivel info", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const log = createLogger({ source: "test" });
    log.info("test_event");

    expect(spy).toHaveBeenCalledOnce();
    const output = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(output.level).toBe("info");
    expect(output.message).toBe("test_event");
    expect(output.source).toBe("test");
    expect(typeof output.timestamp).toBe("string");
  });

  it("emite a console.warn para nivel warn", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = createLogger();
    log.warn("warn_event");
    const output = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(output.level).toBe("warn");
  });

  it("emite a console.error para nivel error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = createLogger();
    log.error("error_event");
    const output = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(output.level).toBe("error");
  });

  it("incluye campos del contexto predeterminado en cada emisión", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const log = createLogger({ source: "zeta_pipeline", pipeline: "saldos" });
    log.info("ping");
    const output = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(output.source).toBe("zeta_pipeline");
    expect(output.pipeline).toBe("saldos");
  });

  it("fusiona context del call site sobre el contexto predeterminado", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const log = createLogger({ source: "default_source" });
    log.info("event", { source: "override_source", step: "step_1" });
    const output = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(output.source).toBe("override_source");
    expect(output.step).toBe("step_1");
  });

  it("incluye el payload en la salida JSON", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const log = createLogger();
    log.info("pipeline_done", undefined, { rows: 42, status: "succeeded" });
    const output = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(output.rows).toBe(42);
    expect(output.status).toBe("succeeded");
  });

  it("sanitiza claves sensibles del payload automáticamente", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const log = createLogger();
    log.info("event", undefined, { token: "secret-val", rows: 10 });
    const output = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(output.token).toBe(REDACTED);
    expect(output.rows).toBe(10);
  });
});

// ── logger.ts — debug gating ──────────────────────────────────────────────────

describe("createLogger — debug gating", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.COPILOT_LOG_DEBUG;
  });

  it("debug NO emite en producción (sin flag)", () => {
    delete process.env.COPILOT_LOG_DEBUG;
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    // Re-import is not needed since DEBUG_ENABLED is captured at module load.
    // We test the createLogger factory directly by passing a custom override.
    // Note: since DEBUG_ENABLED is a module-level const, we test indirectly via
    // a logger that internally reads the env at call time.
    // For this test, we verify that when COPILOT_LOG_DEBUG is unset, debug is gated.
    // The module was loaded with the env already set in vitest.setup.ts (which doesn't set this),
    // so DEBUG_ENABLED should be false.
    const log = createLogger();
    log.debug("should_not_emit");
    // console.log should NOT be called for debug (unless COPILOT_LOG_DEBUG is set)
    // Since the module-level const was evaluated at load time without the flag, this passes.
    expect(spy).not.toHaveBeenCalled();
  });
});

// ── logger.ts — child ─────────────────────────────────────────────────────────

describe("createLogger — child loggers", () => {
  afterEach(() => vi.restoreAllMocks());

  it("child hereda el contexto del padre", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const parent = createLogger({ source: "parent" });
    const child = parent.child({ step: "child_step" });
    child.info("child_event");
    const output = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(output.source).toBe("parent");
    expect(output.step).toBe("child_step");
  });

  it("child puede sobreescribir campos del padre", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const parent = createLogger({ source: "parent" });
    const child = parent.child({ source: "child_override" });
    child.info("event");
    const output = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(output.source).toBe("child_override");
  });
});

// ── logger.ts — emitError ─────────────────────────────────────────────────────

describe("emitError", () => {
  afterEach(() => vi.restoreAllMocks());

  it("emite nivel error con campo error serializado", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = createLogger({ source: "test" });
    emitError(log, "request_failed", new Error("timeout"));
    const output = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(output.level).toBe("error");
    expect(output.message).toBe("request_failed");
    expect(output.error).toMatchObject({ name: "Error", message: "timeout" });
  });

  it("incluye payload adicional junto con el error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = createLogger();
    emitError(log, "sync_failed", new Error("oops"), undefined, { rows_processed: 5 });
    const output = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(output.rows_processed).toBe(5);
    expect(output.error).toBeDefined();
  });
});

// ── cron-logger.ts ────────────────────────────────────────────────────────────

describe("createCronLogger", () => {
  afterEach(() => vi.restoreAllMocks());

  it("emite JSON con source y cron_run_id correctos", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const log = createCronLogger("zeta-sync-saldos", "run-001");
    log("cron_start");
    const output = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(output.source).toBe("zeta-sync-saldos");
    expect(output.cron_run_id).toBe("run-001");
    expect(output.message).toBe("cron_start");
    expect(output.level).toBe("info");
  });

  it("incluye campos extra del segundo argumento", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const log = createCronLogger("zeta-sync-vouchers", "run-002");
    log("workspace_error", { workspace_id: "ws-abc", error: "timeout" });
    const output = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(output.workspace_id).toBe("ws-abc");
    expect(output.error).toBe("timeout");
  });

  it("sanitiza claves sensibles en extra", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const log = createCronLogger("zeta-sync-contacts", "run-003");
    log("cron_event", { authorization: "Bearer secret", rows: 1 });
    const output = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(output.authorization).toBe(REDACTED);
    expect(output.rows).toBe(1);
  });

  it("emite JSON válido (parseable) en cada llamada", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const log = createCronLogger("zeta-sync-saldos", "run-004");
    log("cron_end", { duration_ms: 1200, status: "succeeded" });
    expect(() => JSON.parse(spy.mock.calls[0]![0] as string)).not.toThrow();
  });

  it("es compatible con el patrón de backward compat (misma firma que log lambda)", () => {
    // El tipo CronLogFn es (kind: string, extra?: Record<string, unknown>) => void
    // Verificar que acepta exactamente esa firma
    const log = createCronLogger("test-pipeline", "run-005");
    expect(() => log("cron_start")).not.toThrow();
    expect(() => log("cron_end", { duration_ms: 500 })).not.toThrow();
    expect(() => log("cron_skipped_overlap", { running_since: "2026-01-01T00:00:00Z", run_id: "abc" })).not.toThrow();
  });
});
