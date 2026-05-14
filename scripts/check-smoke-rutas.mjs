import { spawnSync } from "node:child_process";

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
