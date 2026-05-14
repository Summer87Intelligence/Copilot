import { spawnSync } from "node:child_process";

function sessionCookieValue() {
  const value =
    process.env.PLAYWRIGHT_COPILOT_SESSION?.trim() ||
    process.env.COPILOT_E2E_SESSION?.trim() ||
    process.env.TREASURY_SMOKE_COOKIE?.trim();

  if (!value) {
    console.warn(
      "check:smoke:rutas: no se encontró sesión en env vars." +
        " Configurá PLAYWRIGHT_COPILOT_SESSION, COPILOT_E2E_SESSION o TREASURY_SMOKE_COOKIE."
    );
    return "";
  }
  return value;
}

async function assertSmokeServerReady(baseURL) {
  const cookie = sessionCookieValue();
  if (!cookie) return; // sin cookie → el smoke fallará con auth error descriptivo

  const meRes = await fetch(`${baseURL}/api/copilot/me`, {
    headers: { Cookie: `copilot_session=${cookie}` },
  });
  if (!meRes.ok) {
    throw new Error(
      `Preflight auth falló (${meRes.status}) en ${baseURL}/api/copilot/me. Revisá PLAYWRIGHT_COPILOT_SESSION o credenciales E2E.`
    );
  }

  const pageRes = await fetch(`${baseURL}/copilot/rutas`, {
    headers: { Cookie: `copilot_session=${cookie}` },
  });
  if (!pageRes.ok) {
    throw new Error(`Preflight page falló (${pageRes.status}) en ${baseURL}/copilot/rutas.`);
  }

  const html = await pageRes.text();
  const chunkMatch = html.match(/\/_next\/static\/chunks\/[^"'\\s]+\.js/);
  if (!chunkMatch) return;

  const chunkUrl = `${baseURL}${chunkMatch[0]}`;
  const chunkRes = await fetch(chunkUrl);
  if (!chunkRes.ok) {
    throw new Error(
      `Preflight chunk falló (${chunkRes.status}) en ${chunkUrl}. Ejecutá npm run build y reiniciá next start en ${baseURL}.`
    );
  }
}

const baseURL = process.env.PLAYWRIGHT_BASE_URL?.trim();

if (!baseURL) {
  console.warn(
    "check:smoke:rutas: PLAYWRIGHT_BASE_URL no está definido. Se usará http://127.0.0.1:3000."
  );
  console.warn(
    "Para un smoke estable, levantá `npm run build` + `npx next start --port 3005` y exportá PLAYWRIGHT_BASE_URL=http://127.0.0.1:3005."
  );
} else {
  console.log(`check:smoke:rutas: usando PLAYWRIGHT_BASE_URL=${baseURL}`);
  try {
    await assertSmokeServerReady(baseURL);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`check:smoke:rutas: preflight falló: ${message}`);
    process.exit(1);
  }
}

const result = spawnSync(
  "npx",
  ["playwright", "test", "e2e/rutas-command-center-65.spec.ts", "--reporter=list"],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      ...(baseURL ? { PLAYWRIGHT_SKIP_WEBSERVER: "1" } : {}),
    },
  }
);

process.exit(result.status ?? 1);
