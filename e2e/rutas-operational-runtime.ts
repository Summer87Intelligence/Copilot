import type { Page, Response } from "@playwright/test";

const RUNTIME_API_PATHS = [
  "/api/copilot/rutas-snapshot",
  "/api/copilot/operational-workflows",
  "/api/copilot/operational-events",
] as const;

type RuntimeApiPath = (typeof RUNTIME_API_PATHS)[number];

type RuntimeResponseRecord = {
  path: RuntimeApiPath;
  status: number;
  ok: boolean;
};

function matchesRuntimePath(url: string, path: RuntimeApiPath): boolean {
  return url.includes(path);
}

function collectRuntimeDiagnostics(page: Page): {
  pageErrors: string[];
  consoleErrors: string[];
  responses: RuntimeResponseRecord[];
} {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const responses: RuntimeResponseRecord[] = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("response", (response: Response) => {
    const url = response.url();
    for (const path of RUNTIME_API_PATHS) {
      if (!matchesRuntimePath(url, path)) continue;
      responses.push({ path, status: response.status(), ok: response.ok() });
    }
  });

  return { pageErrors, consoleErrors, responses };
}

async function readMeStatus(page: Page): Promise<number | null> {
  try {
    const response = await page.request.get("/api/copilot/me");
    return response.status();
  } catch {
    return null;
  }
}

function formatRuntimeFailureMessage(input: {
  baseURL: string;
  meStatus: number | null;
  pageErrors: string[];
  consoleErrors: string[];
  responses: RuntimeResponseRecord[];
}): string {
  const lines = [
    "No se observó runtime operacional en /copilot/rutas dentro del timeout.",
    `Base URL: ${input.baseURL}`,
  ];

  if (input.meStatus != null) {
    lines.push(`GET /api/copilot/me -> ${input.meStatus}`);
  }

  if (input.responses.length > 0) {
    lines.push(
      "Respuestas observadas:",
      ...input.responses.map(
        (entry) => `  ${entry.path} -> ${entry.status}${entry.ok ? "" : " (no ok)"}`
      )
    );
  } else {
    lines.push("No hubo respuestas a rutas-snapshot / operational-workflows / operational-events.");
  }

  const chunkFailure = [...input.pageErrors, ...input.consoleErrors].find((message) =>
    /Failed to load chunk|Failed to load resource: the server responded with a status of 500/i.test(
      message
    )
  );
  if (chunkFailure) {
    lines.push(
      "El cliente no hidrató por assets desalineados o 500 en chunks.",
      "Reconstruí con npm run build y reiniciá next start en el mismo puerto antes del smoke.",
      `Detalle: ${chunkFailure}`
    );
  } else if (input.meStatus === 401 || input.meStatus === 403) {
    lines.push(
      "La sesión Copilot no es válida para este entorno.",
      "Configurá PLAYWRIGHT_COPILOT_SESSION o PLAYWRIGHT_COPILOT_USER / PLAYWRIGHT_COPILOT_PIN."
    );
  } else if (input.responses.some((entry) => !entry.ok)) {
    lines.push("Las APIs operativas respondieron pero alguna devolvió status no exitoso.");
  } else {
    lines.push(
      "El test esperaba respuestas ok() de rutas-snapshot, operational-workflows y operational-events."
    );
  }

  return lines.join("\n");
}

export async function waitForOperationalRuntime(page: Page, baseURL: string): Promise<void> {
  const diagnostics = collectRuntimeDiagnostics(page);
  const timeoutMs = 90_000;

  const waits = RUNTIME_API_PATHS.map((path) =>
    page
      .waitForResponse(
        (response) => matchesRuntimePath(response.url(), path) && response.ok(),
        { timeout: timeoutMs }
      )
      .then(() => path)
  );

  const results = await Promise.allSettled(waits);
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  if (fulfilled.length === RUNTIME_API_PATHS.length) {
    return;
  }

  const meStatus = await readMeStatus(page);
  throw new Error(
    formatRuntimeFailureMessage({
      baseURL,
      meStatus,
      pageErrors: diagnostics.pageErrors,
      consoleErrors: diagnostics.consoleErrors,
      responses: diagnostics.responses,
    })
  );
}
