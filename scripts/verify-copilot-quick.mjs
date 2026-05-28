#!/usr/bin/env node
/** Verificación rápida: tsc + tests de reportes/collection + build omitido. */
import { spawnSync } from "node:child_process";

const isWin = process.platform === "win32";

function runNpx(args) {
  const result = spawnSync("npx", args, { stdio: "inherit", shell: isWin });
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}

function runNpm(args) {
  const result = spawnSync("npm", args, { stdio: "inherit", shell: isWin });
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}

console.log("Copilot verify (quick)\n");
runNpx(["tsc", "--noEmit"]);
runNpm(["test", "--", "debtors-report", "collection", "lib/copilot-actions"]);
console.log("\n✓ verify:copilot:quick completado\n");
