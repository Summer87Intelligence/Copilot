import { spawnSync } from "node:child_process";

const criticalTests = [
  "lib/copilot-command-center-queue.test.ts",
  "lib/copilot-operational-workflows.test.ts",
  "lib/data/operational-workflows-repository.test.ts",
  "lib/copilot-operational-reconciliation.test.ts",
  "lib/copilot-operational-events.test.ts",
  "lib/copilot-operational-runtime.test.ts",
  "lib/copilot-operational-automation.test.ts",
  "lib/copilot-rutas-snapshot.test.ts",
  "lib/copilot-rutas-snapshot-health.test.ts",
  "lib/copilot-strategic-recommendations.test.ts",
  "lib/copilot-operational-feed.test.ts",
  "lib/copilot-operational-memory.test.ts",
];

const result = spawnSync("npx", ["vitest", "run", ...criticalTests], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
