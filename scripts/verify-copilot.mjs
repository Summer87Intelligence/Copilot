#!/usr/bin/env node
/**
 * Verificación local Copilot — tests por dominio + tsc + build.
 * No modifica datos ni despliega.
 */
import { spawnSync } from "node:child_process";

const isWin = process.platform === "win32";

function run(label, args) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync("npm", ["test", "--", ...args], {
    stdio: "inherit",
    shell: isWin,
  });
  if ((result.status ?? 1) !== 0) {
    console.error(`\n✗ Falló: ${label}`);
    process.exit(result.status ?? 1);
  }
}

function runNpx(label, args) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync("npx", args, {
    stdio: "inherit",
    shell: isWin,
  });
  if ((result.status ?? 1) !== 0) {
    console.error(`\n✗ Falló: ${label}`);
    process.exit(result.status ?? 1);
  }
}

function runNpm(label, args) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync("npm", args, {
    stdio: "inherit",
    shell: isWin,
  });
  if ((result.status ?? 1) !== 0) {
    console.error(`\n✗ Falló: ${label}`);
    process.exit(result.status ?? 1);
  }
}

console.log("Copilot verify — suite crítica\n");

run("vitest treasury", ["treasury"]);
run("vitest hoy", ["hoy"]);
run("vitest collection", ["collection"]);
run("vitest operational-actions", ["operational-actions"]);
run("vitest copilot-agents", ["copilot-agents"]);
run("vitest debtors-report", ["debtors-report"]);
run("vitest account-statement", ["account-statement"]);

runNpx("tsc --noEmit", ["tsc", "--noEmit"]);
runNpm("npm run build", ["run", "build"]);

console.log("\n✓ verify:copilot completado\n");
